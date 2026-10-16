// Contract fixture only. RLS and transactions are tested separately in REAL PostgreSQL.
import { readFile } from 'node:fs/promises';
const project = 'https://compasso-test.supabase.co';
const configSource = await readFile(new URL('../../js/cloud-config.js', import.meta.url), 'utf8');
const users = {
  'ana@example.test': { id: '11111111-1111-4111-8111-111111111111', email: 'ana@example.test' },
  'bia@example.test': { id: '22222222-2222-4222-8222-222222222222', email: 'bia@example.test' },
};
export function backendFixture() {
  const backend = { accounts: new Map(), tokens: new Map(), refreshTokens: new Map(), writes: [], failWrites: false, failReads: false, loseAcknowledgement: false, recoveries: [], passwordChanges: 0 };
  backend.account = email => {
    const user = users[email];
    if (!backend.accounts.has(user.id)) backend.accounts.set(user.id, { version: 0, tasks: new Map(), operations: new Map() });
    return backend.accounts.get(user.id);
  };
  backend.session = email => {
    const user = users[email];
    const access_token = `access-${user.id}-${Math.random()}`;
    const refresh_token = `refresh-${user.id}-${Math.random()}`;
    backend.tokens.set(access_token, user);
    backend.refreshTokens.set(refresh_token, user);
    return { access_token, refresh_token, expires_in: 3600, user };
  };
  backend.mutate = (email, id, changes) => {
    const account = backend.account(email), row = account.tasks.get(id);
    account.version++;
    row.payload = { ...row.payload, ...changes }; row.revision = account.version;
  };
  return backend;
}
export async function configureCloudFixture(context, value) {
  await context.route('**/js/cloud-config.js', route => route.fulfill({
    contentType: 'text/javascript',
    body: configSource.replace(/export const cloudConfig = Object\.freeze\(\{[^\n]*\}\);/, `export const cloudConfig = Object.freeze(${JSON.stringify(value)});`),
  }));
}
export async function connectFixture(context, backend) {
  await configureCloudFixture(context, { url: project, publishableKey: 'sb_publishable_test_key' });
  await context.route(`${project}/**`, async route => {
    const request = route.request(), url = new URL(request.url());
    const data = request.postDataJSON() || {};
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'apikey,authorization,content-type' }, body: JSON.stringify(body) });
    if (request.method() === 'OPTIONS') return json({});
    if (url.pathname === '/auth/v1/token') {
      const user = url.searchParams.get('grant_type') === 'refresh_token' ? backend.refreshTokens.get(data.refresh_token) : users[data.email];
      if (!user || (data.password && data.password !== 'Teste-seguro-123')) return json({ code: 'invalid_credentials' }, 401);
      return json(backend.session(user.email));
    }
    if (url.pathname === '/auth/v1/signup') return json({ id: users['ana@example.test'].id });
    if (url.pathname === '/auth/v1/recover') { backend.recoveries.push(data.email); return json({}); }
    const token = (request.headers().authorization || '').replace('Bearer ', '');
    const user = backend.tokens.get(token);
    if (!user) return json({ code: 'bad_jwt' }, 401);
    if (url.pathname === '/auth/v1/user') {
      if (request.method() === 'PUT') backend.passwordChanges++;
      return json(user);
    }
    if (url.pathname === '/auth/v1/logout') { backend.tokens.delete(token); return json({}); }
    const account = backend.account(user.email);
    if (url.pathname === '/rest/v1/rpc/compasso_snapshot') {
      if (backend.failReads) return json({}, 503);
      return json({ version: account.version, tasks: [...account.tasks.values()] });
    }
    if (url.pathname !== '/rest/v1/rpc/compasso_apply') return json({}, 404);
    backend.writes.push(structuredClone(data));
    if (backend.failWrites) return route.abort();
    if (account.operations.has(data.p_request_id)) return json(account.operations.get(data.p_request_id));
    const task = data.p_task, previous = account.tasks.get(task?.id || data.p_task_id);
    if (['put', 'delete'].includes(data.p_operation) && previous?.revision !== data.p_expected_revision) return json({ code: '40001' }, 409);
    if (['replace', 'merge'].includes(data.p_operation) && account.version !== data.p_expected_version) return json({ code: '40001' }, 409);
    if (data.p_operation === 'add' && previous) return json({ code: '23505' }, 409);
    const next = account.version + 1;
    if (['add', 'put'].includes(data.p_operation)) account.tasks.set(task.id, { payload: task, revision: next });
    if (data.p_operation === 'delete') account.tasks.delete(data.p_task_id);
    if (['replace', 'merge'].includes(data.p_operation)) {
      if (data.p_operation === 'replace') account.tasks.clear();
      for (const item of data.p_tasks) if (!account.tasks.has(item.id)) account.tasks.set(item.id, { payload: item, revision: next });
    }
    account.version = next;
    const result = { version: next };
    account.operations.set(data.p_request_id, result);
    if (backend.loseAcknowledgement) { backend.loseAcknowledgement = false; return route.abort(); }
    return json(result);
  });
}
