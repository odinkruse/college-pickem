-- Hand-resolved sheet cells: "for this entry's week-N slot, the cell '<text>' means this player".
-- Keyed to the cell text, so the override stops applying if someone edits that cell in the sheet.
create table public.pick_import_overrides (
  entry_id bigint not null references public.entries (id) on delete cascade,
  week smallint not null check (week >= 0),
  slot public.pick_slot not null,
  cell_text text not null,
  player_id bigint not null references public.players (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (entry_id, week, slot)
);
alter table public.pick_import_overrides enable row level security;
grant select, insert, update, delete on public.pick_import_overrides to service_role;
