begin;
-- Moves rows from an anonymous per-browser workspace onto a signed-in account. Service role only.
create or replace function public.equity_claim_workspace(old_hash text, new_hash text) returns integer
language plpgsql security definer set search_path = public as $$
declare moved integer := 0; n integer;
begin
  if length(old_hash) <> 64 or length(new_hash) <> 64 or old_hash = new_hash then return 0; end if;
  update public.equity_snapshots set owner_hash = new_hash where owner_hash = old_hash; get diagnostics n = row_count; moved := moved + n;
  update public.equity_portfolio_snapshots set owner_hash = new_hash where owner_hash = old_hash; get diagnostics n = row_count; moved := moved + n;
  update public.equity_web_research set owner_hash = new_hash where owner_hash = old_hash;
  return moved;
end;
$$;
revoke all on function public.equity_claim_workspace(text, text) from public, anon, authenticated;
grant execute on function public.equity_claim_workspace(text, text) to service_role;
commit;
