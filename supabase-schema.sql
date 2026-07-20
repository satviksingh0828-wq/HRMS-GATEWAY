-- ============================================================
-- Attendance Gateway schema. Run this in the Supabase SQL editor.
-- Project: https://ybwwecihgssnhlptdodv.supabase.co
-- ============================================================

-- Departments (one row per department). device_id + device_password are
-- the fixed credentials the department's local device uses to fetch its
-- rotating 10-digit code.
create table if not exists public.departments (
    id uuid primary key default gen_random_uuid(),
    name text not null unique,
    latitude double precision,
    longitude double precision,
    device_id uuid not null unique default gen_random_uuid(),
    device_password text not null default encode(gen_random_bytes(12), 'hex'),
    created_at timestamptz not null default now()
);

-- Employees. employee_number is the identifier the client apps use.
create table if not exists public.employees (
    id uuid primary key default gen_random_uuid(),
    employee_number text not null unique,
    name text not null,
    department_id uuid not null references public.departments(id) on delete cascade,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists employees_department_idx on public.employees(department_id);

-- Rotating verification code per department (regenerated on demand
-- every 10 minutes by the server).
create table if not exists public.department_codes (
    department_id uuid primary key references public.departments(id) on delete cascade,
    code text not null,
    rotated_at timestamptz not null default now()
);

-- Attendance log. Retention is 3 days (cleanup trigger below).
create table if not exists public.attendance_logs (
    id uuid primary key default gen_random_uuid(),
    employee_id uuid not null references public.employees(id) on delete cascade,
    department_id uuid not null references public.departments(id) on delete cascade,
    kind text not null check (kind in ('check_in','check_out')),
    logged_at timestamptz not null default now()
);

create index if not exists attendance_logs_emp_idx on public.attendance_logs(employee_id, logged_at desc);
create index if not exists attendance_logs_time_idx on public.attendance_logs(logged_at);

-- Auto-prune anything older than 3 days on each insert.
create or replace function public.prune_old_attendance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    delete from public.attendance_logs where logged_at < now() - interval '3 days';
    return null;
end;
$$;

drop trigger if exists attendance_prune_trg on public.attendance_logs;
create trigger attendance_prune_trg
after insert on public.attendance_logs
for each statement execute function public.prune_old_attendance();

-- Grants: this API is called only by the service role from our gateway.
-- No anon / authenticated access needed — RLS stays enabled and denies by default.
alter table public.departments enable row level security;
alter table public.employees enable row level security;
alter table public.department_codes enable row level security;
alter table public.attendance_logs enable row level security;

grant all on public.departments to service_role;
grant all on public.employees to service_role;
grant all on public.department_codes to service_role;
grant all on public.attendance_logs to service_role;