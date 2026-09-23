import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../lib/supabase';
import { extractText, chunkText, embedText } from '../../../lib/rag';
import { upsertDocumentChunks } from '../../../lib/pinecone';

function computeStatus(expiryDate: string | null): 'active' | 'expiring' | 'expired' {
  if (!expiryDate) return 'active';
  const expiry = new Date(expiryDate);
  const now = new Date();
  const sevenDaysOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  if (expiry < now) return 'expired';
  if (expiry < sevenDaysOut) return 'expiring';
  return 'active';
}

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  if (!locals.user || locals.userRole !== 'admin') {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createSupabaseServerClient(request, cookies);

  try {
    const formData = await request.formData();
    const name = (formData.get('name') as string)?.trim();
    const category = (formData.get('category') as string) || 'General';
    const description = (formData.get('description') as string) || '';
    const expiryDate = (formData.get('expiry_date') as string) || null;
    const file = formData.get('file') as File | null;

    if (!name) {
      return new Response(JSON.stringify({ ok: false, error: 'Document name is required' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!file || file.size === 0) {
      return new Response(JSON.stringify({ ok: false, error: 'A file is required' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    if (file.size > 5 * 1024 * 1024) {
      return new Response(JSON.stringify({ ok: false, error: 'File must be under 5MB' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    // Step 1: Insert document record
    const { data: doc, error: insertErr } = await supabase
      .from('documents')
      .insert({
        name,
        category,
        description,
        uploaded_by_name: locals.userName ?? '',
        expiry_date: expiryDate,
        status: computeStatus(expiryDate),
        file_type: file.type,
        processing_status: 'processing',
        college_name: locals.collegeName ?? '',
      })
      .select()
      .single();

    if (insertErr || !doc) {
      return new Response(JSON.stringify({ ok: false, error: insertErr?.message ?? 'Insert failed' }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
    }

    // Step 2: Upload file to Supabase Storage
    const fileExt = file.name.split('.').pop() || 'bin';
    const storagePath = `${doc.id}.${fileExt}`;

    const { error: uploadErr } = await supabase.storage
      .from('documents')
      .upload(storagePath, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadErr) {
      await supabase.from('documents').delete().eq('id', doc.id);
      return new Response(JSON.stringify({ ok: false, error: 'File upload failed: ' + uploadErr.message }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
    }

    // Update document with file_url
    const { data: urlData } = supabase.storage.from('documents').getPublicUrl(storagePath);
    const fileUrl = urlData?.publicUrl ?? storagePath;
    await supabase.from('documents').update({ file_url: fileUrl }).eq('id', doc.id);

    // Step 3: Extract text from file
    let extractedText: string;
    try {
      extractedText = await extractText(file, file.type);
    } catch (extractErr: any) {
      await supabase.from('documents').update({ processing_status: 'failed' }).eq('id', doc.id);
      return new Response(JSON.stringify({
        ok: true, doc: { ...doc, processing_status: 'failed' },
        warning: 'File uploaded but text extraction failed: ' + extractErr.message,
      }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    }

    if (!extractedText.trim()) {
      await supabase.from('documents').update({ processing_status: 'failed' }).eq('id', doc.id);
      return new Response(JSON.stringify({
        ok: true, doc: { ...doc, processing_status: 'failed' },
        warning: 'No text could be extracted from the file',
      }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    }

    // Step 4: Chunk the text, then release the full text
    const chunks = chunkText(extractedText, 1000, 200);
    console.log(`[documents] Created ${chunks.length} chunks from ${extractedText.length} chars`);
    extractedText = ''; // free memory

    // Step 5: Generate embeddings (batched internally, 10 at a time)
    const chunkTexts = chunks.map((c) => c.content);
    let embeddings: number[][];
    try {
      embeddings = await embedText(chunkTexts);
    } catch (embedErr: any) {
      await supabase.from('documents').update({ processing_status: 'failed' }).eq('id', doc.id);
      return new Response(JSON.stringify({
        ok: true, doc: { ...doc, processing_status: 'failed' },
        warning: 'Embedding generation failed: ' + embedErr.message,
      }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    }

    // Step 6: Upsert chunks + embeddings into Pinecone
    try {
      await upsertDocumentChunks(doc.id, name, category, chunks, embeddings, locals.collegeName ?? '');
    } catch (chunkErr: any) {
      await supabase.from('documents').update({ processing_status: 'failed' }).eq('id', doc.id);
      return new Response(JSON.stringify({
        ok: true, doc: { ...doc, processing_status: 'failed' },
        warning: 'Chunk storage failed: ' + chunkErr.message,
      }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    }

    // Step 7: Mark as ready
    await supabase.from('documents').update({ processing_status: 'ready' }).eq('id', doc.id);

    return new Response(JSON.stringify({
      ok: true,
      doc: { ...doc, processing_status: 'ready', file_url: fileUrl },
      chunks: chunks.length,
    }), { status: 201, headers: { 'Content-Type': 'application/json' } });

  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err.message || 'Internal error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};
