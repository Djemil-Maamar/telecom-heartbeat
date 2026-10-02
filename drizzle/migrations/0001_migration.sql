alter table public.ops_sites add column updated_at timestamptz not null default now();
create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = public as $$ begin new.updated_at = now(); return new; end $$;
create trigger ops_sites_touch before update on public.ops_sites for each row execute function public.touch_updated_at();
create trigger ops_tasks_touch before update on public.ops_tasks for each row execute function public.touch_updated_at();