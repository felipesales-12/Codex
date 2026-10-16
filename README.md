# Compasso — Gerenciador local de atividades

Aplicação em português para organizar atividades, acompanhar urgências e manter um histórico de conclusões. Feita com HTML, CSS e JavaScript nativo. O modo local usa IndexedDB; o modo nuvem conecta Firebase Authentication e Realtime Database para acesso à mesma conta em outros aparelhos. Não utiliza fontes remotas ou CDN. A instalação começa vazia, sem atividades de exemplo.

**Para ativar o armazenamento na nuvem, siga [FIREBASE.md](FIREBASE.md).** A configuração pública do projeto teste-c321e já está no frontend; falta habilitar login, autorizar o domínio e publicar as regras no console Firebase. Nenhuma atividade foi migrada automaticamente. O adaptador anterior do Supabase continua disponível e documentado em [NUVEM.md](NUVEM.md). As instruções de uso sem internet abaixo descrevem o modo local; gravações na nuvem precisam de conexão.

## Abrir pela internet — GitHub Pages

O frontend também está preparado para publicação no GitHub Pages. O workflow `.github/workflows/pages.yml` instala as dependências pelo lockfile, executa os testes de regras, gera `dist/` e publica somente os arquivos públicos da interface. A navegação e os arquivos usam caminhos relativos, compatíveis com a subpasta `/Codex/`.

No repositório `felipesales-12/Codex`, configure **Settings → Pages → Build and deployment → Source → GitHub Actions**. Depois de um push em `main`, acompanhe o workflow **Publicar Compasso no GitHub Pages** na aba **Actions**. Se a opção só for ativada após o push inicial, use **Run workflow** para executar a publicação novamente. O endereço confirmado deve ser obtido do resultado da implantação ou da página de configuração; a presença do workflow no repositório não prova que o site foi publicado.

O site HTTPS não requer Python ou instalação no computador do usuário. Após a primeira visita e a preparação do cache, o build pode abrir a interface offline e ser instalado como aplicativo quando o navegador oferecer essa opção. No modo local, os dados continuam no IndexedDB por navegador/origem. Com a nuvem configurada, entre na mesma conta para consultar e salvar no banco remoto; esse modo precisa de internet. Para migrar atividades antigas, siga [NUVEM.md](NUVEM.md). Não envie backups ou dados pessoais ao repositório.

## Acessar como site na rede local

Para acessar o frontend pelo navegador de computadores e celulares no mesmo Wi-Fi ou rede cabeada:

1. No computador que ficará como servidor, instale **Python 3.9+**, extraia o projeto e execute **`iniciar-rede.bat`**.
2. Mantenha a janela aberta. Ela exibirá um ou mais endereços IPv4 do computador na porta **8765**.
3. Nos outros aparelhos conectados à mesma rede, digite o endereço exibido, no formato **`http://IP-DO-COMPUTADOR:8765`**. Substitua `IP-DO-COMPUTADOR` pelo IPv4 real mostrado no terminal; isso é um formato de exemplo, não um link de acesso.
4. Se o Windows solicitar permissão de firewall, permita o Python na rede **privada** usada pelos aparelhos.

Somente o computador servidor precisa de Python. Os demais acessam a interface completa por Edge, Chrome ou Firefox atualizados; não precisam baixar o projeto ou instalar pacotes. O servidor entrega HTML, CSS, JavaScript e ícones locais. Nenhum serviço na internet é necessário para o uso na rede.

**As atividades ficam no navegador de cada aparelho e não são compartilhadas automaticamente.** O servidor distribui a interface, não armazena tarefas dos clientes. Para transferir registros entre perfis ou aparelhos, use exportação e importação JSON. Não existe backend de sincronização ou banco central.

Use sempre o mesmo endereço IP, porta, navegador e perfil. O endereço `localhost` no computador servidor e o IP da rede são origens diferentes: suas bases não se misturam. Se você já utilizava `localhost`, exporte um backup antes de passar a usar o IP. Para evitar mudanças de endereço, configure uma reserva DHCP no roteador para o computador servidor, se disponível.

