-- Migration 48 (2026-11-18): las canciones propias del focus pueden pesar hasta 50 MB (antes 25).
-- Daily focus-drive-importar. Idempotente.
update storage.buckets set file_size_limit = 52428800 where id = 'organiza-music';
