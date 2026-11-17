# Acesso da fábrica

Para produção, publique dist/ em HTTPS (por exemplo, GitHub Pages) e entre em cada dispositivo com um usuário autorizado. O estoque é compartilhado via Supabase.

Para verificar o layout na rede local, execute iniciar-rede.bat e acesse o IP do computador na porta 4173. O acesso HTTP na rede é apenas para desenvolvimento; use HTTPS para autenticação em produção. Não é necessário compartilhar uma pasta nem expor a porta do banco. Veja o [README](README.md).
