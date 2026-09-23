import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../lib/supabase';

// GET /api/documents/{id}/file — streams a document file to an authenticated
// user within the same college. Needed because the `documents` storage bucket
// is PRIVATE, so stored public URLs are not fetchable; this proxy enforces
// tenancy before handing over bytes.
export const GET: APIRoute = async ({ request, cookies, locals, params }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const docId = params.id;
  if (!docId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(docId)) {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid document id' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createSupabaseServerClient(request, cookies);

  try {
    const { data: doc } = await supabase
      .from('documents')
      .select('college_name, file_type')
      .eq('id', docId)
      .single();

    if (!doc) {
      return new Response(JSON.stringify({ ok: false, error: 'Document not found' }), {
        status: 404, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (locals.userRole !== 'admin' && doc.college_name !== locals.collegeName) {
      return new Response(JSON.stringify({ ok: false, error: 'Forbidden' }), {
        status: 403, headers: { 'Content-Type': 'application/json' },
      });
    }

    // Storage objects are named `{docId}.{ext}` — resolve the exact name since
    // the original extension varies (e.g., .jpg vs .jpeg).
    const { data: objects } = await supabase.storage.from('documents').list('', { search: docId });
    const match = (objects ?? []).find((o) => o.name.startsWith(`${docId}.`));
    if (!match) {
      return new Response(JSON.stringify({ ok: false, error: 'File missing from storage' }), {
        status: 404, headers: { 'Content-Type': 'application/json' },
      });
    }

    const { data: blob, error: dlErr } = await supabase.storage.from('documents').download(match.name);
    if (dlErr || !blob) {
      console.error('Document download failed:', dlErr?.message);
      return new Response(JSON.stringify({ ok: false, error: 'Could not retrieve file' }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
    }

    const safeName = match.name.split('.').pop() ?? 'bin';
    return new Response(blob, {
      status: 200,
      headers: {
        'Content-Type': doc.file_type || blob.type || 'application/octet-stream',
        'Content-Disposition': `inline; filename="document-${safeName}"`,
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err.message || 'Internal error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};
