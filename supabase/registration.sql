-- Explicit email allowlist for first access. Confirmation is required.
begin;
create table if not exists public.inventory_approved_emails (
  email text primary key check(email=lower(btrim(email))),
  name text not null check(length(btrim(name)) between 1 and 140)
);
alter table public.inventory_approved_emails enable row level security;
revoke all on public.inventory_approved_emails from public,anon,authenticated;

create or replace function public.inventory_enroll_confirmed_user()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.email_confirmed_at is not null then
    insert into public.inventory_members(user_id,name)
      select new.id, approved.name from public.inventory_approved_emails approved
      where approved.email=lower(btrim(new.email))
      on conflict(user_id) do nothing;
  end if;
  return new;
end $$;
revoke all on function public.inventory_enroll_confirmed_user() from public,anon,authenticated;
drop trigger if exists inventory_enroll_confirmed on auth.users;
create trigger inventory_enroll_confirmed
after insert or update of email_confirmed_at,email on auth.users
for each row execute function public.inventory_enroll_confirmed_user();
commit;
