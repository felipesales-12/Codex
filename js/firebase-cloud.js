import { cloudConfig, validateCloudConfig } from './cloud-config.js';
import { validateBackup } from './backup.js';
import { uniqueId } from './tasks.js';

let config, configError = '';
try { config = validateCloudConfig(cloudConfig); }
catch (error) { config = { configured: false }; configError = error.message; }
let session = null, mode = 'local', status = configError ? 'error' : 'local', lastSync = null;
let version = 0, epoch = 0, refreshing = null;
const listeners = new Set(), pending = new Map();
const sessionKey = `compasso-firebase-session:${config.projectId}`;
const channel = globalThis.BroadcastChannel ? new BroadcastChannel(`compasso-firebase:${config.projectId}`) : null;
const emit = () => { for (const listener of listeners) listener(); };
const conflict = () => new Error('Outra alteração foi feita nesta conta. Sincronize a lista e revise os dados antes de salvar novamente.');
export function cloudState() {
  return { configured: config.configured, configError, mode, authenticated: Boolean(session), email: session?.email || '', status, lastSync, recovery: false };
}
export function subscribeCloud(listener) { listeners.add(listener); return () => listeners.delete(listener); }
function persist() {
  try { if (session) sessionStorage.setItem(sessionKey, JSON.stringify(session)); else sessionStorage.removeItem(sessionKey); } catch { /* In-memory session still works. */ }
}
function adopt(value) {
  if (!value.idToken || !value.refreshToken || !/^[A-Za-z0-9_-]{1,128}$/.test(value.localId || '')) throw new Error('O Firebase não retornou uma sessão válida.');
  if (session?.localId !== value.localId) { epoch++; pending.clear(); version = 0; }
  session = { idToken: value.idToken, refreshToken: value.refreshToken, localId: value.localId, email: value.email || '', expiresAt: value.expiresAt || Date.now() + Number(value.expiresIn || 3600) * 1000 };
  mode = 'cloud'; status = 'connecting'; persist(); emit();
}
function expire() { epoch++; session = null; pending.clear(); status = 'login-required'; persist(); emit(); }
async function http(url, options = {}) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { cache: 'no-store', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', ...options, signal: controller.signal });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const code = data?.error?.message || data?.error || '';
      const messages = {
        EMAIL_EXISTS: 'Este email já possui uma conta. Use Entrar ou recupere sua senha.',
        INVALID_LOGIN_CREDENTIALS: 'Email ou senha inválidos.', EMAIL_NOT_FOUND: 'Email ou senha inválidos.', INVALID_PASSWORD: 'Email ou senha inválidos.',
        OPERATION_NOT_ALLOWED: 'Ative E-mail/senha em Authentication → Sign-in method no Firebase.',
        USER_DISABLED: 'Esta conta foi desativada.', TOO_MANY_ATTEMPTS_TRY_LATER: 'Muitas tentativas. Aguarde antes de tentar novamente.',
        API_KEY_INVALID: 'Confira a chave pública do aplicativo no Firebase.',
      };
      const error = new Error(messages[code] || (response.status === 412 ? conflict().message : response.status === 401 || response.status === 403 ? 'Acesso negado pelo Firebase. Confira o login e publique as regras do banco indicadas em FIREBASE.md.' : 'Não foi possível acessar o Firebase. Confira a configuração do projeto e tente novamente.'));
      error.status = response.status; error.code = code; throw error;
    }
    return { data, etag: response.headers.get('etag') };
  } catch (error) {
    if (error.status) throw error;
    throw new Error('Sem conexão com a nuvem ou tempo de resposta excedido. A gravação não foi confirmada. Mantenha seus campos e tente novamente.');
  } finally { clearTimeout(timer); }
}
async function auth(action, body) {
  if (!config.configured) throw new Error(configError || 'Configure o Firebase antes de entrar.');
  return (await http(`https://identitytoolkit.googleapis.com/v1/accounts:${action}?key=${encodeURIComponent(config.apiKey)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).data;
}
async function refresh() {
  if (refreshing) return refreshing;
  if (!session) throw new Error('Entre novamente na sua conta.');
  const started = epoch, email = session.email;
  refreshing = http(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(config.apiKey)}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: session.refreshToken }).toString() })
    .then(({ data }) => { if (started !== epoch) throw new Error('A conta foi alterada. Reabra a lista.'); adopt({ idToken: data.id_token, refreshToken: data.refresh_token, localId: data.user_id, expiresIn: data.expires_in, email }); })
    .catch(error => { if (started === epoch && [400, 401, 403].includes(error.status)) expire(); throw error; })
    .finally(() => { refreshing = null; });
  return refreshing;
}
export async function initializeCloud() {
  if (!config.configured) return;
  try {
    const saved = JSON.parse(sessionStorage.getItem(sessionKey) || 'null');
    if (saved) adopt(saved);
  } catch { try { sessionStorage.removeItem(sessionKey); } catch { /* No stored session. */ } }
}
export async function signIn(email, password) { adopt(await auth('signInWithPassword', { email: email.trim(), password, returnSecureToken: true })); }
export async function signUp(email, password) {
  // Firebase email/password accounts are immediately usable; never promise a confirmation email.
  adopt(await auth('signUp', { email: email.trim(), password, returnSecureToken: true })); return true;
}
export async function sendRecovery(email) {
  // Firebase's hosted handler completes the reset; no privileged keys or custom redirect needed.
  await auth('sendOobCode', { requestType: 'PASSWORD_RESET', email: email.trim() });
}
export async function updatePassword(password) {
  if (!session) throw new Error('Entre novamente para alterar a senha.');
  if (session.expiresAt < Date.now() + 45000) await refresh();
  const value = await auth('update', { idToken: session.idToken, password, returnSecureToken: true });
  adopt({ ...value, localId: session.localId, email: session.email });
}
export async function signOut() {
  const userId = session?.localId;
  epoch++; session = null; mode = 'local'; status = 'local'; lastSync = null; version = 0; pending.clear(); persist(); emit();
  channel?.postMessage({ type: 'logout', userId });
}
channel?.addEventListener('message', event => { if (event.data?.type === 'logout' && event.data.userId === session?.localId) expire(); });
async function databaseRequest(method = 'GET', body, etag) {
  if (!session) throw new Error('Entre na sua conta para acessar os dados da nuvem.');
  const started = epoch;
  if (session.expiresAt < Date.now() + 45000) await refresh();
  const userId = session?.localId;
  async function send() {
    if (!session || epoch !== started) throw new Error('A conta foi alterada. Reabra a lista.');
    return http(`${config.databaseURL}/compasso/${encodeURIComponent(userId)}.json?auth=${encodeURIComponent(session.idToken)}`, {
      method, headers: { 'Content-Type': 'application/json', ...(method === 'GET' ? { 'X-Firebase-ETag': 'true' } : { 'if-match': etag }) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }
  let result;
  try { result = await send(); }
  catch (error) {
    // Only expired credentials justify a token refresh. Rules denials remain visible.
    if (error.status !== 401 || !/expired|invalid token/i.test(String(error.code))) throw error;
    await refresh(); result = await send();
  }
  if (epoch !== started) throw new Error('A conta foi alterada. Reabra a lista.');
  return result;
}
// Encode arbitrary backup IDs without introducing Firebase path separators or forbidden characters.
const rowKey = id => 't_' + btoa(String.fromCharCode(...new TextEncoder().encode(id))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function snapshot(value) {
  const data = value ?? { version: 0 };
  if (!Number.isSafeInteger(data.version) || data.version < 0 || data.tasks && (typeof data.tasks !== 'object' || Array.isArray(data.tasks))) throw new Error('A nuvem retornou dados inválidos. Nada foi substituído.');
  const entries = Object.entries(data.tasks || {});
  const { tasks } = validateBackup({ format: 'atividades-local', version: 1, tasks: entries.map(([, row]) => ({ ...row.payload, completedAt: row.payload?.completedAt ?? null })), settings: {} });
  tasks.forEach((task, i) => {
    const [key, row] = entries[i];
    if (key !== rowKey(task.id) || !Number.isSafeInteger(row.revision) || row.revision < 1 || row.revision > data.version) throw new Error('A nuvem retornou uma revisão inválida.');
    task._cloudRevision = row.revision;
  });
  return { data: { ...data, tasks: data.tasks || {}, operations: data.operations || {} }, tasks };
}
function synced(nextVersion) { version = nextVersion; status = 'synced'; lastSync = new Date().toISOString(); emit(); }
const sameTask = (a, b) => JSON.stringify(Object.keys(a).sort().map(key => [key, a[key]])) === JSON.stringify(Object.keys(b).sort().map(key => [key, b[key]]));
const clean = task => { const { _cloudRevision, ...payload } = task; return payload; };
async function apply(operation, options) {
  const args = { operation, ...options, ...(['replace', 'merge'].includes(operation) ? { expectedVersion: version } : {}) };
  const fingerprint = JSON.stringify(args, (key, value) => key === 'updatedAt' ? undefined : value);
  const request = pending.get(fingerprint) || { ...args, requestId: uniqueId() };
  pending.set(fingerprint, request);
  const started = epoch;
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (started !== epoch) throw new Error('A conta foi alterada. Reabra a lista.');
      const current = await databaseRequest();
      if (!current.etag) throw new Error('O Firebase não confirmou a versão dos dados. Nada foi enviado.');
      const { data } = snapshot(current.data);
      if (data.operations[request.requestId]) { pending.delete(fingerprint); synced(data.version); return { version: data.version }; }
      const next = data.version + 1;
      if (!Number.isSafeInteger(next)) throw new Error('O banco atingiu o limite de versões.');
      if (['replace', 'merge'].includes(operation) && data.version !== request.expectedVersion) throw conflict();
      const key = request.task ? rowKey(request.task.id) : request.id ? rowKey(request.id) : null;
      const previous = key ? data.tasks[key] : null;
      if (operation === 'add' && previous) throw new Error('Já existe uma atividade com este identificador. Sincronize antes de continuar.');
      if (['put', 'delete'].includes(operation) && (!previous || previous.revision !== request.revision)) throw conflict();
      if (operation === 'put' && previous.payload.createdAt !== request.task.createdAt) throw new Error('A data de criação não pode ser alterada.');
      if (operation === 'replace') data.tasks = {};
      if (['replace', 'merge'].includes(operation)) {
        for (const task of request.tasks) {
          const target = rowKey(task.id), existing = data.tasks[target];
          if (existing && !sameTask(clean({ ...existing.payload, completedAt: existing.payload.completedAt ?? null }), clean(task))) throw new Error('Há uma atividade com o mesmo identificador e conteúdo diferente. Nenhum registro foi enviado.');
          if (!existing) data.tasks[target] = { payload: clean(task), revision: next };
        }
      }
      if (['add', 'put'].includes(operation)) data.tasks[key] = { payload: clean(request.task), revision: next };
      if (operation === 'delete') delete data.tasks[key];
      validateBackup({ format: 'atividades-local', version: 1, tasks: Object.values(data.tasks).map(row => ({ ...row.payload, completedAt: row.payload.completedAt ?? null })), settings: {} });
      data.version = next; data.operations[request.requestId] = next;
      // ETag compare-and-swap makes the entire write atomic, including its retry receipt.
      try { await databaseRequest('PUT', data, current.etag); }
      catch (error) { if (error.status === 412 && attempt < 2) continue; throw error; }
      if (started !== epoch) throw new Error('A conta foi alterada. Reabra a lista.');
      pending.delete(fingerprint); synced(next); return { version: next };
    }
  } catch (error) {
    if (error.status && error.status < 500 || /Outra alteração|mesmo identificador/.test(error.message)) pending.delete(fingerprint);
    status = session ? 'error' : 'login-required'; emit(); throw error;
  }
}
export const cloudDatabase = {
  all: async () => {
    try { const { data } = await databaseRequest(); const result = snapshot(data); synced(result.data.version); return result.tasks; }
    catch (error) { status = session ? 'error' : 'login-required'; emit(); throw error; }
  },
  add: task => apply('add', { task: clean(task) }),
  put: task => apply('put', { task: clean(task), revision: task._cloudRevision }),
  remove: (id, revision) => apply('delete', { id, revision }),
  replace: tasks => apply('replace', { tasks: tasks.map(clean) }),
  merge: tasks => apply('merge', { tasks: tasks.map(clean) }),
};
