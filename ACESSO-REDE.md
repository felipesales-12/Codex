# Abrir o Compasso pelo navegador na rede local

## No computador servidor (Windows)

1. Instale Python 3.9+ se necessário, com a opção **Add Python to PATH**.
2. Extraia todos os arquivos do projeto.
3. Feche uma instância anterior do Compasso que esteja usando a porta 8765.
4. Execute **`iniciar-rede.bat`** e mantenha a janela aberta.
5. Se o Firewall do Windows perguntar, permita o acesso ao Python na sua rede **privada**.

A janela exibirá o endereço do computador. Se houver vários endereços, use o IPv4 da placa conectada ao seu Wi-Fi ou cabo de rede. Você também pode consultá-lo com `ipconfig` no Windows, no adaptador conectado.

## Nos outros computadores e celulares

1. Conecte o aparelho ao mesmo Wi-Fi/rede do computador servidor.
2. Abra um navegador atualizado.
3. Digite `http://IP-DO-COMPUTADOR:8765`, substituindo `IP-DO-COMPUTADOR` pelo IPv4 exibido no servidor.

Não digite `0.0.0.0`. Nos outros aparelhos, `localhost` aponta para o próprio aparelho, e não para o computador servidor.

O frontend permite cadastrar, editar, iniciar, concluir, pesquisar, consultar histórico e fazer backups. Os aparelhos clientes não precisam instalar Python, Node.js ou baixar o projeto.

## Onde ficam as atividades

Cada navegador/aparelho tem seu próprio banco IndexedDB. **Não existe uma lista compartilhada entre os aparelhos.** Exportar e importar JSON permite transferir os registros; a importação substitui o conteúdo atual do navegador de destino.

Use sempre o mesmo IP, porta 8765, navegador e perfil. Mudar a origem cria um espaço de armazenamento diferente. Um backup exportado no endereço antigo permite migrar. Para manter o IP estável, use uma reserva DHCP para o computador servidor no roteador, quando disponível.

Faça backups regularmente. Apagar os dados do navegador ou perder o perfil pode remover os registros.

## Se não abrir

- Confirme que a janela de `iniciar-rede.bat` continua aberta e não informou erro de porta ocupada.
- Confirme o IPv4 atual do computador servidor e a porta 8765.
- Verifique se os aparelhos estão na mesma rede e se o Python está permitido no Firewall do Windows para essa rede privada.
- Redes Wi-Fi de convidados podem impedir a comunicação entre aparelhos. Use uma rede que permita essa comunicação.
- Se o endereço abrir mas as atividades antigas não aparecerem, confira o navegador/perfil e o endereço usados antes. IP de rede e `localhost` têm bases separadas.

## Fechar e voltar depois

Para encerrar, pressione **Ctrl+C** no servidor. Os registros continuam no navegador dos clientes. Execute `iniciar-rede.bat` novamente para voltar a carregar a interface pelos outros aparelhos.

Não é necessário acesso à internet para o uso diário, mas o computador servidor e a rede local precisam estar disponíveis. A instalação opcional como aplicativo e o cache para recarregar sem servidor exigem uma origem segura (HTTPS ou localhost); em IP com HTTP comum, use o navegador com o servidor aberto.
