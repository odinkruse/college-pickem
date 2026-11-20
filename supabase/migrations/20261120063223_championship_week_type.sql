-- Championship week: the league's last week, when anyone playing may be picked again.
-- (A new enum value can't be used in the transaction that adds it, so it gets its own migration.)
alter type public.week_rule add value if not exists 'championship';