Veja o passo a passo curto e a solução de problemas em [ACESSO-REDE.md](ACESSO-REDE.md).

Em Linux/macOS, o comando equivalente é:

```sh
python3 server.py --network --no-browser
```

O modo de rede escuta nas interfaces IPv4 (`0.0.0.0`) na porta fixa 8765. Para encerrar, pressione **Ctrl+C** na janela do servidor. Os dados continuam no navegador; o servidor precisa ser iniciado novamente para abrir/recarregar a interface pela rede. O projeto está preparado para uso na rede local, sem publicação pública.

## Usar somente no próprio computador Windows

1. Instale **Python 3.9 ou superior**, caso ainda não tenha. Obtenha o instalador em https://www.python.org/downloads/windows/ e marque **Add Python to PATH**. A instalação inicial exige obter o Python; o uso diário não exige internet.
2. Extraia todos os arquivos do projeto para uma pasta no computador.
3. Dê dois cliques em **`iniciar.bat`**. O iniciador procura `py -3` e, como alternativa, `python`, verificando a versão.
4. O navegador padrão abrirá o sistema. Mantenha a janela do servidor aberta enquanto utiliza a aplicação.

O endereço fixo é **`http://localhost:8765`**. Não abra `index.html` por duplo clique. Não troque `localhost` por `127.0.0.1`, não altere a porta e não mude de perfil do navegador: cada origem/perfil tem seu próprio banco de dados. Se o navegador padrão for alterado, abra o sistema no navegador/perfil que utilizava antes.

No modo `iniciar.bat` (sem `--network`), o servidor aceita conexões somente do próprio computador, na interface `127.0.0.1`. Não é necessário configurar banco de dados, Node.js ou instalar pacotes para usar o sistema.

### Fechar e voltar no dia seguinte

Depois de conferir a confirmação de gravação, pode fechar a aba. Para encerrar o servidor, pressione **Ctrl+C** na janela do terminal; o iniciador poderá solicitar uma tecla para sair. No próximo acesso, execute `iniciar.bat` novamente e use o mesmo navegador, perfil e endereço. As tarefas permanecem no IndexedDB entre sessões normais e reinicializações do computador.

Se a porta estiver ocupada, o servidor informa o problema e **não escolhe outra porta**. Verifique se já existe uma janela do Compasso aberta. Se outro programa estiver usando a porta 8765, encerre ou reconfigure esse outro programa. Não altere a origem do Compasso para contornar o problema sem antes exportar seus dados.

### Outros sistemas

Na pasta do projeto:

```sh
python3 server.py
```

Para iniciar sem abrir o navegador automaticamente, use `python3 server.py --no-browser`. No Windows, o equivalente é `py -3 server.py --no-browser`.

## Uso diário

- **Dashboard:** seis indicadores atualizados após as operações, atividades ativas ordenadas por atraso/urgência, contadores por prioridade, aviso de atrasos e cadastros recentes. Clique nos indicadores para abrir as listas correspondentes. “Ver todas” abre todas as atividades ativas.
- **Nova atividade:** informe nome, solicitante e local. Selecione uma das quatro urgências, prazo opcional, status, descrição e observações. A data de cadastro e o identificador são gerados automaticamente.
- **Pendentes / Em andamento:** pesquise por nome, solicitante, descrição, local ou observações. A busca ignora maiúsculas e acentos. Combine urgência, solicitante e intervalo de cadastro. Na lista de todas as ativas, combine também o status. Ordene por prioridade/atraso, cadastro recente, cadastro antigo ou prazo mais próximo. As listas exibem até 50 registros por vez e oferecem “Mostrar mais”.
- **Ações por atividade:** iniciar, concluir em um clique, editar, duplicar e excluir com confirmação. Duplicar abre um formulário com novo cadastro, novo identificador e status pendente. Clique no nome para consultar descrição e observações completas, identificador e datas.
- **Histórico de concluídas:** seção independente, ordenada inicialmente pela conclusão mais recente, com busca e filtros de urgência, solicitante e intervalo de conclusão. Os detalhes exibem data/hora de conclusão e tempo decorrido desde o cadastro. Restaurar requer confirmação e devolve a atividade a pendentes, mantendo ID e cadastro e limpando a conclusão atual. É possível editar, duplicar, exportar e excluir permanentemente com confirmação. Não existe expiração automática do histórico.
- **Backup e restauração:** exporte JSON completo, restaure um JSON validado e exporte relatórios CSV de todas as ativas ou de todo o histórico. Os CSVs incluem todos os registros da categoria, independentemente dos filtros da tela.
- **Configurações:** escolha tema claro, escuro ou do sistema. A preferência é salva no IndexedDB. Solicite, opcionalmente, proteção de armazenamento persistente ao navegador; ele pode negar a solicitação.

