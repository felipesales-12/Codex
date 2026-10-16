import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, resolve, sep } from 'node:path';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '127.0.0.1';
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
try { await stat(resolve(root, 'index.html')); }
catch { console.error('Execute npm run build antes de iniciar a versão web.'); process.exit(1); }

createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405).end(); return; }
  try {
    const url = new URL(request.url, 'http://preview.local');
    // /Codex/ validates hosting under the repository path, as on GitHub Pages.
    if (url.pathname === '/Codex') { response.writeHead(301, { Location: '/Codex/' }).end(); return; }
    const path = decodeURIComponent(url.pathname.replace(/^\/Codex\//, '/'));
    const segments = path.split('/').filter(Boolean);
    if (segments.some(segment => segment.startsWith('.'))) { response.writeHead(404).end(); return; }
    const file = await realpath(resolve(root, `.${path.endsWith('/') ? `${path}index.html` : path}`));
    if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) { response.writeHead(404).end(); return; }
    const content = await readFile(file);
    response.writeHead(200, {
      'Content-Type': types[extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://*.supabase.co https://*.firebaseio.com https://*.firebasedatabase.app https://identitytoolkit.googleapis.com https://securetoken.googleapis.com; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch { response.writeHead(404).end('Arquivo não encontrado.'); }
}).listen(port, host, () => console.log(`Frontend web na porta ${port}, interface ${host}. Ctrl+C para encerrar.`));
