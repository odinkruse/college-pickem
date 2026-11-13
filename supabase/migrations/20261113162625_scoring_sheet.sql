-- The league's hand-kept scoring sheet ("CFB Fantasy Scoring <year>"), used only to compare scores.
alter table public.league_seasons add column scoring_sheet_id text;

update public.league_seasons ls set scoring_sheet_id = '1A-2PeQrUOUlL08UJACDxjNPV60FB7_kV12-p6GS7FG0'
from public.leagues l, public.seasons s
where ls.league_id = l.id and ls.season_id = s.id and l.slug = 'main' and s.year = 2026;