As operações só exibem confirmação depois da transação do IndexedDB ser concluída. Em caso de falha de gravação, o sistema exibe um erro e mantém o formulário preenchido. O botão fica desativado durante a gravação para impedir duplicações por cliques repetidos. Abas abertas recebem avisos de atualização por `BroadcastChannel`; prefira editar uma mesma atividade em apenas uma aba por vez.

## Persistência e backups: leia antes de usar

**O IndexedDB fica no perfil do navegador, não em um arquivo dentro da pasta do projeto.** Copiar a pasta do Compasso não copia as atividades. Apagar dados do site, remover o perfil, perder o disco ou utilizar navegação privada pode causar perda dos registros. O sistema não promete persistência absoluta e não envia cópias para a nuvem. A concessão de armazenamento persistente também não protege contra limpeza manual, perda do perfil ou falha do computador.

Recomendação: ao final do dia, abra **Backup e restauração → Baixar backup JSON** e confirme que o arquivo foi salvo. Guarde cópias datadas em uma pasta segura ou unidade externa. A data da última exportação indica que o download foi iniciado, não verifica onde o arquivo foi guardado.

Para migrar de computador ou navegador, exporte o JSON no ambiente antigo, abra o Compasso no novo e importe esse arquivo. A importação **substitui todas as atividades e preferências**, não mescla registros. Faça uma exportação atual antes de restaurar. Cancelar a confirmação mantém os dados atuais.

O JSON contém versão do formato, data de exportação, atividades completas e preferências. O importador valida estrutura, campos obrigatórios, enumerações, datas e IDs únicos antes da confirmação. Aceita até 20 MB e 50.000 atividades. A substituição é feita em uma transação única para evitar importação parcial. IDs, status, textos e datas são preservados. Backups podem conter informações de trabalho: guarde-os com o cuidado adequado.

CSV é um relatório para planilhas e **não é usado para restaurar**. Usa UTF-8 com BOM, separador `;`, proteção de fórmulas e campos entre aspas, preservando quebras de linha. As datas dos registros são exportadas em ISO/UTC; a interface exibe datas e horários no fuso local do computador. Filtros de cadastro/conclusão consideram o dia local. O prazo vence depois do fim do dia informado.

## Funcionamento sem internet

Todos os arquivos da interface e seus ícones são locais. Com Python instalado e o servidor local aberto, a aplicação pode ser iniciada, recarregada e utilizada sem internet. No modo Python, o acesso é servido localmente e não depende de um service worker. Desconectar a internet não afeta o HTTP de loopback no próprio computador nem o acesso pela rede local, desde que os aparelhos continuem conectados à mesma rede. Encerrar o servidor impede novos carregamentos da página, mas não apaga o banco.

## Estrutura

