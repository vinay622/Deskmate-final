-- ============================================================
-- DeskMate — RAG: pgvector, document_chunks, storage, RPC
-- Migration: 20260305030000_rag_setup.sql
-- ============================================================

-- Step 1: Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- Step 2: ALTER documents table — add file-related columns
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS file_url TEXT,
  ADD COLUMN IF NOT EXISTS file_type TEXT,
  ADD COLUMN IF NOT EXISTS processing_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (processing_status IN ('pending', 'processing', 'ready', 'failed'));

-- Step 3: Create document_chunks table
CREATE TABLE IF NOT EXISTS public.document_chunks (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id   UUID REFERENCES public.documents(id) ON DELETE CASCADE NOT NULL,
  chunk_index   INTEGER NOT NULL,
  content       TEXT NOT NULL,
  embedding     extensions.vector(768),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS document_chunks_document_id_idx
  ON public.document_chunks (document_id);

ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read chunks (needed for RAG search)
CREATE POLICY "Authenticated users can read document_chunks"
  ON public.document_chunks FOR SELECT
  USING (auth.role() = 'authenticated');

-- Only admins can insert / update / delete chunks
CREATE POLICY "Admins can manage document_chunks"
  ON public.document_chunks FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Step 4: RPC function for vector similarity search
CREATE OR REPLACE FUNCTION public.match_chunks(
  query_embedding extensions.vector(768),
  match_threshold FLOAT DEFAULT 0.5,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  document_id UUID,
  chunk_index INTEGER,
  content TEXT,
  similarity FLOAT,
  document_name TEXT,
  document_category TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.document_id,
    dc.chunk_index,
    dc.content,
    (1 - (dc.embedding <=> query_embedding))::FLOAT AS similarity,
    d.name AS document_name,
    d.category AS document_category
  FROM public.document_chunks dc
  JOIN public.documents d ON d.id = dc.document_id
  WHERE d.processing_status = 'ready'
    AND (1 - (dc.embedding <=> query_embedding)) > match_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Step 5: Supabase Storage bucket for document files
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  false,
  10485760,
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'image/png',
    'image/jpeg',
    'image/webp'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Admins can upload documents"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'documents'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Authenticated users can read document files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'documents'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Admins can delete document files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'documents'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
