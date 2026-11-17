# Verificação da versão 2

Execute `npm ci --ignore-scripts` e `npx playwright install chromium`.

- `npm test`: testes originais de atividades/backup e regras novas de catálogo, estoque mínimo inclusivo e aproveitamento com rotação.
- `npm run test:database`: PostgreSQL 17 real, temporário, sem porta de rede publicada nem volume persistente. Valida os RPCs antigos e novos, RLS, autorização, escrita direta bloqueada, idempotência, rollback, saldo e duas conexões concorrentes.
- `npm run test:e2e`: Chromium real, com respostas de Supabase interceptadas. Verifica login/logout, responsividade, alertas, resposta perdida, evento Realtime, retalhos, sub-retalhos, atividades e exportações.
- `npm run build`: bundle de produção usando somente URL/chave pública.

Os testes de navegador não demonstram conectividade com um projeto Supabase hospedado. Após configurar o ambiente, entre com dois usuários autorizados em dispositivos diferentes e confirme que uma movimentação aparece no outro dispositivo e no histórico. Verifique também um usuário autenticado sem associação: ele não deve acessar o estoque.

Screenshots de login e dashboard (desktop/celular) são gerados em `test-results/`. Traces são mantidos em falhas. Os testes antigos de interface documentam o contrato da versão 1 (local/opcional) e permanecem no repositório para consulta; a suíte operacional atual está em `playwright.stock.config.js`.
