-- Trigram similarity for title matching (SPEC §5.3). Must run before the GIN indexes.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
