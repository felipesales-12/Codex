// HTTP contract fixture, independent from Firebase's real rules emulator tests.
import { configureCloudFixture } from './cloud-fixture.js';
export const project = 'https://compasso-test.firebaseio.com';
export function backendFixture() {
  const backend = { accounts: new Map(), tokens: new Map(), refreshTokens: new Map(), failWrites: false, failReads: false, loseAcknowledgement: false, race: null, writes: [], recoveries: [] };
  backend.account = email => {
    if (!backend.accounts.has(email)) backend.accounts.set(email, { data: null, etag: 0 });
    return backend.accounts.get(email);
  };
  backend.session = email => {
    const localId = email.startsWith('ana') ? 'ana-uid' : 'bia-uid';
    const idToken = `access-${Math.random()}`, refreshToken = `refresh-${Math.random()}`;
    backend.tokens.set(idToken, { localId, email }); backend.refreshTokens.set(refreshToken, { localId, email });
    return { idToken, refreshToken, email, localId, expiresIn: '3600' };
  };
  return backend;
}
export async function connectFixture(context, backend) {
  await configureCloudFixture(context, { provider: 'firebase', apiKey: 'AIza' + 'a'.repeat(35), projectId: 'compasso-test', authDomain: 'compasso-test.firebaseapp.com', databaseURL: project });
  const json = (route, data, status = 200, headers = {}) => route.fulfill({ status, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type,x-firebase-etag,if-match', 'Access-Control-Expose-Headers': 'ETag', ...headers }, body: JSON.stringify(data) });
  await context.route('https://identitytoolkit.googleapis.com/**', route => {
    const data = route.request().postDataJSON(), url = route.request().url();
    if (url.includes('sendOobCode')) { backend.recoveries.push(data.email); return json(route, {}); }
    if (data.password !== 'Teste-seguro-123') return json(route, { error: { message: 'INVALID_LOGIN_CREDENTIALS' } }, 400);
    return json(route, backend.session(data.email));
  });
  await context.route('https://securetoken.googleapis.com/**', route => {
    const data = new URLSearchParams(route.request().postData()), user = backend.refreshTokens.get(data.get('refresh_token'));
    if (!user) return json(route, { error: { message: 'INVALID_REFRESH_TOKEN' } }, 400);
    const session = backend.session(user.email);
    return json(route, { id_token: session.idToken, refresh_token: session.refreshToken, user_id: session.localId, expires_in: session.expiresIn });
  });
  await context.route(`${project}/**`, async route => {
    const request = route.request(), url = new URL(request.url());
    const user = backend.tokens.get(url.searchParams.get('auth'));
    if (!user || url.pathname !== `/compasso/${user.localId}.json`) return json(route, { error: 'Permission denied' }, 401);
    const account = backend.account(user.email);
    if (request.method() === 'GET') {
      if (backend.failReads) return route.abort();
      return json(route, account.data, 200, { ETag: `"${account.etag}"` });
    }
    if (backend.failWrites) return route.abort();
    if (backend.race) { backend.race(account); backend.race = null; }
    if (request.headers()['if-match'] !== `"${account.etag}"`) return json(route, account.data, 412, { ETag: `"${account.etag}"` });
    const body = request.postDataJSON();
    backend.writes.push(body);
    // RTDB removes nulls recursively, including payload.completedAt.
    account.data = JSON.parse(JSON.stringify(body, (key, value) => value === null ? undefined : value)); account.etag++;
    if (backend.loseAcknowledgement) { backend.loseAcknowledgement = false; return route.abort(); }
    return json(route, account.data);
  });
}
