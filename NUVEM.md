# Ativar a conta e o banco na nuvem

O modo nuvem usa **Supabase Auth + PostgreSQL**. O GitHub Pages continua hospedando apenas os arquivos do site. Não há dados de atividades em commits, no workflow ou nos arquivos publicados. O modo local existente continua disponível.

**Estado desta entrega:** a integração, a tela de conta e o script do banco foram implementados e testados localmente. Um projeto Supabase real ainda precisa ser criado/configurado. Sem essa configuração, o site informa que a nuvem não está ativada e mantém o armazenamento local. Nenhum registro real foi migrado automaticamente.

## 1. Criar o projeto

Na sua conta em https://supabase.com/dashboard, crie um projeto e aguarde a preparação do banco. Guarde a senha do banco no seu gerenciador de senhas; ela não é necessária no frontend, no GitHub nem nesta conversa.

Em **Project Settings → API / Data API**, copie a **Project URL**, no formato `https://SEU-PROJETO.supabase.co`. Na seção de API Keys, localize a chave **publishable** (`sb_publishable_…`). Projetos antigos também podem usar a chave pública `anon`.

O frontend rejeita chaves `secret` e `service_role`. Elas têm privilégios elevados e não devem ser colocadas no site, em variáveis do build do frontend ou em arquivos do repositório.

## 2. Preparar o banco

No **SQL Editor** do seu projeto, execute o conteúdo completo de [`supabase/schema.sql`](supabase/schema.sql).

Esse script cria as tabelas de atividades, versão da conta e identificadores de operações. Ativa RLS e concede leitura somente ao dono autenticado. As gravações passam por funções que identificam o usuário pela sessão autenticada, validam os campos e conferem revisões. Não desative RLS nem crie políticas públicas de leitura/gravação para fazer a conexão funcionar.

O script pode ser executado novamente sem apagar registros. Não execute os arquivos `tests/database-bootstrap.sql` ou `tests/database.sql` no seu projeto: eles pertencem exclusivamente aos testes isolados.

## 3. Configurar login e emails

Em **Authentication → Providers**, habilite Email e mantenha a confirmação de email habilitada. Em **Authentication → URL Configuration**, use o endereço real do site como **Site URL** e adicione-o às URLs de redirecionamento permitidas.

Para este repositório, a URL prevista do Pages é `https://felipesales-12.github.io/Codex/`. Confirme que a publicação está ativa antes de configurar os emails. A URL precisa terminar na pasta do aplicativo, incluindo a barra final. Se você usar outro domínio, configure esse domínio real.

Verifique a entrega dos emails de confirmação e de recuperação. O envio padrão de testes do Supabase tem restrições; para uso regular, configure um provedor SMTP no painel do Supabase conforme as instruções atuais do serviço. Credenciais SMTP ficam somente no painel do provedor, nunca no frontend. O aplicativo não pode garantir a entrega de um email que ainda não foi testada no seu projeto.

## 4. Conectar o site publicado

No repositório GitHub, abra **Settings → Secrets and variables → Actions → Variables** e crie duas **Repository variables**:

| Nome | Valor |
| --- | --- |
| `SUPABASE_URL` | Project URL do seu projeto |
| `SUPABASE_PUBLISHABLE_KEY` | Chave publicável ou `anon` |

São configurações públicas do cliente e aparecem no JavaScript publicado. A proteção dos registros é feita pelo login e pelas regras do banco, não pelo sigilo da chave publicável. Não use a senha do banco nem chaves com privilégios administrativos nesses campos.

Execute novamente **Actions → Publicar Compasso no GitHub Pages → Run workflow**. O workflow lê essas variáveis no build e publica a configuração. Atualizações do aplicativo já instalado podem exibir **Atualizar agora**; finalize edições abertas antes de atualizar.

As variáveis do ambiente de desenvolvimento do Codex são separadas das Repository variables do GitHub. Configurar apenas o ambiente do Codex não configura automaticamente o build executado nos servidores do GitHub.

