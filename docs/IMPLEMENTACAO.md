# Compasso • Materiais

## Contrato de entrega

Estoque único da fábrica compartilhado por membros autorizados. Supabase Auth (e-mail/senha), PostgreSQL com RLS e Realtime. A sessão fica em sessionStorage; dados operacionais somente na nuvem. Sem conexão, uma operação não é confirmada. Repetir uma requisição de resultado incerto utiliza o mesmo identificador.

14 combinações fixas de material/espessura, quantidade inteira não negativa, dimensão/local opcionais. Alerta inclusivo ≤ 2, inclusive zero. Retalhos admitem rotação de 90° na busca; medidas representam o retângulo útil (geometria irregular exige conferência). Consumo e geração de sobra são atômicos. Atividades preservam os campos, filtros, prioridades, datas, duplicação, início, conclusão, restauração, exclusão, detalhes, CSV e backup JSON originais.

## Etapas e aceitação

1. Catálogo e regras de aproveitamento com testes de limites e rotação.
2. Banco: autorização, saldo, idempotência, concorrência, auditoria imutável e revisão de atividades; testes em PostgreSQL real isolado.
3. Login obrigatório, sessão, sincronização automática e mensagens de falha sem confirmação indevida.
4. Interface responsiva: painel, chapas, retalhos, atividades, movimentações e backup/importação.
5. Build, testes unitários, testes de banco e navegador; documentação de configuração/publicação.

## Direção visual

Evolução da marca Compasso: navegação escura grafite, fundo cinza claro, superfícies brancas, verde para ações e âmbar para reposição. Tabelas compactas para almoxarifado e controles de toque ≥ 44 px. Painel prioriza reposição e saldos. Menu recolhido no celular, rolagem apenas nas tabelas. Estados vazios, carregamento, erro e desconexão explícitos. Diálogos nativos acessíveis.

## Preservação

As funções puras de `js/tasks.js` e `js/backup.js` são reutilizadas com os testes originais. Os adaptadores antigos permanecem no histórico/código para referência e migração, sem integrar o novo bundle. Backups antigos são importados por operação transacional. A restauração de atividades continua disponível com confirmação e revisão global; o histórico de auditoria registra o estado anterior. Estoque e auditoria não são sobrescritos por backups antigos.

## Primeiro acesso e verificação da implantação

O cadastro por senha exige confirmação de e-mail. Uma lista privada de endereços autorizados controla a inclusão automática em `inventory_members`; a criação de uma conta, sozinha, não libera acesso ao estoque. A aplicação não recebe nenhuma chave administrativa. Os testes verificam que cadastro sem confirmação e endereço fora da lista não recebem associação, e que operadores não podem ler ou editar a lista.

Na implantação de 17/11/2026, o projeto Supabase foi reativado, as três migrações foram aplicadas, as 14 combinações foram verificadas e a publicação Realtime de `inventory_state` foi confirmada. A API anônima rejeitou consultas de estoque e a RPC de leitura com HTTP 401. O destino HTTPS do GitHub Pages foi aceito pelo fluxo de redirecionamento do Auth. A criação da conta e a confirmação do e-mail ficam a cargo do titular, que define sua própria senha.

O advisor reporta [funções SECURITY DEFINER executáveis por autenticados](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable). Isso é intencional nas RPCs: a associação é verificada dentro da função, o `search_path` é fixado e a escrita direta é revogada. O helper retorna apenas a associação da sessão. As [tabelas com RLS sem políticas](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) são privadas por projeto: registros internos de idempotência e lista de e-mails. Não devem ganhar políticas públicas apenas para silenciar o aviso.
