-- Change record_embeddings vector dimension from 1536 to 768.
--
-- The original RAG migration used 1536 dims (OpenAI text-embedding-3-small).
-- Switching to Ollama nomic-embed-text (768 dims) for fully local RAG.
--
-- This drops existing embeddings (they were generated with the wrong
-- dimensionality for the new provider) and recreates the column + index.
-- Re-index after applying this migration.

-- Drop the HNSW index first (can't alter a vector column with an index).
drop index if exists public.record_embeddings_embedding_idx;

-- Clear existing embeddings — they're incompatible with the new dimension.
delete from public.record_embeddings;

-- Alter the vector column to 768 dimensions.
alter table public.record_embeddings
  alter column embedding type extensions.vector(768)
  using embedding::extensions.vector(768);

-- Update the comment.
comment on column public.record_embeddings.embedding is
  '768-dimensional embedding vector (Ollama nomic-embed-text).';

-- Recreate the HNSW index.
create index if not exists record_embeddings_embedding_idx
  on public.record_embeddings using hnsw
    (embedding extensions.vector_cosine_ops)
  with (m = 16, ef_construction = 64);
