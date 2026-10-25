begin;
-- Stocks an account follows. Symbols only: no quantities, prices or account identifiers.
create table if not exists public.equity_followed (
  owner_hash text not null check (length(owner_hash) = 64),
  symbol text not null check (symbol ~ '^[A-Z][A-Z.\-]{0,9}$'),
  source text not null default 'follow' check (source in ('follow','holding')),
  created_at timestamptz not null default now(),
  primary key (owner_hash, symbol)
);
alter table public.equity_followed enable row level security;
revoke all on public.equity_followed from anon, authenticated;
grant select, insert, update, delete on public.equity_followed to service_role;
commit;
