create table public.ops_sites (
  id uuid primary key default gen_random_uuid(),
  code text not null unique, name text not null, region text not null, state text not null,
  lat double precision not null, lng double precision not null,
  status text not null default 'normal' check (status in ('normal','maintenance','alarm')),
  last_alert text, last_alert_at timestamptz, equipment text, access_notes text,
  created_at timestamptz not null default now());
create table public.ops_technicians (
  id uuid primary key default gen_random_uuid(),
  name text not null, call_sign text not null unique, region text not null, phone text,
  availability text not null default 'available' check (availability in ('available','on_task','off_duty')),
  lat double precision not null, lng double precision not null,
  created_at timestamptz not null default now());
create table public.ops_tasks (
  id uuid primary key default gen_random_uuid(),
  task_code text not null unique, title text not null, description text not null default '',
  type text not null check (type in ('CM','PM','GPM')),
  status text not null default 'new' check (status in ('new','dispatched','in_progress','on_hold','completed','cancelled')),
  priority text not null default 'medium' check (priority in ('critical','high','medium','low')),
  site_id uuid not null references public.ops_sites(id) on delete cascade,
  technician_id uuid references public.ops_technicians(id) on delete set null,
  equipment text, due_at timestamptz, escalated_at timestamptz, completed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.ops_task_activity (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.ops_tasks(id) on delete cascade,
  actor text not null, message text not null,
  category text not null check (category in ('field_update','note','status_change','escalation')),
  created_at timestamptz not null default now());
create table public.ops_field_reports (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.ops_tasks(id) on delete cascade,
  technician_name text not null, hour_meter numeric, fuel_level_pct numeric, battery_voltage numeric,
  checklist jsonb not null default '{}'::jsonb, photos text[] not null default '{}', notes text,
  created_at timestamptz not null default now());
do $$ declare t text; begin
 foreach t in array array['ops_sites','ops_technicians','ops_tasks','ops_task_activity','ops_field_reports'] loop
  execute format('grant select, insert, update, delete on public.%I to anon, authenticated', t);
  execute format('grant all on public.%I to service_role', t);
  execute format('alter table public.%I enable row level security', t);
  execute format('create policy "ops desk access" on public.%I for all to anon, authenticated using (true) with check (true)', t);
 end loop; end $$;
alter publication supabase_realtime add table public.ops_sites, public.ops_tasks, public.ops_task_activity;

insert into public.ops_sites (code,name,region,state,lat,lng,status,last_alert,last_alert_at,equipment,access_notes) values
('ABV-083','Gwarinpa Ridge','Abuja Metro','FCT',9.1100,7.4000,'maintenance','Planned PM window',now()-interval '2 hours','Nokia Flexi BTS','Gate key at estate security'),
('ABV-021','Wuse Zone 4','Abuja Metro','FCT',9.0700,7.4800,'normal',null,null,'Huawei BBU3900','24/7 access'),
('ABV-047','Garki Area 11','Abuja Metro','FCT',9.0300,7.4900,'normal','Door open alarm cleared',now()-interval '1 day','Ericsson RBS 6000','Rooftop, call landlord'),
('LAG-214','Ajegunle Macro 1','Lagos West','Lagos',6.4500,3.3400,'alarm','Sector 2 VSWR high',now()-interval '40 minutes','Ericsson RBS 6102','Escort required after 18:00'),
('LAG-105','Ikeja GRA','Lagos West','Lagos',6.5800,3.3500,'normal',null,null,'Nokia AirScale','24/7 access'),
('LAG-332','Lekki Phase 1','Lagos East','Lagos',6.4400,3.4700,'alarm','Mains failure – on battery',now()-interval '15 minutes','Huawei BBU5900','Estate permit needed'),
('KAN-117','Tarauni North','Kano Central','Kano',11.9700,8.5300,'alarm','Generator low fuel – critical',now()-interval '25 minutes','Perkins 20kVA genset','Fuel truck access via north gate'),
('KAN-062','Sabon Gari','Kano Central','Kano',12.0000,8.5300,'maintenance','Rectifier module swap',now()-interval '3 hours','Eltek Flatpack2','Daylight only'),
('PHC-009','Rumuola','Rivers','Rivers',4.8400,7.0100,'normal',null,null,'Nokia Flexi BTS','24/7 access'),
('ENU-031','Independence Layout','Enugu','Enugu',6.4500,7.5100,'normal',null,null,'ZTE ZXSDR','Call caretaker');

insert into public.ops_technicians (name,call_sign,region,phone,availability,lat,lng) values
('Amina Yusuf','ALPHA-1','Abuja Metro','+234 803 111 2233','available',9.0800,7.4500),
('Chinyere Okafor','LIMA-2','Lagos West','+234 805 222 3344','on_task',6.4600,3.3600),
('Ibrahim Sani','KILO-3','Kano Central','+234 807 333 4455','available',11.9900,8.5100),
('Tunde Bakare','LIMA-4','Lagos East','+234 809 444 5566','available',6.4700,3.5000);

insert into public.ops_tasks (task_code,title,description,type,status,priority,site_id,technician_id,equipment,due_at) values
('CM-26-0001','Sector 2 VSWR alarm','Inspect feeder line and sector return loss.','CM','in_progress','high',(select id from ops_sites where code='LAG-214'),(select id from ops_technicians where call_sign='LIMA-2'),'Ericsson RBS 6102',now()+interval '1 hour'),
('PM-26-0002','Quarterly BTS inspection','Complete the scheduled visual inspection, alarm review, and grounding checks.','PM','new','medium',(select id from ops_sites where code='ABV-083'),(select id from ops_technicians where call_sign='ALPHA-1'),'Nokia Flexi BTS',now()+interval '20 hours'),
('GPM-26-0003','Generator oil and load test','Generator PM: oil change, load test, fuel check.','GPM','new','critical',(select id from ops_sites where code='KAN-117'),null,'Perkins 20kVA genset',now()+interval '3 hours'),
('CM-26-0004','Mains failure – site on battery','Restore power or deploy mobile generator.','CM','dispatched','critical',(select id from ops_sites where code='LAG-332'),(select id from ops_technicians where call_sign='LIMA-4'),'Huawei BBU5900',now()+interval '2 hours');

insert into public.ops_task_activity (task_id,actor,message,category) values
((select id from ops_tasks where task_code='CM-26-0001'),'Chinyere Okafor','On site. Inspecting feeder line and checking sector return loss.','field_update'),
((select id from ops_tasks where task_code='PM-26-0002'),'Amina Yusuf','Task dispatched. Site access confirmed for the morning window.','field_update'),
((select id from ops_tasks where task_code='GPM-26-0003'),'Operations Desk','Generator PM work order queued; dispatch technician and confirm fuel availability.','note');