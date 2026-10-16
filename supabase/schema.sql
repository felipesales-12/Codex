-- Run in the SQL Editor of YOUR Supabase project. Safe to rerun.
begin;

create table if not exists public.compasso_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  version bigint not null default 0 check (version >= 0)
);
create table if not exists public.compasso_tasks (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (length(id) between 1 and 100),
  payload jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  primary key (user_id, id)
);
create table if not exists public.compasso_operations (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  request_hash text not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, request_id)
);

alter table public.compasso_accounts enable row level security;
alter table public.compasso_tasks enable row level security;
alter table public.compasso_operations enable row level security;
drop policy if exists compasso_read_account on public.compasso_accounts;
create policy compasso_read_account on public.compasso_accounts for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists compasso_read_tasks on public.compasso_tasks;
create policy compasso_read_tasks on public.compasso_tasks for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.compasso_accounts, public.compasso_tasks, public.compasso_operations from public, anon, authenticated;
grant select on public.compasso_accounts, public.compasso_tasks to authenticated;

create or replace function public.compasso_validate_task(p jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  field text;
  result jsonb := '{}'::jsonb;
  created_at timestamptz;
  updated_at timestamptz;
  completed_at timestamptz;
begin
  if p is null or jsonb_typeof(p) <> 'object' then raise exception using errcode = '22023', message = 'Atividade inválida.'; end if;
  foreach field in array array['id','title','requester','location','priority','status','description','notes','dueDate','createdAt','updatedAt'] loop
    if jsonb_typeof(p->field) is distinct from 'string' then raise exception using errcode = '22023', message = 'Campo de atividade inválido: ' || field; end if;
    result := result || jsonb_build_object(field, p->field);
  end loop;
  if length(btrim(p->>'id')) = 0 or length(p->>'id') > 100
    or length(btrim(p->>'title')) = 0 or length(p->>'title') > 160
    or length(btrim(p->>'requester')) = 0 or length(p->>'requester') > 140
    or length(btrim(p->>'location')) = 0 or length(p->>'location') > 140
    or length(p->>'description') > 20000 or length(p->>'notes') > 20000
    or p->>'priority' not in ('low','medium','high','critical')
    or p->>'status' not in ('pending','progress','completed')
    then raise exception using errcode = '22023', message = 'Campos obrigatórios, status ou urgência inválidos.'; end if;
  if p->>'dueDate' <> '' then
    if p->>'dueDate' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception using errcode = '22023', message = 'Prazo inválido.'; end if;
    perform (p->>'dueDate')::date;
  end if;
  if p->>'createdAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$'
    or p->>'updatedAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$'
    then raise exception using errcode = '22023', message = 'Data de cadastro ou alteração inválida.'; end if;
  created_at := (p->>'createdAt')::timestamptz;
  updated_at := (p->>'updatedAt')::timestamptz;
  if updated_at < created_at then raise exception using errcode = '22023', message = 'A alteração não pode anteceder o cadastro.'; end if;
  if p->>'status' = 'completed' then
    if jsonb_typeof(p->'completedAt') is distinct from 'string'
      or p->>'completedAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$'
      then raise exception using errcode = '22023', message = 'Conclusão inválida.'; end if;
    completed_at := (p->>'completedAt')::timestamptz;
    if completed_at < created_at then raise exception using errcode = '22023', message = 'A conclusão não pode anteceder o cadastro.'; end if;
  elsif p->'completedAt' is distinct from 'null'::jsonb then
    raise exception using errcode = '22023', message = 'Uma atividade ativa não pode ter data de conclusão.';
  end if;
  return result || jsonb_build_object('completedAt', p->'completedAt');
exception when invalid_datetime_format or datetime_field_overflow then
  raise exception using errcode = '22023', message = 'A atividade contém uma data inválida.';
end;
$$;
revoke all on function public.compasso_validate_task(jsonb) from public, anon, authenticated;

create or replace function public.compasso_snapshot()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'version', coalesce((select version from public.compasso_accounts where user_id = auth.uid()), 0),
    'tasks', coalesce((select jsonb_agg(jsonb_build_object('payload', payload, 'revision', revision) order by id)
      from public.compasso_tasks where user_id = auth.uid()), '[]'::jsonb)
  );
$$;
revoke all on function public.compasso_snapshot() from public, anon;
grant execute on function public.compasso_snapshot() to authenticated;

