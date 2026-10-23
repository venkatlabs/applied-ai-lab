begin;
-- Morning preparation: which account owns the scheduled work, and the brief it produces. Service role only.
create table if not exists public.equity_accounts (
  owner_hash text primary key check (length(owner_hash) = 64),
  email text not null,
  last_login_at timestamptz not null default now()
);
create table if not exists public.equity_briefs (
  owner_hash text not null check (length(owner_hash) = 64),
  day date not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key (owner_hash, day)
);
alter table public.equity_monitor_runs drop constraint if exists equity_monitor_runs_kind_check;
alter table public.equity_monitor_runs add constraint equity_monitor_runs_kind_check check (kind in ('daily','digest','morning'));
do $$ declare t text; begin
  foreach t in array array['equity_accounts','equity_briefs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;
commit;
