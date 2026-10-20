begin;
-- Thesis watch: account-owned triggers, their change log, alerts, daily monitor state and weekly digests. Service role only.
create table if not exists public.equity_triggers (
  id uuid primary key default gen_random_uuid(),
  owner_hash text not null check (length(owner_hash) = 64),
  symbol text not null check (symbol ~ '^[A-Z][A-Z.\-]{0,9}$'),
  kind text not null check (kind in ('kill','upgrade')),
  text text not null check (length(text) between 3 and 300),
  metric text not null default 'manual' check (metric in ('manual','price_below','price_above')),
  threshold numeric check (threshold is null or threshold > 0),
  due date,
  status text not null default 'armed' check (status in ('armed','watch','tripped')),
  source text not null default 'user' check (source in ('report','user','hurdle')),
  report_id text,
  evidence text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists equity_triggers_owner on public.equity_triggers(owner_hash, symbol);

create table if not exists public.equity_trigger_log (
  id uuid primary key default gen_random_uuid(),
  owner_hash text not null check (length(owner_hash) = 64),
  symbol text not null,
  trigger_id uuid,
  at timestamptz not null default now(),
  change text not null check (change in ('added','edited','removed','status','seeded')),
  before jsonb,
  after jsonb,
  goalpost boolean not null default false,
  reason text not null default ''
);
create index if not exists equity_trigger_log_owner on public.equity_trigger_log(owner_hash, at desc);

create table if not exists public.equity_alerts (
  id uuid primary key default gen_random_uuid(),
  owner_hash text not null check (length(owner_hash) = 64),
  at timestamptz not null default now(),
  symbol text not null,
  kind text not null check (kind in ('trigger','hurdle','event','verdict')),
  direction text not null check (direction in ('bull','bear','neutral')),
  headline text not null,
  detail text not null default '',
  trigger_id uuid,
  read boolean not null default false
);
create index if not exists equity_alerts_owner on public.equity_alerts(owner_hash, at desc);

create table if not exists public.equity_monitor_state (
  owner_hash text not null check (length(owner_hash) = 64),
  symbol text not null,
  in_buy_zone boolean,
  last_price numeric,
  last_date date,
  updated_at timestamptz not null default now(),
  primary key (owner_hash, symbol)
);

create table if not exists public.equity_monitor_runs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('daily','digest')),
  day date not null,
  summary text not null default '',
  usage jsonb not null default '{}'::jsonb,
  ok boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.equity_digests (
  owner_hash text not null check (length(owner_hash) = 64),
  week_ending date not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key (owner_hash, week_ending)
);

do $$ declare t text; begin
  foreach t in array array['equity_triggers','equity_trigger_log','equity_alerts','equity_monitor_state','equity_monitor_runs','equity_digests'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;
commit;
