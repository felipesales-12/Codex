import { readFile, writeFile, mkdir, rm, readdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'dist');
export const assets = [
  'index.html', 'favicon.svg', 'manifest.webmanifest', 'css/style.css',
  'js/app.js', 'js/database.js', 'js/tasks.js', 'js/backup.js', 'js/icons.js', 'js/web.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable.png',
];

export async function build() {
  const files = await Promise.all(assets.map(path => readFile(join(root, path))));
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
    } else await copyFile(join(root, path), join(output, path));
  }
  await writeFile(join(output, 'sw.js'), worker.replace('__BUILD_ID__', release).replace('const ASSETS = []; // __ASSETS__', `const ASSETS = ${JSON.stringify(['./', ...assets])};`));
  await writeFile(join(output, '.nojekyll'), '');
  await writeFile(join(output, '.compasso-build'), `${release}\n`);
  console.log(`Frontend web gerado em dist/ · versão ${release} · ${assets.length} arquivos + service worker.`);
  return release;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await build();
