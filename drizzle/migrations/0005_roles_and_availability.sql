create type public.app_role as enum ('admin', 'supervisor', 'technician');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role public.app_role not null,
  unique (user_id, role));
grant select, insert, delete on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create table public.profiles (
  user_id uuid primary key,
  email text, display_name text,
  technician_id uuid unique references public.ops_technicians(id) on delete set null,
  created_at timestamptz not null default now());
grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.ops_tech_availability (
  id uuid primary key default gen_random_uuid(),
  technician_id uuid not null references public.ops_technicians(id) on delete cascade,
  starts_at timestamptz not null, ends_at timestamptz not null,
  kind text not null default 'off' check (kind in ('off','leave','training','standby')),
  note text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at));
grant select, insert, update, delete on public.ops_tech_availability to authenticated;
grant all on public.ops_tech_availability to service_role;
alter table public.ops_tech_availability enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role) $$;
create or replace function public.is_dispatcher(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role in ('admin','supervisor')) $$;
create or replace function public.my_technician_id()
returns uuid language sql stable security definer set search_path = public as $$
  select technician_id from public.profiles where user_id = auth.uid() $$;
create or replace function public.has_any_role(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id) $$;

create policy "own roles or admin" on public.user_roles for select to authenticated using (user_id = auth.uid() or public.is_dispatcher(auth.uid()));
create policy "admin grants" on public.user_roles for insert to authenticated with check (public.has_role(auth.uid(),'admin'));
create policy "admin revokes" on public.user_roles for delete to authenticated using (public.has_role(auth.uid(),'admin'));

create policy "own or dispatcher read" on public.profiles for select to authenticated using (user_id = auth.uid() or public.is_dispatcher(auth.uid()));
create policy "admin edits profiles" on public.profiles for update to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- Replace open demo policies with role-based ones
drop policy "ops desk access" on public.ops_sites;
drop policy "ops desk access" on public.ops_technicians;
drop policy "ops desk access" on public.ops_tasks;
drop policy "ops desk access" on public.ops_task_activity;
drop policy "ops desk access" on public.ops_field_reports;
drop policy "ops desk read" on public.ops_site_events;
revoke all on public.ops_sites, public.ops_technicians, public.ops_tasks, public.ops_task_activity, public.ops_field_reports, public.ops_site_events from anon;

create policy "staff read sites" on public.ops_sites for select to authenticated using (public.has_any_role(auth.uid()));
create policy "dispatch writes sites" on public.ops_sites for insert to authenticated with check (public.is_dispatcher(auth.uid()));
create policy "dispatch updates sites" on public.ops_sites for update to authenticated using (public.is_dispatcher(auth.uid())) with check (public.is_dispatcher(auth.uid()));
create policy "admin deletes sites" on public.ops_sites for delete to authenticated using (public.has_role(auth.uid(),'admin'));

create policy "staff read techs" on public.ops_technicians for select to authenticated using (public.has_any_role(auth.uid()));
create policy "dispatch writes techs" on public.ops_technicians for insert to authenticated with check (public.is_dispatcher(auth.uid()));
create policy "dispatch or self updates tech" on public.ops_technicians for update to authenticated using (public.is_dispatcher(auth.uid()) or id = public.my_technician_id()) with check (public.is_dispatcher(auth.uid()) or id = public.my_technician_id());
create policy "admin deletes techs" on public.ops_technicians for delete to authenticated using (public.has_role(auth.uid(),'admin'));

create policy "dispatch or assignee reads tasks" on public.ops_tasks for select to authenticated using (public.is_dispatcher(auth.uid()) or technician_id = public.my_technician_id());
create policy "dispatch creates tasks" on public.ops_tasks for insert to authenticated with check (public.is_dispatcher(auth.uid()));
create policy "dispatch or assignee updates tasks" on public.ops_tasks for update to authenticated using (public.is_dispatcher(auth.uid()) or technician_id = public.my_technician_id()) with check (public.is_dispatcher(auth.uid()) or technician_id = public.my_technician_id());
create policy "admin deletes tasks" on public.ops_tasks for delete to authenticated using (public.has_role(auth.uid(),'admin'));

create policy "visible task activity" on public.ops_task_activity for select to authenticated using (exists (select 1 from public.ops_tasks t where t.id = task_id));
create policy "visible task activity insert" on public.ops_task_activity for insert to authenticated with check (exists (select 1 from public.ops_tasks t where t.id = task_id));

create policy "visible task reports" on public.ops_field_reports for select to authenticated using (exists (select 1 from public.ops_tasks t where t.id = task_id));
create policy "visible task reports insert" on public.ops_field_reports for insert to authenticated with check (exists (select 1 from public.ops_tasks t where t.id = task_id));

create policy "staff read site events" on public.ops_site_events for select to authenticated using (public.has_any_role(auth.uid()));

create policy "staff read availability" on public.ops_tech_availability for select to authenticated using (public.has_any_role(auth.uid()));
create policy "dispatch or self adds availability" on public.ops_tech_availability for insert to authenticated with check (public.is_dispatcher(auth.uid()) or technician_id = public.my_technician_id());
create policy "dispatch or self edits availability" on public.ops_tech_availability for update to authenticated using (public.is_dispatcher(auth.uid()) or technician_id = public.my_technician_id()) with check (public.is_dispatcher(auth.uid()) or technician_id = public.my_technician_id());
create policy "dispatch or self removes availability" on public.ops_tech_availability for delete to authenticated using (public.is_dispatcher(auth.uid()) or technician_id = public.my_technician_id());

drop policy "field photos read" on storage.objects;
drop policy "field photos upload" on storage.objects;
create policy "field photos read" on storage.objects for select to authenticated using (bucket_id = 'field-photos' and public.has_any_role(auth.uid()));
create policy "field photos upload" on storage.objects for insert to authenticated with check (bucket_id = 'field-photos' and public.has_any_role(auth.uid()));

alter publication supabase_realtime add table public.ops_tech_availability;

insert into public.ops_tech_availability (technician_id, starts_at, ends_at, kind, note)
select id, date_trunc('day', now()) + interval '1 day 8 hours', date_trunc('day', now()) + interval '1 day 17 hours', 'training', 'Formation sécurité hauteur'
from public.ops_technicians where call_sign = 'KILO-3';