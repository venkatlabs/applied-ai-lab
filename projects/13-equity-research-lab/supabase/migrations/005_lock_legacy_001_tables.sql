begin;
-- Additive and idempotent. The 001_init tables are not used by application code
-- (all access goes through the service-role key on the 002-004 tables). If 001 was
-- ever applied, they had no RLS, so the public anon key could read and write them.
-- Enable RLS with no policies and remove client roles' access. No data is dropped.
do $$
declare t text;
begin
  foreach t in array array['research_runs','claims','retrospective_results'] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('revoke all on public.%I from anon, authenticated', t);
      execute format('grant select, insert, update, delete on public.%I to service_role', t);
    end if;
  end loop;
end $$;
commit;
