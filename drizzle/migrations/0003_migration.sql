create table public.ops_site_events (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.ops_sites(id) on delete cascade,
  old_status text, new_status text not null,
  created_at timestamptz not null default now());
grant select, insert on public.ops_site_events to anon, authenticated;
grant all on public.ops_site_events to service_role;
alter table public.ops_site_events enable row level security;
create policy "ops desk read" on public.ops_site_events for select to anon, authenticated using (true);
create or replace function public.log_site_status() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    insert into public.ops_site_events(site_id, old_status, new_status) values (new.id, old.status, new.status);
  end if;
  return new;
end $$;
create trigger ops_sites_status_log after update on public.ops_sites for each row execute function public.log_site_status();
alter table public.ops_sites replica identity full;
alter publication supabase_realtime add table public.ops_site_events;
insert into public.ops_site_events(site_id, old_status, new_status, created_at)
select id, 'normal', status, coalesce(last_alert_at, now()) from public.ops_sites where status <> 'normal';