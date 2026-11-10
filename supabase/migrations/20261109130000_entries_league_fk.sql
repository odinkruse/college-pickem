-- entries.league_id was only constrained through the composite (league_id, profile_id) key to
-- league_members, so the Data API couldn't embed entries under leagues. Add the direct key.
alter table public.entries
  add constraint entries_league_id_fkey
  foreign key (league_id) references public.leagues (id) on delete cascade;
