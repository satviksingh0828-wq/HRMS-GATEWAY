-- ============================================================
-- Addendum: run this AFTER supabase-schema.sql (safe to re-run).
-- Adds soft-delete flags so repeat panel syncs handle
-- new / removed employees & departments without breaking
-- attendance history (FKs stay intact).
-- ============================================================

alter table public.employees
    add column if not exists is_active boolean not null default true;

alter table public.departments
    add column if not exists is_active boolean not null default true;

create index if not exists employees_active_idx
    on public.employees(is_active);
