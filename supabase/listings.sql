-- Portal · Publish inventory homes on the public website. Run once in Supabase > SQL Editor, after orgs.sql. Safe to run again.
alter table inventory add column if not exists published boolean not null default false;
alter table inventory add column if not exists published_at timestamptz;
alter table inventory add column if not exists listing jsonb not null default '{}';
  -- { "type": "sale"|"rent"|"multi", "price": 289000, "beds": 3, "baths": 2, "sqft": 1650, "year": 2015,
  --   "area": "Eastside", "desc_en": "...", "desc_es": "...", "photos": ["https://.../1.jpg", ...] }

-- Listing photos: public to read (the website shows them), only the company's team can upload into its own folder.
insert into storage.buckets (id, name, public) values ('listing-photos', 'listing-photos', true)
  on conflict (id) do update set public = true;
drop policy if exists listing_photos_write on storage.objects;
create policy listing_photos_write on storage.objects for insert
  with check (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = (select current_org())::text and (select is_team_writer()));
drop policy if exists listing_photos_change on storage.objects;
create policy listing_photos_change on storage.objects for update
  using (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = (select current_org())::text and (select is_team_writer()));
drop policy if exists listing_photos_delete on storage.objects;
create policy listing_photos_delete on storage.objects for delete
  using (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = (select current_org())::text and (select is_team_writer()));
drop policy if exists listing_photos_read on storage.objects;
create policy listing_photos_read on storage.objects for select using (bucket_id = 'listing-photos');

notify pgrst, 'reload schema';
