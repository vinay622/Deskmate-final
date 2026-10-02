import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../../lib/supabase';
import { chunkText, embedText } from '../../../../lib/rag';
import { upsertDocumentChunks } from '../../../../lib/pinecone';

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  if (!locals.user || (locals.userRole !== 'admin' && locals.userRole !== 'staff')) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createSupabaseServerClient(request, cookies);

  try {
    const body = await request.json();
    const url = body.url?.trim();
    const name = body.name?.trim();
    const category = body.category || 'General';
    const description = body.description || '';
    const expiryDate = body.expiry_date || null;

    if (!url) {
      return new Response(JSON.stringify({ ok: false, error: 'URL is required' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!name) {
      return new Response(JSON.stringify({ ok: false, error: 'Document name is required' }), {
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
        status: 'active',
        file_type: 'url',
        file_url: url, // store the scraped url here
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

    // Step 2: Call Firecrawl API
    const apiKey = import.meta.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      await supabase.from('documents').update({ processing_status: 'failed' }).eq('id', doc.id);
      return new Response(JSON.stringify({ ok: false, error: 'FIRECRAWL_API_KEY is not configured.' }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
    }

    let extractedText = '';
    try {
      const fcRes = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          url,
          formats: ['markdown']
        })
      });

      if (!fcRes.ok) {
        const errText = await fcRes.text();
        throw new Error(`Firecrawl API error (${fcRes.status}): ${errText}`);
      }

      const fcData = await fcRes.json();
      if (!fcData.success || !fcData.data || !fcData.data.markdown) {
        throw new Error('Failed to extract markdown from Firecrawl response');
      }

      extractedText = fcData.data.markdown;
    } catch (scrapeErr: any) {
      await supabase.from('documents').update({ processing_status: 'failed' }).eq('id', doc.id);
      return new Response(JSON.stringify({
        ok: true, doc: { ...doc, processing_status: 'failed' },
        warning: 'URL scraped failed: ' + scrapeErr.message,
      }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    }

    if (!extractedText.trim()) {
      await supabase.from('documents').update({ processing_status: 'failed' }).eq('id', doc.id);
      return new Response(JSON.stringify({
        ok: true, doc: { ...doc, processing_status: 'failed' },
        warning: 'No text could be extracted from the URL',
      }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    }

    // Step 3: Chunk the text
    const chunks = chunkText(extractedText, 1000, 200);
    console.log(`[scrape] Created ${chunks.length} chunks from ${url}`);
    extractedText = ''; // free memory

    // Step 4: Generate embeddings (batched internally, 10 at a time)
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

    // Step 5: Upsert chunks + embeddings into Pinecone
    try {
      await upsertDocumentChunks(doc.id, name, category, chunks, embeddings, locals.collegeName ?? '');
    } catch (chunkErr: any) {
      await supabase.from('documents').update({ processing_status: 'failed' }).eq('id', doc.id);
      return new Response(JSON.stringify({
        ok: true, doc: { ...doc, processing_status: 'failed' },
        warning: 'Chunk storage failed: ' + chunkErr.message,
      }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    }

    // Step 6: Mark as ready
    await supabase.from('documents').update({ processing_status: 'ready' }).eq('id', doc.id);

    return new Response(JSON.stringify({
      ok: true,
      doc: { ...doc, processing_status: 'ready' },
      chunks: chunks.length,
    }), { status: 201, headers: { 'Content-Type': 'application/json' } });

  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err.message || 'Internal error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};
