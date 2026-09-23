import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../../lib/supabase';
import { deleteDocumentVectors } from '../../../../lib/pinecone';

export const DELETE: APIRoute = async ({ request, cookies, locals, params }) => {
  if (!locals.user || locals.userRole !== 'admin') {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const id = params.id as string;
  const supabase = createSupabaseServerClient(request, cookies);

  // Get file info before deleting
  const { data: docData } = await supabase
    .from('documents')
    .select('file_url')
    .eq('id', id)
    .single();

  // Delete from storage if file exists
  if (docData?.file_url) {
    const fileName = docData.file_url.split('/').pop();
    if (fileName) {
      await supabase.storage.from('documents').remove([fileName]);
    }
  }

  // Delete Pinecone vectors for this document
  try {
    await deleteDocumentVectors(id);
  } catch (vecErr: any) {
    console.error('Failed to delete Pinecone vectors:', vecErr?.message || vecErr);
  }

  // Delete document row (cascades to chunks via FK)
  const { error } = await supabase.from('documents').delete().eq('id', id);

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};
