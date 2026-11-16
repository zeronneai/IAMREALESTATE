-- Portal · Market map (nationwide listings and owner lookups via RentCast). Run once in Supabase > SQL Editor. Safe to run again.
-- Server-side cache so the same search is not paid for twice. Only the server (service role) reads or writes it.
create table if not exists market_cache (
  key text primary key,
  data jsonb not null,
  total int,
  fetched_at timestamptz not null default now()
);
alter table market_cache enable row level security;   -- no policies: not reachable from the browser
create index if not exists market_cache_time_idx on market_cache(fetched_at);
notify pgrst, 'reload schema';
