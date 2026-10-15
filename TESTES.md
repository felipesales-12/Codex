# Validação do Compasso

Validação em ambiente Linux com Python 3.12.14, Node.js 24.19.0, Playwright 1.61.1 e Chromium instalado no sistema.

## Resultado

- `npm ci --ignore-scripts --no-audit --no-fund`: instalação reproduzível pelo lockfile concluída.
- `npm test`: **7 testes unitários passaram**, sem falhas, testes ignorados ou pendentes.
- `LAN_BROWSER_TRANSPORT=api npm run test:e2e`: **13 testes de navegador passaram**, sem falhas, testes ignorados ou pendentes, incluindo três testes de rede local.
- `npm run build`: frontend público gerado em `dist/`, com manifesto, ícones e cache versionado; sem arquivos do servidor ou do repositório.
- `npm run test:web`: **3 testes do build web passaram**, sem falhas, testes ignorados ou pendentes, incluindo recarga com a rede totalmente offline.
- **Total final: 23 testes passaram.**
- Servidor `python3 server.py --network --no-browser`: página inicial, módulos, manifesto e ícones responderam por HTTP real em um IP IPv4 da máquina. Arquivos internos retornaram HTTP 404.
- Revisão visual do dashboard em 1440 px e captura do layout móvel em 390 px; sem rolagem horizontal da página no teste móvel. Tabelas extensas possuem rolagem interna.

## Cobertura funcional

| Requisito | Verificação executada |
| --- | --- |
| Cadastro | Campos obrigatórios, geração de identidade/datas, gravação e atualização dos indicadores |
| Persistência | Recarga da página e fechamento/reabertura real do Chromium com o mesmo perfil temporário |
| Edição | Alteração de título e observações, preservando ID e data de cadastro |
| Início | Mudança de pendente para em andamento e atualização dos indicadores |
| Conclusão | Saída da lista ativa, registro da conclusão e atualização de indicadores de hoje e histórico |
| Histórico | Consulta, detalhes completos e permanência após recarga |
| Restauração | Confirmação, retorno a pendentes, identidade preservada e limpeza da conclusão atual |
| Duplicação | Novo ID e registro independente após salvar o formulário |
| Exclusão | Cancelamento preserva registros; confirmação exclui e a exclusão permanece após recarga |
| Indicadores | Ativas, pendentes, em andamento, críticas, concluídas hoje e histórico |
| Busca e filtros | Busca sem acentos, urgência, status, solicitante, intervalo de datas, ordenação e atalhos do dashboard |
| JSON | Exportação real por download, cancelamento da substituição e restauração com comparação de todos os campos |
| Validação de backup | Arquivo malformado, formato incompatível e IDs duplicados rejeitados sem alterar o banco |
| CSV | Download real de ativas/histórico; acentos, texto multilinha, aspas e neutralização de fórmulas |
| Uso sem internet | Cadastro, conclusão, navegação e CSV com rede inteiramente desativada no contexto do navegador; recarga posterior com HTTP local permitido e destinos externos bloqueados |
| Tema | Alternância para escuro e preservação após recarga |
| Responsividade | Navegação móvel, abertura/fechamento do menu e ausência de overflow global em 390 px |
| Validação e cliques repetidos | Campos só com espaços rejeitados; dois cliques de envio geram um registro |
| Conteúdo HTML em campos | Texto potencialmente executável é exibido como texto, sem criar elementos HTML |
| Falha de gravação | Erro de quota simulado: formulário e seus valores permanecem e nenhum registro falso é criado |
| Falha de leitura inicial | Indisponibilidade do banco é informada em vez de apresentar uma lista vazia |
| Atomicidade | Falha deliberada por chave duplicada aborta uma substituição inteira e preserva os dados anteriores |
| Falha após gravação | Se a gravação termina e a releitura falha, a interface informa que os dados foram salvos e não solicita outro cadastro |
| Rede local e HTTP | Cadastro, edição, início, conclusão, histórico e recarga em origem HTTP por IP; contexto não seguro real do navegador com `crypto.randomUUID` indisponível, verificando o UUID alternativo e IndexedDB |
| Separação dos dados | IP da rede e localhost mantêm bases distintas; outro contexto de navegador não recebe os registros do primeiro |
| Arquivos servidos | Manifesto, ícones, JavaScript e CSS acessíveis por IP; documentação, testes, scripts Python e metadados Git não são expostos |
| Build web | Manifesto e ícones disponíveis; aplicativo abre na raiz e em uma subpasta, com caminhos relativos corretos |
| Cache offline do build | Após preparar o cache em localhost, recarga, cadastro, conclusão e histórico funcionam com o contexto do navegador totalmente sem rede |

Os registros dos testes ficam em perfis isolados. O projeto entregue inicia sem dados de demonstração. As falhas induzidas nos testes de tratamento de erros são esperadas e seus testes passaram.

## Limites da validação

- **Windows:** este ambiente executa Linux. Os arquivos `iniciar.bat` e `iniciar-rede.bat` foram preparados com detecção de Python e endereço fixo, mas não foram executados em Windows. A conexão a partir de um segundo aparelho físico não pôde ser executada neste ambiente.
- **Transporte dos testes LAN:** a tentativa inicial de navegação direta pelo Chromium ao IP privado recebeu `Domain forbidden` do proxy do ambiente. Os testes HTTP por IP com `APIRequestContext` responderam normalmente. Nos dois testes de interface por IP, usou-se `LAN_BROWSER_TRANSPORT=api`: as requisições do navegador foram atendidas por esse cliente HTTP, lendo as respostas reais do servidor e preservando a origem IP, o contexto não seguro e as regras de armazenamento no Chromium. Não foram substituídos por HTML fictício. Sem essa variável, os mesmos testes usam navegação direta, adequada a uma rede local normal. A navegação direta do Chromium ao IP privado permanece não validada neste ambiente de nuvem devido ao proxy.
- **Reinicialização física:** não foi possível desligar/reiniciar a máquina. A persistência foi verificada entre recargas e processos independentes do navegador, usando IndexedDB real em um perfil persistente.
- **Desconexão física:** foi usada a simulação de rede offline do Playwright e o bloqueio de destinos externos. Não houve desligamento físico de uma interface de rede. No modo Python, o uso diário mantém o HTTP local ou LAN para servir os arquivos. O cache do build foi testado em localhost; service workers não estão disponíveis em IP com HTTP comum.
- **Outros navegadores:** Edge e Firefox não foram executados nesta validação. A aplicação usa APIs web nativas disponíveis nas versões atuais; use um perfil normal que permita IndexedDB.
- **Proteção de armazenamento:** a decisão de conceder armazenamento persistente cabe ao navegador; não é uma garantia de backup nem de proteção contra limpeza manual.
