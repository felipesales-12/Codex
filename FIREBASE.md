# Conectar o Firebase ao Compasso

O site usa por padrão Firebase Authentication (email/senha) e Realtime Database do projeto **teste-c321e**. A configuração pública enviada pelo usuário já está em `js/cloud-config.js`. `storageBucket`, `messagingSenderId` e Analytics não são necessários para guardar atividades; não carregamos Analytics. O texto “Não sei como autorizar o dominio” foi desconsiderado ao montar a configuração JavaScript.

## 1. Autorizar o endereço do site

1. Abra https://console.firebase.google.com/project/teste-c321e/authentication/settings.
2. Se aparecer **Começar / Get started**, ative o Authentication primeiro.
3. Vá em **Settings / Configurações → Authorized domains / Domínios autorizados**.
4. Clique **Add domain / Adicionar domínio**.
5. Digite **felipesales-12.github.io**, sem `https://`, sem barra final e sem `/Codex/`, e salve.

O domínio é `felipesales-12.github.io`; a URL completa do aplicativo é `https://felipesales-12.github.io/Codex/`. Não remova os domínios padrão do Firebase. Para desenvolvimento no próprio computador, adicione `localhost` separadamente, se necessário.

## 2. Habilitar login

Em **Authentication → Sign-in method / Método de login → Email/Password / E-mail/senha**, habilite **Email/Password** e salve. Não é necessário habilitar login por link de email. Use **Esqueci minha senha** no dashboard para receber o link de redefinição; o Firebase conclui a redefinição em sua própria página. O cadastro com email/senha já permite entrar e não promete um email de confirmação.

## 3. Publicar as regras do banco

Abra **Build → Realtime Database → Rules / Regras** no projeto `teste-c321e`. Copie o conteúdo completo de [`firebase/database.rules.json`](firebase/database.rules.json), cole no editor e clique em **Publish / Publicar**.

Estas regras foram preparadas para um banco dedicado ao Compasso: bloqueiam outros caminhos. Se esse banco já atende outro aplicativo, preserve as regras existentes e integre o bloco `compasso` com cuidado; permissões públicas em um ancestral não podem ser restringidas por uma regra filha. Faça backup das regras atuais antes de substituir. Não use modo de teste nem `.read: true` / `.write: true` para resolver um erro.

Cada conta acessa somente `compasso/SEU_UID`. O UID vem do Firebase Authentication; o app não usa um email ou uma senha como caminho. As regras conferem proprietário e estrutura dos registros. A configuração Web e a apiKey são públicas; a proteção é feita pelas regras e pelo login. Nunca coloque chaves de conta de serviço ou credenciais administrativas no frontend.

## 4. Entrar e levar as atividades

Abra https://felipesales-12.github.io/Codex/, atualize o aplicativo se solicitado e entre em **Conta e nuvem**. Crie uma conta com email e senha ou entre em uma conta existente deste projeto Firebase. Contas do Supabase não são transferidas automaticamente.

Antes da migração, exporte um backup JSON. Após entrar, clique **Enviar atividades locais** e confirme: uma cópia é acrescentada ao Firebase; os originais neste navegador são preservados. Se as atividades estão no endereço local antigo, exporte lá primeiro. Importar JSON enquanto conectado **substitui todas as atividades da conta** em todos os aparelhos, mediante confirmação; exporte primeiro a lista atual.

Entre com a mesma conta em outro aparelho e clique **Sincronizar agora** para conferir. Informar a configuração não migra atividades por si só. Não é necessário executar o SQL do Supabase para usar o Firebase.

## Comportamento e limites

As tarefas da nuvem não são persistidas em IndexedDB ou pelo service worker. Gravações exigem internet, não entram em fila offline e não caem silenciosamente no modo local quando falham. A sessão fica em sessionStorage, separada dos backups. Ao fechar a sessão do navegador, pode ser necessário entrar novamente. As consultas ocorrem ao abrir, retornar à aba, sincronizar ou a cada 30 segundos; não usamos WebSockets.

O cliente usa ETag / `if-match` do Realtime Database para substituir atomicamente o nó de uma conta. Revisões impedem sobrescrever a mesma atividade editada em outro aparelho; importação/migração verifica também a versão da conta. Um recibo de operação no mesmo nó permite repetir uma gravação cuja resposta se perdeu, sem duplicá-la. Recibos não são removidos automaticamente. O custo de leitura e escrita cresce com o conjunto de atividades e recibos; esta implementação é destinada a um dashboard pessoal, não a grandes equipes.

Os dados existentes no Supabase, caso haja, não foram apagados nem copiados para o Firebase. Para transferi-los, exporte um backup pelo aplicativo conectado ao provedor antigo e importe no Firebase. O adaptador antigo permanece no código; um build com `CLOUD_PROVIDER=supabase`, `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` pode selecioná-lo. Variáveis Supabase antigas sem `CLOUD_PROVIDER=supabase` não mudam o Firebase padrão.

Mantenha backups JSON independentes. Verifique quotas, faturamento e opções de backup/recuperação do seu plano no Firebase; armazenamento remoto não garante perda zero.

## Validação

Os testes usam contas e dados isolados, nunca a conta pessoal do usuário. Testes simulados de HTTP não comprovam as regras hospedadas. Publicar regras, autorizar domínio e habilitar login no projeto real exige acesso administrativo pelo console Firebase; a configuração pública não concede esse acesso. A validação final exige criar/entrar em uma conta no site e conferir uma atividade em outro aparelho.
