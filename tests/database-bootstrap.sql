-- Test-only stand-ins for the Supabase Auth roles/schema. Never run in production.
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
insert into auth.users values ('11111111-1111-4111-8111-111111111111'), ('22222222-2222-4222-8222-222222222222');

create function public.test_assert(ok boolean, label text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAILED: %', label; end if;
  raise notice 'PASS: %', label;
end;
$$;
create function public.test_task(task_id text, title text default 'Atividade de teste') returns jsonb language sql as $$
select jsonb_build_object('id', task_id, 'title', title, 'requester', 'Teste', 'location', 'Laboratório',
  'priority', 'medium', 'status', 'pending', 'description', 'Descrição', 'notes', 'Observação', 'dueDate', '',
  'createdAt', '2026-01-01T10:00:00.000Z', 'updatedAt', '2026-01-01T10:00:00.000Z', 'completedAt', null);
$$;