Para um build local de desenvolvimento, forneça as mesmas duas variáveis ao processo `npm run build`. O script não lê um arquivo `.env` automaticamente. Se ambas estiverem ausentes, gera a versão local sem nuvem. Se apenas uma estiver preenchida ou houver uma chave proibida, interrompe o build para evitar uma conexão inválida.

## 5. Entrar e migrar as atividades existentes

1. Abra o site e vá a **Conta e nuvem**.
2. Crie sua conta com email e senha. Confirme o email recebido e entre.
3. O dashboard passa a exibir as atividades dessa conta. Uma conta nova começa vazia.
4. No navegador/endereço que contém seus registros locais, exporte um backup JSON antes de migrar.
5. Em **Conta e nuvem**, clique em **Enviar atividades locais** e confirme a conta de destino. Uma cópia é acrescentada à nuvem; os originais locais são preservados.
6. Se os registros estiverem em outra origem (por exemplo, no endereço local antigo), exporte o JSON nessa origem e importe-o no site após entrar. **Importar JSON substitui todas as atividades da conta na nuvem**, com confirmação; exporte antes a lista atual.
7. Abra o site em outro aparelho e entre com a mesma conta. Use **Sincronizar agora** para conferir a lista.

Sem acesso à sessão do seu navegador, o assistente não consegue extrair ou enviar os registros já existentes por conta própria. A migração exige o login e a confirmação no navegador que possui os dados, ou a importação do backup que você exportou.

## Regras de funcionamento

- Cada usuário tem sua própria lista. Usar contas diferentes não compartilha as atividades.
- O modo nuvem precisa de internet para ler e confirmar gravações. Não há fila de alterações offline e não existe troca automática para um banco local quando a nuvem falha. O formulário mantém os campos quando não consegue confirmar a gravação.
- Os dados são consultados ao entrar, abrir/recarregar a página, retornar à aba e a cada 30 segundos enquanto a página estiver visível e sem edição aberta. Também existe sincronização manual. Não se trata de um canal em tempo real.
- Uma edição ou exclusão desatualizada é rejeitada. Feche ou preserve os valores do formulário, sincronize e revise a versão atual antes de repetir a alteração. A restauração completa também verifica se outra alteração ocorreu na conta.
- As requisições de gravação usam identificadores idempotentes: repetir a mesma operação após perder a confirmação não cria outro cadastro.
- A sessão de acesso é guardada em `sessionStorage`, separada dos backups, e renovada quando necessário. Depois de fechar a sessão do navegador, pode ser necessário entrar novamente. Senhas não são salvas pelo aplicativo. Em um aparelho compartilhado, use **Sair da conta** ao terminar.
- Tema e preferências permanecem neste aparelho. A importação na nuvem restaura as atividades; não substitui preferências do dispositivo. O backup não inclui tokens, senhas ou revisões internas.
- São aceitas até 50.000 atividades por conta e backups de até 20 MB.

## Backup e recuperação

Armazenamento em nuvem **não garante perda zero**. Faça exportações JSON regulares e mantenha uma cópia em outro local. No Supabase, verifique quais backups, retenção e recuperação são oferecidos pelo plano escolhido; não presuma que recursos pagos de recuperação estejam habilitados. Teste a restauração antes de depender dela.

Exclusões manuais e importações substitutivas afetam a conta em todos os aparelhos. O código não apaga o histórico pelo tempo decorrido, mas não impede limpeza administrativa do banco, perda de acesso à conta ou indisponibilidade do provedor. A política operacional de backup precisa ser configurada no projeto real.

## Testes e limites

`npm test` cobre configuração pública, rejeição de chaves privilegiadas e remoção de metadados do backup. `npm run test:database` executa o SQL real em PostgreSQL 17, em um container Docker temporário, sem rede ou porta pública, verificando RLS, conflitos, idempotência, atomicidade e conexões concorrentes. O script remove o container ao terminar e não utiliza dados do usuário.

`tests/cloud.spec.js` usa respostas de contrato simuladas para testar login, sessões, recuperação, migração, falhas e dois navegadores. Essa simulação não comprova a conexão a um Supabase hospedado, a entrega de emails ou a política de backups do provedor. Esses pontos precisam ser verificados depois que o projeto real estiver configurado. Veja também [TESTES.md](TESTES.md).
