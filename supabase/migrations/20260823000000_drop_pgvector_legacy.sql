-- ============================================================
-- DeskMate — Remove legacy pgvector RAG setup (superseded by Pinecone)
-- Migration: 20260823000000_drop_pgvector_legacy.sql
--
-- document_chunks / match_chunks were created by 20260305030000_rag_setup.sql
-- but production retrieval uses Pinecone exclusively. Nothing in src/ references them.
-- The documents table columns and storage bucket from that migration remain in use.
-- ============================================================

DROP FUNCTION IF EXISTS public.match_chunks(extensions.vector(768), FLOAT, INT);
DROP TABLE IF EXISTS public.document_chunks;

-- Note: the `vector` extension is left installed (harmless) in case it is needed later.
