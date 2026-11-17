# Compasso · Controle de chapas e retalhos

Plataforma web industrial em português, com login obrigatório, estoque compartilhado entre operadores, atividades e histórico de auditoria. JavaScript modular + Supabase Auth/PostgreSQL/Realtime. O bundle inclui o SDK oficial; não depende de CDN.

## Executar

Requer Node.js 24 ou superior. Para os testes de banco, Docker Desktop em execução.

1. Instale as dependências com `npm ci --ignore-scripts`.
2. Copie `.env.example` para `.env`.
3. Configure seu projeto Supabase conforme a seção abaixo.
4. Execute `npm start`.
5. Abra http://127.0.0.1:4173.

`npm start` gera o build e serve somente `dist/`. Após alterar arquivos ou variáveis, reinicie. A abertura direta de `index.html` ou do antigo servidor Python não é o fluxo da versão 2.

```dotenv
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_sua_chave_publica
```

Também aceita a antiga chave pública JWT com papel `anon`. Nunca use `service_role`, chaves secretas ou senha do banco no frontend. Essas duas variáveis são públicas e serão incorporadas ao JavaScript. A segurança é aplicada no banco por associação à equipe, RLS e RPCs autorizadas. O build sem variáveis mostra uma orientação de configuração e mantém o login desabilitado; não existe acesso de demonstração em produção.

## Configurar Supabase

1. Crie um projeto Supabase ou escolha o projeto que será usado pela fábrica.
2. No SQL Editor, execute **primeiro** todo o arquivo [supabase/schema.sql](supabase/schema.sql), depois [supabase/inventory.sql](supabase/inventory.sql). Os scripts podem ser reaplicados sem apagar dados. O primeiro mantém a validação e a compatibilidade do módulo antigo.
3. Em Authentication, habilite o provedor Email. Desabilite inscrições públicas: os usuários devem ser cadastrados pelo administrador. Configure a URL HTTPS publicada em Site URL e Redirect URLs. Para desenvolvimento, inclua `http://127.0.0.1:4173`.
4. Em Authentication → Users, crie cada usuário com e-mail/senha e e-mail confirmado. Copie seu UUID. Para recuperação de senha, o administrador deve redefini-la por um fluxo administrativo seguro; a aplicação não expõe uma chave administrativa.
5. Autorize cada usuário no SQL Editor:

```sql
insert into public.inventory_members(user_id, name)
values ('UUID-DO-USUARIO', 'Nome do operador')
on conflict(user_id) do update set name = excluded.name;
```

6. A migração adiciona `public.inventory_state` à publicação `supabase_realtime`, quando ela existe. Confira em Database → Replication/Publications se a tabela está habilitada. Não é necessário publicar as tabelas de estoque inteiro. Em instalações próprias, crie/configure a publicação antes de reaplicar a migração.
7. Copie Project URL e a chave pública de API para `.env`, gere o build e entre com o usuário criado.

Para revogar acesso, remova o usuário de `inventory_members` (não exclua seu histórico). O nome registrado em cada movimentação é obtido da associação mantida pelo administrador. Todos os membros autorizados trabalham no **mesmo estoque da fábrica**. A solução não implementa múltiplas empresas nem níveis de permissão entre operadores.

## Funcionalidades

- **Chapas:** aço carbono 2, 3, 4.76, 6.35, 7.94, 9.35, 12.7 e 19.05 mm; inox 1.5, 2, 3, 4, 5 e 6 mm. Todas começam com saldo **zero**, sem dados fictícios. Entradas/saídas inteiras, dimensão padrão e localização.
- **Reposição:** painel no dashboard quando qualquer combinação tem duas chapas ou menos, inclusive zero. Lista completa por material/espessura e botão de cópia para compras.
- **Retalhos:** material, espessura, largura, comprimento, quantidade, código, localização e observações. Busca por medidas mínimas inclui rotação de 90° e mostra primeiro a menor área compatível. As dimensões devem representar o retângulo útil; a busca não interpreta furos, formato em L, largura de corte ou direção de acabamento.
- **Consumo:** baixa parcial de lotes, com geração opcional de um sub-retalho por peça utilizada. A sobra precisa caber na peça original e ter área menor; registro pai/filho preservado.
- **Atividades:** campos originais, prioridades, prazos, busca sem acentos, filtros por solicitante/datas, ordenação, início, edição, duplicação, conclusão, restauração, exclusão, detalhes e tempo decorrido. Exportação CSV com proteção contra fórmulas e backup JSON no formato original.
- **Histórico:** autoria, horário do servidor, motivo, valores anteriores e posteriores. Exclusão de atividade não apaga a auditoria.
- **Sincronização:** conexão automática depois do login, eventos Realtime, nova leitura após reconexão e atualização de contingência a cada 30 segundos.
- **Interface:** desktop/tablet/celular, tema claro/escuro, formulários com rótulos, foco visível, diálogos nativos e estados de erro/carregamento.

## Persistência e concorrência

Dados operacionais são gravados somente no Supabase. `localStorage` contém apenas o tema; `sessionStorage` mantém a sessão de autenticação da aba. O IndexedDB antigo é lido apenas quando o usuário pede a importação.

