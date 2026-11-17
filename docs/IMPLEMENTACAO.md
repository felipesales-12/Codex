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
