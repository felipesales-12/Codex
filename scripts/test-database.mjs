import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const exec = promisify(execFile);
const name = `compasso-test-${randomUUID().slice(0, 8)}`;
const image = 'postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24';
async function psql(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['exec', '-i', name, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres']);
    let output = '';
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', data => { output += data; });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(output) : reject(new Error(output)));
    child.stdin.end(sql);
  });
}
try {
  // Isolated fixture: no network, no host port, no persisted user volume.
  await exec('docker', ['run', '-d', '--rm', '--name', name, '--network', 'none', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', image]);
  let healthy = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    try { await exec('docker', ['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']); healthy = true; break; }
    catch { await new Promise(resolve => setTimeout(resolve, 250)); }
  }
  if (!healthy) throw new Error('O PostgreSQL de teste não iniciou.');
  const root = new URL('../', import.meta.url);
  await psql(await readFile(new URL('tests/database-bootstrap.sql', root), 'utf8'));
  const schema = await readFile(new URL('supabase/schema.sql', root), 'utf8');
  await psql(schema);
  await psql(schema); // Installation is repeatable and does not destroy existing data.
  const output = await psql(await readFile(new URL('tests/database.sql', root), 'utf8'));
  const checks = output.split('\n').filter(line => line.includes('PASS:'));
  checks.forEach(line => console.log(line.replace(/^NOTICE:\s*/, '')));
  const edit = id => `set role authenticated; select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false); select public.compasso_apply('${id}','put',p_task=>public.test_task('one','Edição concorrente'),p_expected_revision=>4);`;
  const concurrent = await Promise.allSettled([psql(edit(randomUUID())), psql(edit(randomUUID()))]);
  if (concurrent.filter(result => result.status === 'fulfilled').length !== 1) throw new Error('Duas edições concorrentes com a mesma revisão devem produzir exatamente um sucesso.');
  console.log('PASS: duas conexões concorrentes não sobrescrevem a mesma revisão');
  console.log(`PostgreSQL real: ${checks.length + 1} verificações passaram. Supabase hospedado ainda exige configurar um projeto real.`);
} finally {
  await exec('docker', ['rm', '-f', name]).catch(() => {});
}