Cada mutação executa em uma transação que também insere a auditoria. Uma trava transacional serializa operações curtas da fábrica; validação no servidor impede saldo negativo, quantidades fracionárias e espessuras fora do catálogo. Edições de atividades/localização e consumo de retalhos usam revisão para detectar alterações feitas por outro operador.

A operação só é confirmada na tela após resposta de sucesso do banco. Se uma resposta se perder, o formulário mantém o mesmo identificador e conteúdo da requisição, permitindo reenviar sem duplicar estoque ou histórico. Mantenha a janela aberta até confirmar o resultado. Não há fila de operações offline: sem internet não é possível confirmar uma gravação. Queda de internet, fechamento abrupto antes da confirmação e indisponibilidade do provedor não permitem prometer perda zero absoluta; configure também backups do banco/PITR conforme seu plano.

O histórico é permanente para os operadores e não possui política de expiração. Administradores do projeto continuam tendo acesso privilegiado. As RPCs são o único caminho de escrita concedido aos usuários; as tabelas não permitem escrita direta pela chave pública.

## Migrar atividades existentes

Antes de substituir a versão antiga, exporte um backup JSON em cada conta/navegador que contenha atividades. Preserve esses arquivos.

- Na nova versão, entre com um usuário autorizado e abra **Dados e backups → Importar atividades**.
- **Adicionar ausentes** mantém as atividades atuais, adicionando IDs ainda não existentes. Revise colisões se os backups vierem de contas distintas.
- **Substituir** restaura somente a lista de atividades. Exige confirmação e revisão atual; o estado anterior fica na auditoria.
- Se a versão nova estiver na mesma origem/navegador da antiga, **Buscar atividades deste navegador** lê o IndexedDB antigo, sem apagá-lo.
- Dados antigos no Firebase/Supabase não são migrados silenciosamente nem excluídos: exporte-os pela versão anterior e importe o JSON.
- O arquivo industrial completo exporta estoque, retalhos, atividades e auditoria para arquivo/conferência. A importação pela interface restaura apenas **atividades**. Para recuperação integral do banco, use os backups administrados do Supabase.

## Publicar no GitHub Pages

Este repositório já inclui no workflow a URL e a chave **pública** do projeto Supabase selecionado para a implantação. As Variables do GitHub Actions podem substituir esses valores. O arquivo local `.env` continua separado do Git e pode ser usado para desenvolvimento.

O workflow em `.github/workflows/pages.yml` valida código, banco e navegador antes de publicar `dist/`.

1. Em Settings → Pages, selecione **GitHub Actions**.
2. Em Settings → Secrets and variables → Actions → **Variables**, crie `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY`.
3. Configure o banco, membros e URL de autenticação conforme acima.
4. Integre a branch à `main` ou execute o workflow manualmente.

Todas as URLs de assets são relativas; o site funciona em `/Codex/`. Hospede com HTTPS para proteger credenciais e usar a área de transferência. O servidor de preview envia CSP e bloqueia acesso fora de `dist/`; o HTML inclui CSP compatível com HTTPS/WSS do Supabase. O worker anterior é aposentado para evitar servir a interface local obsoleta.

## Comandos e estrutura

```text
npm start                 build + preview
npm run build             gera dist/
npm run preview           serve dist/ em 127.0.0.1:4173
npm test                  regras de atividades, backups, catálogo e aproveitamento
npm run test:database     testes do banco antigo + estoque em PostgreSQL real isolado
npm run test:e2e           testes de navegador do sistema atual
npm run test:web           mesmo conjunto atual, incluindo /Codex/ e responsividade
```

Antes do primeiro teste de navegador: `npx playwright install chromium`. O teste usa um projeto fictício interceptado pelo Playwright; **não grava na sua nuvem**.

```text
index.html                    entrada com login
css/stock.css                 design responsivo e temas
js/stock-app.js                sessão, navegação, formulários e operações
js/stock-views.js              telas e componentes
js/stock-forms.js              formulários operacionais
js/stock-cloud.js              Supabase Auth, RPCs e Realtime
js/inventory.js                catálogo, alerta e aproveitamento
js/tasks.js                   regras originais de atividades
js/backup.js                  validação e exportações originais
js/database.js                leitura do IndexedDB para migração
supabase/schema.sql           compatibilidade/validação de atividades
supabase/inventory.sql        tabelas, RLS, RPCs, auditoria e publicação
scripts/build.mjs             build e variáveis .env
scripts/preview.mjs           servidor local restrito ao dist/
scripts/test-inventory.mjs     testes reais do novo banco
tests/stock.spec.js            fluxos atuais no navegador
tests/inventory.sql           autorização, integridade e auditoria
tests/inventory.test.js        catálogo, limites e busca
docs/IMPLEMENTACAO.md          decisões e critérios de aceitação
```

Os adaptadores `js/cloud.js`, `js/firebase-cloud.js`, `js/supabase-cloud.js`, `js/account.js`, a interface `js/app.js` e os testes de interface antigos ficam como referência da versão 1 e não fazem parte do bundle nem dos fluxos atuais. Os testes unitários de atividades e os testes do banco legado continuam sendo executados. Os testes atuais substituem as expectativas incompatíveis de entrada sem login e gravação local.

## Referências oficiais

- [Autenticação por senha](https://supabase.com/docs/reference/javascript/auth-signinwithpassword)
- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Postgres Changes / Realtime](https://supabase.com/docs/guides/realtime/postgres-changes)

