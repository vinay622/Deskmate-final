import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../../../lib/supabase';
import { extractText, chunkText, embedText } from '../../../../../lib/rag';
import { upsertDocumentChunks, deleteDocumentVectors } from '../../../../../lib/pinecone';

/**
 * POST /api/admin/documents/{id}/reprocess
 *
 * Re-runs the extraction → chunk → embed → upsert pipeline for a document
 * whose earlier processing failed. The original file is still in Supabase
 * Storage, so no re-upload is needed. Existing Pinecone vectors are wiped
 * first so a partial previous run can't leave stale chunks behind.
 */
export const POST: APIRoute = async ({ request, cookies, locals, params }) => {
  if (!locals.user || (locals.userRole !== 'admin' && locals.userRole !== 'staff')) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const id = params.id as string;
  if (!id) {
    return new Response(JSON.stringify({ ok: false, error: 'Document id is required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createSupabaseServerClient(request, cookies);

  try {
    // Fetch the document — must belong to this admin's college and be re-processable
    const { data: doc, error: fetchErr } = await supabase
      .from('documents')
      .select('id, name, category, file_type, file_url, processing_status, college_name')
      .eq('id', id)
      .eq('college_name', locals.collegeName ?? '')
      .single();

    if (fetchErr || !doc) {
      return new Response(JSON.stringify({ ok: false, error: 'Document not found' }), {
        status: 404, headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!doc.file_url) {
      return new Response(JSON.stringify({
        ok: false,
        error: 'No stored file to reprocess. Please delete this entry and upload the document again.',
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // Mark as processing so the UI reflects the work immediately
    await supabase.from('documents').update({ processing_status: 'processing' }).eq('id', id);

    // Download the original file from Storage.
    // file_url is a public URL ending in /documents/<id>.<ext> — derive the path from it.
    let fileName = doc.file_url.split('/').pop() ?? '';
    // Public URLs may carry query params; strip them
    fileName = fileName.split('?')[0];

    const { data: blob, error: downloadErr } = await supabase.storage
      .from('documents')
      .download(fileName);

    if (downloadErr || !blob) {
      await supabase.from('documents').update({ processing_status: 'failed' }).eq('id', id);
      return new Response(JSON.stringify({
        ok: false,
        error: 'Could not download the stored file. Re-upload the document instead.',
      }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    // Reconstruct a File object for extractText()
    const file = new File([blob], fileName, { type: doc.file_type ?? 'application/octet-stream' });

    // Step 1: Extract text
    let extractedText: string;
    try {
      extractedText = await extractText(file, doc.file_type ?? '');
    } catch (extractErr: any) {
      await supabase.from('documents').update({ processing_status: 'failed' }).eq('id', id);
      return new Response(JSON.stringify({
        ok: false,
        error: 'Text extraction failed again: ' + (extractErr?.message ?? 'unknown'),
      }), { status: 422, headers: { 'Content-Type': 'application/json' } });
    }

    if (!extractedText.trim()) {
      await supabase.from('documents').update({ processing_status: 'failed' }).eq('id', id);
      return new Response(JSON.stringify({
        ok: false,
        error: 'No text could be extracted from the stored file. Try uploading a different format.',
      }), { status: 422, headers: { 'Content-Type': 'application/json' } });
    }

    // Step 2: Chunk
    const chunks = chunkText(extractedText, 1000, 200);
    extractedText = ''; // free memory

    if (chunks.length === 0) {
      await supabase.from('documents').update({ processing_status: 'failed' }).eq('id', id);
      return new Response(JSON.stringify({ ok: false, error: 'Document produced no indexable content.' }), {
        status: 422, headers: { 'Content-Type': 'application/json' },
      });
    }

    // Step 3: Embeddings
    let embeddings: number[][];
    try {
      embeddings = await embedText(chunks.map((c) => c.content));
    } catch (embedErr: any) {
      await supabase.from('documents').update({ processing_status: 'failed' }).eq('id', id);
      return new Response(JSON.stringify({
        ok: false,
        error: 'Embedding generation failed: ' + (embedErr?.message ?? 'unknown'),
      }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    }

    // Step 4: Wipe stale vectors from any partial previous run, then upsert fresh ones
    try {
      await deleteDocumentVectors(id);
      await upsertDocumentChunks(id, doc.name, doc.category, chunks, embeddings, doc.college_name ?? '');
    } catch (vecErr: any) {
      await supabase.from('documents').update({ processing_status: 'failed' }).eq('id', id);
      return new Response(JSON.stringify({
        ok: false,
        error: 'Vector storage failed: ' + (vecErr?.message ?? 'unknown'),
      }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    }

    // Step 5: Success
    await supabase.from('documents').update({ processing_status: 'ready' }).eq('id', id);

    return new Response(JSON.stringify({ ok: true, chunks: chunks.length }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    // Ensure we never leave the doc stuck in "processing"
    await supabase.from('documents').update({ processing_status: 'failed' }).eq('id', id).then(() => { }, () => { });
    return new Response(JSON.stringify({ ok: false, error: err.message || 'Internal error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};
