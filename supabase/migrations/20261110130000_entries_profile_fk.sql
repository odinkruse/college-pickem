-- Like entries.league_id earlier: give entries a direct key to profiles so the Data API can embed
-- the player's name (review queue, standings). The composite key to league_members still applies.
alter table public.entries
  add constraint entries_profile_id_fkey
  foreign key (profile_id) references public.profiles (id) on delete cascade;
