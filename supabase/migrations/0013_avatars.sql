-- Guided — profile avatars: an uploaded image OR a chosen background color.
--
-- `avatar_url` already exists on profiles (0001) but was unused; this adds a
-- picked background color as the alternative. Rendering rule (client-side):
-- avatar_url wins when set; otherwise the initial renders on avatar_color, or a
-- deterministic per-user color when that's null too. The two are mutually
-- exclusive in the UI (setting one clears the other).

alter table public.profiles add column if not exists avatar_color text;

-- ---------------------------------------------------------------------------
-- Storage: a public-read bucket for avatar images. Reads are public (so any
-- collaborator can load an avatar by URL); writes are confined to each user's
-- own folder — object names are `{user_id}/avatar`, and (storage.foldername)[1]
-- is that leading user_id segment, checked against auth.uid().
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars_public_read" on storage.objects;
drop policy if exists "avatars_owner_insert" on storage.objects;
drop policy if exists "avatars_owner_update" on storage.objects;
drop policy if exists "avatars_owner_delete" on storage.objects;

create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');

create policy "avatars_owner_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars_owner_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars_owner_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
