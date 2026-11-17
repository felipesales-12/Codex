-- Execute AFTER schema.sql. One shared factory, access only via explicit membership.
begin;
create table if not exists public.inventory_members (
  user_id uuid primary key references auth.users(id), name text not null check(length(name) between 1 and 140)
);
create table if not exists public.inventory_catalog (
  id text primary key, material text not null, thickness numeric not null,
  unique(material, thickness)
);
insert into public.inventory_catalog(id,material,thickness)
select 'carbono-'||v, 'carbono', v from unnest(array[2,3,4.76,6.35,7.94,9.35,12.7,19.05]) v
union all select 'inox-'||v, 'inox', v from unnest(array[1.5,2,3,4,5,6]) v on conflict do nothing;
create table if not exists public.inventory_sheets (
  id text primary key references public.inventory_catalog(id), quantity integer not null default 0 check(quantity between 0 and 1000000),
  dimensions text not null default '' check(length(dimensions)<=100), location text not null default '' check(length(location)<=140), revision bigint not null default 1
);
insert into public.inventory_sheets(id) select id from public.inventory_catalog on conflict do nothing;
create table if not exists public.inventory_scraps (
  id uuid primary key default gen_random_uuid(), catalog_id text not null references public.inventory_catalog(id),
  width numeric not null check(width>0 and width<=100000), length numeric not null check(length>0 and length<=100000),
  quantity integer not null check(quantity between 0 and 1000000), code text not null check(length(btrim(code)) between 1 and 100),
  location text not null default '' check(length(location)<=140), notes text not null default '' check(length(notes)<=20000),
  parent_id uuid references public.inventory_scraps(id), revision bigint not null default 1, created_at timestamptz not null default now()
);
create table if not exists public.inventory_tasks (
  id text primary key check(length(id) between 1 and 100), payload jsonb not null, revision bigint not null default 1
);
create index if not exists inventory_scraps_catalog_idx on public.inventory_scraps(catalog_id);
create index if not exists inventory_scraps_parent_idx on public.inventory_scraps(parent_id);
create table if not exists public.inventory_events (
  id bigint generated always as identity primary key, actor_id uuid not null, actor_name text not null,
  action text not null, entity text not null, before_data jsonb, after_data jsonb, note text not null default '', created_at timestamptz not null default clock_timestamp()
);
create table if not exists public.inventory_requests (
  request_id uuid primary key, actor_id uuid not null, body jsonb not null, created_at timestamptz not null default now()
);
create table if not exists public.inventory_state(id boolean primary key default true check(id), revision bigint not null default 0);
insert into public.inventory_state(id) values(true) on conflict do nothing;

create or replace function public.inventory_is_member() returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.inventory_members where user_id=(select auth.uid()));
$$;
revoke all on function public.inventory_is_member() from public, anon;
grant execute on function public.inventory_is_member() to authenticated;
do $$ declare t text; begin
  foreach t in array array['inventory_members','inventory_catalog','inventory_sheets','inventory_scraps','inventory_tasks','inventory_events','inventory_requests','inventory_state'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    if t <> 'inventory_requests' then
      execute format('grant select on public.%I to authenticated',t);
      execute format('drop policy if exists member_read on public.%I',t);
      execute format('create policy member_read on public.%I for select to authenticated using ((select public.inventory_is_member()))',t);
    end if;
  end loop;
end $$;

create or replace function public.inventory_snapshot() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not public.inventory_is_member() then raise exception 'Acesso não autorizado. Solicite sua inclusão na equipe.'; end if;
  return jsonb_build_object(
    'revision',(select revision from public.inventory_state),
    'sheets',coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object('material',c.material,'thickness',c.thickness) order by c.material,c.thickness) from public.inventory_sheets s join public.inventory_catalog c using(id)),'[]'::jsonb),
    'scraps',coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object('material',c.material,'thickness',c.thickness) order by s.created_at desc) from public.inventory_scraps s join public.inventory_catalog c on c.id=s.catalog_id),'[]'::jsonb),
    'tasks',coalesce((select jsonb_agg(payload||jsonb_build_object('_cloudRevision',revision)) from public.inventory_tasks),'[]'::jsonb)
  );
