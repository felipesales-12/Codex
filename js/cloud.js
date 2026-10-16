import { cloudConfig, validateCloudConfig } from './cloud-config.js';
import { validateBackup } from './backup.js';
import { uniqueId } from './tasks.js';

let config, configError = '';
try { config = validateCloudConfig(cloudConfig); }
catch (error) { config = { configured: false }; configError = error.message; }
let session = null, mode = 'local', version = 0, epoch = 0, refreshing = null;
let status = configError ? 'error' : 'local', lastSync = null, recovery = false;
const listeners = new Set(), pending = new Map();
const sessionKey = `compasso-session:${config.url || 'unconfigured'}`;
const authChannel = globalThis.BroadcastChannel ? new BroadcastChannel('compasso-auth') : null;
const emit = () => { for (const listener of listeners) listener(); };

export function cloudState() {
  return { configured: config.configured, configError, mode, authenticated: Boolean(session), email: session?.user?.email || '', status, lastSync, recovery };
}
export function subscribeCloud(listener) { listeners.add(listener); return () => listeners.delete(listener); }
function persistSession() {
  try { if (session) sessionStorage.setItem(sessionKey, JSON.stringify({ ...session, recovery })); else sessionStorage.removeItem(sessionKey); }
  catch { /* The current in-memory session is usable even if sessionStorage is unavailable. */ }
}
function adoptSession(value, isRecovery = false) {
  if (!value?.access_token || !value?.refresh_token || !/^[0-9a-f-]{36}$/i.test(value.user?.id || '')) throw new Error('O serviço não retornou uma sessão de acesso válida.');
  if (session?.user?.id !== value.user.id) { epoch++; pending.clear(); version = 0; }
  session = { access_token: value.access_token, refresh_token: value.refresh_token, user: { id: value.user.id, email: value.user.email || '' }, expires_at: value.expires_at || Math.floor(Date.now() / 1000) + (value.expires_in || 3600) };
  mode = 'cloud'; status = 'connecting'; recovery = isRecovery;
  persistSession(); emit();
}
function expireSession() {
  session = null; status = 'login-required'; persistSession(); emit();
}

async function request(path, { method = 'GET', body, token } = {}) {
  if (!config.configured) throw new Error('A conexão com o Supabase ainda não foi configurada.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${config.url}${path}`, {
      method, signal: controller.signal, cache: 'no-store', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer',
      headers: { apikey: config.publishableKey, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const code = data?.code || data?.error_code;
      let message = 'Não foi possível acessar a nuvem. Tente novamente.';
      if (response.status === 401 || code === 'invalid_credentials') message = 'Email, senha ou sessão inválidos. Entre novamente.';
      else if (code === '40001') message = 'Outra alteração foi feita nesta conta. Sincronize a lista e revise os dados antes de salvar novamente.';
      else if (code === '23505') message = 'Já existe uma atividade com este identificador. Sincronize a lista antes de continuar.';
      else if (response.status === 404 || ['PGRST202', '42P01'].includes(code)) message = 'O banco da nuvem ainda não foi preparado. O administrador precisa executar o script SQL do projeto.';
      else if (code === 'email_not_confirmed') message = 'Confirme seu email antes de entrar.';
      else if (response.status === 429) message = 'Muitas tentativas. Aguarde um pouco antes de tentar novamente.';
      else if (response.status === 403) message = 'Sua conta não tem permissão para esta operação.';
      else if (data?.msg && path.startsWith('/auth/')) message = data.msg;
      else if (data?.message && code === '22023') message = data.message;
      const error = new Error(message); error.status = response.status; error.code = code; throw error;
    }
    return data;
  } catch (error) {
    if (error.status) throw error;
    throw new Error('Sem conexão com a nuvem ou tempo de resposta excedido. A gravação não foi confirmada. Mantenha seus campos e tente novamente.');
  } finally { clearTimeout(timeout); }
}

async function refreshSession() {
  if (refreshing) return refreshing;
  if (!session) throw new Error('Entre na sua conta para acessar os dados da nuvem.');
  const previousEpoch = epoch;
  const previousRecovery = recovery;
  refreshing = request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: session.refresh_token } })
    .then(value => { if (epoch !== previousEpoch) throw new Error('A conta foi alterada. Reabra a lista.'); adoptSession(value, previousRecovery); })
    .catch(error => { if (error.status === 400 || error.status === 401) expireSession(); throw error; })
    .finally(() => { refreshing = null; });
  return refreshing;
}

async function rpc(name, body) {
  const started = epoch;
  if (!session) throw new Error('Entre na sua conta para acessar os dados da nuvem.');
  if (session.expires_at < Date.now() / 1000 + 45) await refreshSession();
  let result;
  try { result = await request(`/rest/v1/rpc/${name}`, { method: 'POST', body, token: session.access_token }); }
  catch (error) {
    if (error.status !== 401) { status = 'error'; emit(); throw error; }
    await refreshSession();
    result = await request(`/rest/v1/rpc/${name}`, { method: 'POST', body, token: session.access_token });
  }
  if (started !== epoch) throw new Error('A conta foi alterada. Reabra a lista.');
  return result;
}

