-- Portal · Driving for Dollars: photos taken from the phone on each property. Run once in Supabase > SQL Editor. Safe to run again.
-- Photos are stored in the 'listing-photos' bucket (created by listings.sql) under <company id>/drive/...
alter table parcels add column if not exists photos text[] not null default '{}';
notify pgrst, 'reload schema';