end $$;

-- All writes and audit entries commit together. A single factory lock serializes
-- brief mutations, including multi-record imports, without lost updates.
create or replace function public.inventory_apply(p_request_id uuid, p_action text, p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid(); actor_name text; old_request public.inventory_requests; body jsonb;
  before_value jsonb; after_value jsonb; entity_id text; n integer; delta integer; task jsonb; stamp text;
  s public.inventory_sheets; r public.inventory_scraps; t public.inventory_tasks; item jsonb; child_id uuid;
begin
  select name into actor_name from public.inventory_members where user_id=actor;
  if actor_name is null then raise exception 'Acesso não autorizado. Solicite sua inclusão na equipe.'; end if;
  if p_request_id is null or p_action is null or p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'Requisição inválida.'; end if;
  perform pg_advisory_xact_lock(70261117);
  body := jsonb_build_object('action',p_action,'data',p_data);
  select * into old_request from public.inventory_requests where request_id=p_request_id;
  if found then
    if old_request.actor_id<>actor or old_request.body<>body then raise exception 'Identificador de operação já utilizado.'; end if;
    return jsonb_build_object('confirmed',true,'replayed',true);
  end if;
  entity_id := p_data->>'id';
  stamp := to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  if p_action in ('sheet_move','sheet_edit') then
    select * into s from public.inventory_sheets where id=entity_id for update;
    if not found then raise exception 'Chapa não encontrada.'; end if;
    before_value:=to_jsonb(s);
    if p_action='sheet_move' then
      if (p_data->>'delta') is null or (p_data->>'delta') !~ '^-?[0-9]+$' then raise exception 'Quantidade inteira obrigatória.'; end if;
      delta:=(p_data->>'delta')::integer;
      if delta=0 or s.quantity+delta<0 then raise exception 'Quantidade inválida ou saldo insuficiente.'; end if;
      update public.inventory_sheets set quantity=quantity+delta,revision=revision+1 where id=s.id returning to_jsonb(inventory_sheets) into after_value;
    else
      if (p_data->>'revision')::bigint is distinct from s.revision then raise exception 'Registro alterado por outro operador. Atualize e tente novamente.'; end if;
      update public.inventory_sheets set dimensions=p_data->>'dimensions',location=p_data->>'location',revision=revision+1 where id=s.id returning to_jsonb(inventory_sheets) into after_value;
    end if;
  elsif p_action='scrap_add' then
    if (p_data->>'quantity') is null or (p_data->>'quantity') !~ '^[0-9]+$' or (p_data->>'quantity')::integer<1 then raise exception 'Informe uma quantidade inteira positiva.'; end if;
    insert into public.inventory_scraps(catalog_id,width,length,quantity,code,location,notes)
      values(p_data->>'catalog_id',(p_data->>'width')::numeric,(p_data->>'length')::numeric,(p_data->>'quantity')::integer,p_data->>'code',coalesce(p_data->>'location',''),coalesce(p_data->>'notes',''))
      returning to_jsonb(inventory_scraps),id::text into after_value,entity_id;
  elsif p_action='scrap_consume' then
    select * into r from public.inventory_scraps where id=entity_id::uuid for update;
    if not found then raise exception 'Retalho não encontrado.'; end if;
    if (p_data->>'revision')::bigint is distinct from r.revision then raise exception 'Retalho alterado por outro operador. Atualize e tente novamente.'; end if;
    if (p_data->>'quantity') is null or (p_data->>'quantity') !~ '^[0-9]+$' then raise exception 'Quantidade inteira obrigatória.'; end if;
    n:=(p_data->>'quantity')::integer;
    if n<1 or n>r.quantity then raise exception 'Saldo de retalhos insuficiente.'; end if;
    before_value:=to_jsonb(r);
    update public.inventory_scraps set quantity=quantity-n,revision=revision+1 where id=r.id returning to_jsonb(inventory_scraps) into after_value;
    if p_data ? 'remainder' and p_data->'remainder'<>'null'::jsonb then
      item:=p_data->'remainder';
      if not (((item->>'width')::numeric<=r.width and (item->>'length')::numeric<=r.length) or ((item->>'width')::numeric<=r.length and (item->>'length')::numeric<=r.width))
        or (item->>'width')::numeric*(item->>'length')::numeric>=r.width*r.length then raise exception 'A sobra deve ser menor e caber no retalho original.'; end if;
      insert into public.inventory_scraps(catalog_id,width,length,quantity,code,location,notes,parent_id)
        values(r.catalog_id,(item->>'width')::numeric,(item->>'length')::numeric,n,item->>'code',r.location,coalesce(item->>'notes',''),r.id) returning id into child_id;
      after_value:=after_value||jsonb_build_object('remainder',(select to_jsonb(x) from public.inventory_scraps x where id=child_id));
    end if;
  elsif p_action in ('task_save','task_delete') then
    select * into t from public.inventory_tasks where id=entity_id for update;
    if coalesce((p_data->>'revision')::bigint,0)<>coalesce(t.revision,0) then raise exception 'Atividade alterada por outro operador. Atualize antes de salvar.'; end if;
    before_value:=t.payload;
    if p_action='task_delete' then
      if t.id is null then raise exception 'Atividade não encontrada.'; end if;
      delete from public.inventory_tasks where id=t.id;
    else
      task:=p_data->'task';
      task:=task||jsonb_build_object('id',entity_id,'createdAt',coalesce(t.payload->>'createdAt',stamp),'updatedAt',stamp,'completedAt',case when task->>'status'='completed' then coalesce(t.payload->>'completedAt',stamp) else null end);
      task:=public.compasso_validate_task(task);
      insert into public.inventory_tasks(id,payload,revision) values(entity_id,task,(select revision+1 from public.inventory_state)) on conflict(id) do update set payload=excluded.payload,revision=excluded.revision;
      after_value:=task;
    end if;
  elsif p_action in ('task_import','task_replace') then
    if jsonb_typeof(p_data->'tasks') is distinct from 'array' or jsonb_array_length(p_data->'tasks')>50000 then raise exception 'Backup inválido.'; end if;
    if p_action='task_replace' then
      if (p_data->>'revision')::bigint is distinct from (select revision from public.inventory_state) then raise exception 'Os dados mudaram. Atualize antes de restaurar.'; end if;
      select coalesce(jsonb_agg(payload),'[]'::jsonb) into before_value from public.inventory_tasks;
      delete from public.inventory_tasks;
    end if;
    for item in select value from jsonb_array_elements(p_data->'tasks') loop
      task:=public.compasso_validate_task(item);
      insert into public.inventory_tasks(id,payload,revision) values(task->>'id',task,(select revision+1 from public.inventory_state)) on conflict do nothing;
    end loop;
    entity_id:='backup'; after_value:=p_data->'tasks';
  else raise exception 'Operação desconhecida.';
  end if;
  insert into public.inventory_events(actor_id,actor_name,action,entity,before_data,after_data,note)
    values(actor,actor_name,p_action,entity_id,before_value,after_value,left(coalesce(p_data->>'note',''),20000));
  update public.inventory_state set revision=revision+1;
  insert into public.inventory_requests(request_id,actor_id,body) values(p_request_id,actor,body);
  return jsonb_build_object('confirmed',true);
end $$;
revoke all on function public.inventory_snapshot(),public.inventory_apply(uuid,text,jsonb) from public,anon;
grant execute on function public.inventory_snapshot(),public.inventory_apply(uuid,text,jsonb) to authenticated;
-- Only the small version record needs to be streamed; clients then fetch one consistent snapshot.
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='inventory_state' and schemaname='public') then
    alter publication supabase_realtime add table public.inventory_state;
  end if;
end $$;
commit;