export async function initializeCloud() {
  if (!config.configured) return;
  const parameters = new URLSearchParams(location.hash.slice(1));
  if (parameters.has('access_token') || parameters.has('error_description')) {
    history.replaceState(null, '', `${location.pathname}${location.search}#conta`);
    if (parameters.has('error_description')) throw new Error('O link de confirmação expirou ou não é válido. Solicite um novo email.');
    const token = parameters.get('access_token');
    const user = await request('/auth/v1/user', { token });
    adoptSession({ access_token: token, refresh_token: parameters.get('refresh_token'), expires_in: Number(parameters.get('expires_in')) || 3600, user }, parameters.get('type') === 'recovery');
    return;
  }
  try {
    const stored = JSON.parse(sessionStorage.getItem(sessionKey) || 'null');
    if (stored) adoptSession(stored, Boolean(stored.recovery));
  } catch { try { sessionStorage.removeItem(sessionKey); } catch { /* No persistent session available. */ } }
}

export async function signIn(email, password) {
  const value = await request('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: email.trim(), password } });
  adoptSession(value);
}
export async function signUp(email, password) {
  const redirect = `${location.origin}${location.pathname}`;
  const value = await request(`/auth/v1/signup?redirect_to=${encodeURIComponent(redirect)}`, { method: 'POST', body: { email: email.trim(), password } });
  if (value?.access_token) adoptSession(value);
  return Boolean(value?.access_token);
}
export async function sendRecovery(email) {
  await request(`/auth/v1/recover?redirect_to=${encodeURIComponent(location.origin + location.pathname)}`, { method: 'POST', body: { email: email.trim() } });
}
export async function updatePassword(password) {
  if (!session) throw new Error('Abra o link de recuperação recebido por email.');
  await request('/auth/v1/user', { method: 'PUT', body: { password }, token: session.access_token });
  recovery = false; persistSession(); emit();
}
export async function signOut() {
  const token = session?.access_token, userId = session?.user?.id;
  epoch++; session = null; mode = 'local'; status = 'local'; lastSync = null; recovery = false; pending.clear(); persistSession(); emit();
  authChannel?.postMessage({ type: 'logout', userId });
  if (token) void request('/auth/v1/logout?scope=local', { method: 'POST', token }).catch(() => {});
}
authChannel?.addEventListener('message', event => {
  if (event.data?.type === 'logout' && event.data.userId === session?.user?.id) {
    epoch++; session = null; status = 'login-required'; persistSession(); emit();
  }
});

function cleanTask(task) { const { _cloudRevision, ...record } = task; return record; }
async function apply(operation, { task = null, id = null, revision = null, tasks = null } = {}) {
  const args = { p_operation: operation, p_task: task && cleanTask(task), p_task_id: id, p_expected_revision: revision, p_tasks: tasks?.map(cleanTask) || null, p_expected_version: ['replace', 'merge'].includes(operation) ? version : null };
  // Keep an operation id/body across retries, including a lost acknowledgement.
  const fingerprint = JSON.stringify(args, (key, value) => key === 'updatedAt' ? undefined : value);
  const body = pending.get(fingerprint) || { ...args, p_request_id: uniqueId() };
  pending.set(fingerprint, body);
  try {
    const result = await rpc('compasso_apply', body);
    pending.delete(fingerprint);
    version = result.version;
    lastSync = new Date().toISOString(); status = 'synced'; emit();
    return result;
  } catch (error) {
    // A conflict must be reviewed, rather than retried with a new revision silently.
    if (error.status && error.status < 500) pending.delete(fingerprint);
    status = session ? 'error' : 'login-required'; emit(); throw error;
  }
}

export const cloudDatabase = {
  all: async () => {
    try {
      const result = await rpc('compasso_snapshot', {});
      if (!Number.isSafeInteger(result?.version) || result.version < 0 || !Array.isArray(result.tasks)) throw new Error('A nuvem retornou um conjunto de dados inválido. Nada foi substituído.');
      const { tasks } = validateBackup({ format: 'atividades-local', version: 1, tasks: result.tasks.map(row => row.payload), settings: {} });
      tasks.forEach((task, index) => {
        const revision = result.tasks[index].revision;
        if (!Number.isSafeInteger(revision) || revision < 1) throw new Error('A nuvem retornou uma revisão inválida.');
        task._cloudRevision = revision;
      });
      version = result.version; status = 'synced'; lastSync = new Date().toISOString(); emit();
      return tasks;
    } catch (error) {
      status = session ? 'error' : 'login-required'; emit(); throw error;
    }
  },
  add: task => apply('add', { task }),
  put: task => apply('put', { task, revision: task._cloudRevision }),
  remove: (id, revision) => apply('delete', { id, revision }),
  replace: tasks => apply('replace', { tasks }),
  merge: tasks => apply('merge', { tasks }),
};