```text
index.html                 Estrutura, navegação e modais acessíveis
favicon.svg                Ícone local
css/style.css              Layout responsivo, temas e estilos
js/database.js             IndexedDB, transações e preferências
js/cloud-config.js         Configuração pública e validação de chaves
js/cloud.js                Seleção do provedor de nuvem
js/firebase-cloud.js       Login, sessões e gravações atômicas Firebase
js/supabase-cloud.js       Adaptador anterior do Supabase
firebase/database.rules.json Regras de isolamento por conta no Firebase
js/account.js              Tela de conta e migração
supabase/schema.sql        Banco e regras de isolamento por usuário
NUVEM.md                   Ativação do serviço e política de backups
js/tasks.js                Modelo, filtros, ordenação e indicadores
js/backup.js               Validação JSON, exportação e CSV
js/icons.js                Ícones SVG locais
js/app.js                  Interface e integração dos fluxos
server.py                  Servidor HTTP local sem dependências
iniciar.bat                Iniciador Windows (uso no próprio computador)
iniciar-rede.bat           Iniciador Windows para a rede local
manifest.webmanifest      Identidade e instalação do aplicativo web
icons/                    Ícones locais
js/web.js                 Estado de conexão, instalação e atualização web
sw.js                     Cache offline do build web
scripts/                  Build e servidor de preview
ACESSO-REDE.md             Guia rápido para computadores e celulares
tests/unit.test.js         Testes de regras, filtros, métricas e backup
tests/app.spec.js          Testes de navegador com IndexedDB real
tests/lan.spec.js          Contexto HTTP de rede e servidor LAN
tests/web/                 Build web e recarga offline
playwright*.config.js      Configurações dos testes de navegador
package.json / lockfile    Dependências exclusivas de desenvolvimento
```

## Desenvolvimento e testes

O modo Python não exige build. Edite os arquivos e recarregue o navegador. O modo de desenvolvimento não registra um service worker, para que o cache não esconda alterações. Para os testes automatizados, use Node.js 18+ (recomendado 24 LTS), Python 3.9+ e Chromium:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
npx playwright install chromium
npm run test:e2e
```

A instalação do navegador de testes requer internet uma vez. Em Linux, se necessário, instale as bibliotecas do Chromium com as instruções oficiais do Playwright. A configuração usa `/usr/bin/chromium` quando disponível; também aceita o caminho de um navegador em `CHROMIUM_PATH`. Em outros ambientes, utiliza o Chromium instalado pelo Playwright. O runner inicia o servidor automaticamente na porta 8765 ou reutiliza um servidor local existente fora de CI. Encerre instâncias manuais antes de executar em CI. Para o desenvolvimento diário do aplicativo, nenhum pacote npm é necessário.

### Build opcional do frontend web

```sh
npm run build
npm run preview
npm run test:web
```

O build gera **`dist/`**, contendo apenas os arquivos públicos da interface, manifesto, ícones e service worker. Scripts do servidor, documentação, testes, dependências npm e metadados Git não entram no pacote web. O preview usa a porta 4173 por padrão, com escuta apenas no próprio computador. Para testar o pacote em rede, defina `HOST=0.0.0.0` antes de executar o preview. Essa porta é outra origem: não reutiliza o banco da porta 8765. O comando `npm run test:web` inicia o preview automaticamente quando ausente.

A versão compilada pode preparar cache para reabrir sem conexão e instalação como aplicativo, quando acessada em **HTTPS ou localhost**. Em um IP da rede com HTTP comum, o navegador não oferece service workers; a aplicação continua funcional, mas o computador servidor deve permanecer acessível para carregar/recarregar o site. Isso não exige internet. O IndexedDB funciona nesse modo, e a geração dos identificadores foi adaptada ao contexto HTTP da rede.

### Validação realizada neste ambiente

Veja [TESTES.md](TESTES.md) para os comandos, resultados e limites de verificação. Testes usam contextos de navegador isolados e não criam atividades de exemplo no seu perfil de uso. O fluxo completo foi validado em Chromium/Linux; a execução dos iniciadores `.bat` em Windows e uma reinicialização física do computador não puderam ser executadas neste ambiente Linux.
