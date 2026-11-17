-- Migration: audio propio de las canciones del focus (Daily focus-musica-bloqueada-solucion, 17 nov 2026).
-- Idempotente, solo agrega. Cuando YouTube no deja sonar una canción dentro de Master Planner, la persona
-- sube su propio archivo. Bucket PRIVADO: cada uno ve solo lo suyo (carpeta <uid>/). Máx. 25 MB, solo audio.
-- La canción guarda la ruta en su módulo (Video.audio = 'storage:<uid>/<id>.<ext>'); no hace falta tabla.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('organiza-music', 'organiza-music', false, 26214400,
        array['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/ogg', 'audio/webm', 'audio/flac', 'audio/x-flac'])
on conflict (id) do nothing;

drop policy if exists organiza_music_read on storage.objects;
create policy organiza_music_read on storage.objects for select to authenticated
  using (bucket_id = 'organiza-music' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists organiza_music_insert on storage.objects;
create policy organiza_music_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'organiza-music' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists organiza_music_update on storage.objects;
create policy organiza_music_update on storage.objects for update to authenticated
  using (bucket_id = 'organiza-music' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists organiza_music_delete on storage.objects;
create policy organiza_music_delete on storage.objects for delete to authenticated
  using (bucket_id = 'organiza-music' and (storage.foldername(name))[1] = auth.uid()::text);
