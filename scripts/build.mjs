import { readFile, writeFile, mkdir, rm, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { cloudConfig, validateCloudConfig } from '../js/cloud-config.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'dist');
export const assets = [
  'index.html', 'favicon.svg', 'manifest.webmanifest', 'css/style.css',
  'js/app.js', 'js/database.js', 'js/tasks.js', 'js/backup.js', 'js/icons.js', 'js/web.js', 'js/cloud-config.js', 'js/cloud.js', 'js/account.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable.png',
];

export async function build() {
  const files = await Promise.all(assets.map(path => readFile(join(root, path))));
  const override = Boolean(process.env.SUPABASE_URL?.trim() || process.env.SUPABASE_PUBLISHABLE_KEY?.trim());
  const cloud = validateCloudConfig(override ? { url: process.env.SUPABASE_URL, publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY } : cloudConfig);
  const configIndex = assets.indexOf('js/cloud-config.js');
  const declaration = /export const cloudConfig = Object\.freeze\(\{[^\n]*\}\);/;
  if (!declaration.test(files[configIndex].toString())) throw new Error('Declaração da configuração pública não encontrada. O build foi interrompido.');
  files[configIndex] = Buffer.from(files[configIndex].toString().replace(declaration, `export const cloudConfig = Object.freeze(${JSON.stringify({ url: cloud.url, publishableKey: cloud.publishableKey })});`));
  const worker = await readFile(join(root, 'sw.js'), 'utf8');
  const hash = createHash('sha256');
  files.forEach((data, index) => { hash.update(assets[index]); hash.update(data); });
  hash.update(worker);
  const release = hash.digest('hex').slice(0, 16);
  try {
    const entries = await readdir(output);
    if (entries.length && !entries.includes('.compasso-build')) throw new Error('A pasta dist já contém arquivos que não foram gerados por este build. Preserve-os antes de continuar.');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  for (const [index, path] of assets.entries()) {
    await mkdir(join(output, path, '..'), { recursive: true });
    if (path === 'index.html') {
      await writeFile(join(output, path), files[index].toString().replace('name="compasso-release" content="development"', `name="compasso-release" content="${release}"`));
    } else await writeFile(join(output, path), files[index]);
  }
  await writeFile(join(output, 'sw.js'), worker.replace('__BUILD_ID__', release).replace('const ASSETS = []; // __ASSETS__', `const ASSETS = ${JSON.stringify(['./', ...assets])};`));
  await writeFile(join(output, '.nojekyll'), '');
  await writeFile(join(output, '.compasso-build'), `${release}\n`);
  console.log(`Frontend web gerado em dist/ · versão ${release} · ${assets.length} arquivos + service worker.`);
  return release;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await build();