-- Only this function can write. It derives ownership from the verified JWT, never
-- from a caller-supplied user_id. Per-account locking makes replacements atomic.
create or replace function public.compasso_apply(
  p_request_id uuid,
  p_operation text,
  p_task jsonb default null,
  p_task_id text default null,
  p_expected_revision bigint default null,
  p_tasks jsonb default null,
  p_expected_version bigint default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  current_version bigint;
  current_revision bigint;
  previous_record jsonb;
  item jsonb;
  clean jsonb;
  result jsonb;
  fingerprint text;
  previous_hash text;
begin
  if uid is null then raise exception using errcode = '42501', message = 'Entre na sua conta.'; end if;
  if p_request_id is null or p_operation is null or p_operation not in ('add','put','delete','replace','merge') then
    raise exception using errcode = '22023', message = 'Operação inválida.';
  end if;
  insert into public.compasso_accounts(user_id) values(uid) on conflict do nothing;
  select version into current_version from public.compasso_accounts where user_id = uid for update;
  fingerprint := encode(sha256(convert_to(jsonb_build_object('operation',p_operation,'task',p_task,'id',p_task_id,
    'revision',p_expected_revision,'tasks',p_tasks,'version',p_expected_version)::text, 'UTF8')), 'hex');
  select request_hash, response into previous_hash, result from public.compasso_operations where user_id = uid and request_id = p_request_id;
  if found then
    if previous_hash <> fingerprint then raise exception using errcode = '22023', message = 'A identificação desta operação já foi usada com outros dados.'; end if;
    return result;
  end if;

  if p_operation in ('replace', 'merge') then
    if p_expected_version is distinct from current_version then raise exception using errcode = '40001', message = 'A conta foi alterada em outro aparelho. Sincronize e revise os dados.'; end if;
    if p_tasks is null or jsonb_typeof(p_tasks) <> 'array' then raise exception using errcode = '22023', message = 'Lista de atividades inválida.'; end if;
    if jsonb_array_length(p_tasks) > 50000 then raise exception using errcode = '22023', message = 'Limite de 50.000 atividades excedido.'; end if;
    if (select count(distinct value->>'id') from jsonb_array_elements(p_tasks)) <> jsonb_array_length(p_tasks) then
      raise exception using errcode = '22023', message = 'O arquivo contém identificadores repetidos ou ausentes.';
    end if;
    -- Validate every record before changing anything. An exception rolls back ALL writes.
    for item in select value from jsonb_array_elements(p_tasks) loop perform public.compasso_validate_task(item); end loop;
    if p_operation = 'replace' then delete from public.compasso_tasks where user_id = uid; end if;
    for item in select value from jsonb_array_elements(p_tasks) loop
      clean := public.compasso_validate_task(item);
      select payload into previous_record from public.compasso_tasks where user_id = uid and id = clean->>'id';
      if found then
        if previous_record <> clean then raise exception using errcode = '23505', message = 'Uma atividade local tem o mesmo identificador e conteúdo diferente na nuvem.'; end if;
      else
        insert into public.compasso_tasks(user_id, id, payload, revision) values(uid, clean->>'id', clean, current_version + 1);
      end if;
    end loop;
    if (select count(*) from public.compasso_tasks where user_id = uid) > 50000 then
      raise exception using errcode = '22023', message = 'A conta excederia o limite de 50.000 atividades.';
    end if;
  elsif p_operation = 'add' then
    clean := public.compasso_validate_task(p_task);
    if (select count(*) from public.compasso_tasks where user_id = uid) >= 50000 then
      raise exception using errcode = '22023', message = 'Limite de 50.000 atividades por conta atingido.';
    end if;
    insert into public.compasso_tasks(user_id, id, payload, revision) values(uid, clean->>'id', clean, current_version + 1);
  elsif p_operation = 'put' then
    clean := public.compasso_validate_task(p_task);
    select revision, payload into current_revision, previous_record from public.compasso_tasks where user_id = uid and id = clean->>'id';
    if not found or current_revision is distinct from p_expected_revision then raise exception using errcode = '40001', message = 'Esta atividade foi alterada ou excluída em outro aparelho.'; end if;
    if clean->>'createdAt' <> previous_record->>'createdAt' then raise exception using errcode = '22023', message = 'A data original de cadastro deve ser preservada.'; end if;
    update public.compasso_tasks set payload = clean, revision = current_version + 1 where user_id = uid and id = clean->>'id';
  else
    select revision into current_revision from public.compasso_tasks where user_id = uid and id = p_task_id;
    if not found or current_revision is distinct from p_expected_revision then raise exception using errcode = '40001', message = 'Esta atividade foi alterada ou excluída em outro aparelho.'; end if;
    delete from public.compasso_tasks where user_id = uid and id = p_task_id;
  end if;

  update public.compasso_accounts set version = version + 1 where user_id = uid returning version into current_version;
  result := jsonb_build_object('version', current_version);
  insert into public.compasso_operations(user_id, request_id, request_hash, response) values(uid, p_request_id, fingerprint, result);
  return result;
end;
$$;
revoke all on function public.compasso_apply(uuid,text,jsonb,text,bigint,jsonb,bigint) from public, anon;
grant execute on function public.compasso_apply(uuid,text,jsonb,text,bigint,jsonb,bigint) to authenticated;

commit;
