set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
select public.test_assert(public.compasso_snapshot() = '{"version":0,"tasks":[]}'::jsonb, 'nova conta vazia');
select public.compasso_apply('00000000-0000-4000-8000-000000000001','add',p_task => public.test_task('one'));
select public.test_assert(public.compasso_snapshot()->>'version' = '1', 'cadastro confirmado');
select public.compasso_apply('00000000-0000-4000-8000-000000000001','add',p_task => public.test_task('one'));
select public.test_assert(jsonb_array_length(public.compasso_snapshot()->'tasks') = 1 and public.compasso_snapshot()->>'version' = '1', 'repetição idempotente não duplica');
do $$begin
  begin
    perform public.compasso_apply('00000000-0000-4000-8000-000000000001','add',p_task => public.test_task('different'));
    raise exception 'reuso de request id deveria falhar';
  exception when invalid_parameter_value then null; end;
end$$;
select public.test_assert(true, 'request id não pode mudar de conteúdo');
select public.compasso_apply('00000000-0000-4000-8000-000000000002','put',p_task => public.test_task('one') || '{"status":"progress"}'::jsonb,p_expected_revision => 1);
select public.test_assert((public.compasso_snapshot()->'tasks'->0->'payload'->>'status') = 'progress', 'edição usa a revisão esperada');
do $$begin
  begin
    perform public.compasso_apply('00000000-0000-4000-8000-000000000003','put',p_task => public.test_task('one','Edição antiga'),p_expected_revision => 1);
    raise exception 'edição obsoleta deveria falhar';
  exception when serialization_failure then null; end;
end$$;
select public.test_assert(public.compasso_snapshot()->>'version' = '2', 'edição obsoleta rejeitada sem alterar versão');

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);
select public.test_assert(jsonb_array_length(public.compasso_snapshot()->'tasks') = 0, 'outra conta não vê atividades');
do $$begin
  begin
    perform public.compasso_apply('00000000-0000-4000-8000-000000000004','delete',p_task_id => 'one',p_expected_revision => 2);
    raise exception 'exclusão de outra conta deveria falhar';
  exception when serialization_failure then null; end;
end$$;
select public.compasso_apply('00000000-0000-4000-8000-000000000005','add',p_task => public.test_task('one','Conta B'));
select public.test_assert((select count(*) from public.compasso_tasks) = 1, 'RLS filtra leitura direta por usuário');
do $$begin
  begin
    insert into public.compasso_tasks(user_id,id,payload) values('11111111-1111-4111-8111-111111111111','illegal',public.test_task('illegal'));
    raise exception 'gravação direta deveria falhar';
  exception when insufficient_privilege then null; end;
end$$;
select public.test_assert(true, 'gravação direta não contorna RPC e controle de revisão');

set role anon;
do $$begin
  begin perform public.compasso_snapshot(); raise exception 'anon não deve ler'; exception when insufficient_privilege then null; end;
  begin perform public.compasso_apply('00000000-0000-4000-8000-000000000006','delete',p_task_id=>'one',p_expected_revision=>1); raise exception 'anon não deve gravar'; exception when insufficient_privilege then null; end;
end$$;
select public.test_assert(true, 'sem autenticação não há leitura nem gravação');

set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
do $$begin
  begin
    perform public.compasso_apply('00000000-0000-4000-8000-000000000007','replace',p_expected_version=>2,p_tasks=>jsonb_build_array(public.test_task('new'),'{"id":"bad"}'::jsonb));
    raise exception 'importação inválida deveria falhar';
  exception when invalid_parameter_value then null; end;
end$$;
select public.test_assert(jsonb_array_length(public.compasso_snapshot()->'tasks') = 1 and public.compasso_snapshot()->'tasks'->0->'payload'->>'id' = 'one', 'importação inválida é atômica');
select public.compasso_apply('00000000-0000-4000-8000-000000000008','merge',p_expected_version=>2,p_tasks=>jsonb_build_array(public.test_task('local')));
select public.test_assert(jsonb_array_length(public.compasso_snapshot()->'tasks') = 2, 'migração acrescenta dados sem apagar a nuvem');
do $$begin
  begin
    perform public.compasso_apply('00000000-0000-4000-8000-000000000009','merge',p_expected_version=>3,p_tasks=>jsonb_build_array(public.test_task('partial'),public.test_task('one','Conflito')));
    raise exception 'migração em conflito deveria falhar';
  exception when unique_violation then null; end;
end$$;
select public.test_assert(jsonb_array_length(public.compasso_snapshot()->'tasks') = 2 and public.compasso_snapshot()->>'version' = '3', 'migração em conflito reverte todos os registros');
do $$begin
  begin
    perform public.compasso_apply('00000000-0000-4000-8000-000000000010','replace',p_expected_version=>2,p_tasks=>'[]'::jsonb);
    raise exception 'substituição obsoleta deveria falhar';
  exception when serialization_failure then null; end;
end$$;
select public.test_assert(jsonb_array_length(public.compasso_snapshot()->'tasks') = 2, 'substituição verifica a versão da conta');
select public.compasso_apply('00000000-0000-4000-8000-000000000011','replace',p_expected_version=>3,p_tasks=>jsonb_build_array(public.test_task('one','Após restauração')));
select public.test_assert(public.compasso_snapshot()->'tasks'->0->>'revision' = '4', 'restauração não reutiliza revisões antigas');
do $$begin
  begin
    perform public.compasso_apply('00000000-0000-4000-8000-000000000012','put',p_task=>public.test_task('one','Edição antiga'),p_expected_revision=>2);
    raise exception 'edição anterior à restauração deveria falhar';
  exception when serialization_failure then null; end;
  begin
    perform public.compasso_apply('00000000-0000-4000-8000-000000000013','put',p_task=>public.test_task('one') || '{"createdAt":"2025-01-01T10:00:00.000Z"}'::jsonb,p_expected_revision=>4);
    raise exception 'cadastro original deveria ser imutável';
  exception when invalid_parameter_value then null; end;
end$$;
select public.test_assert(public.compasso_snapshot()->>'version' = '4', 'dados e revisão preservados após conflitos');
reset role;
