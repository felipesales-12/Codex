// Public client configuration. GitHub repository variables can override both fields.
// Never put a secret key or a service_role key in frontend files.
export const cloudConfig = Object.freeze({ provider: 'firebase', apiKey: 'AIzaSyD4IbS9lI8QWmhIZsC3Ta9_MLzT2FbTrks', authDomain: 'teste-c321e.firebaseapp.com', databaseURL: 'https://teste-c321e-default-rtdb.firebaseio.com', projectId: 'teste-c321e', appId: '1:1028832148312:web:862fa31ee523445131832d' });

export function validateCloudConfig(value) {
  if (value?.provider === 'firebase') {
    const databaseURL = String(value.databaseURL || '').trim().replace(/\/+$/, '');
    if (!/^https:\/\/[a-z0-9-]+\.(?:firebaseio\.com|[a-z0-9-]+\.firebasedatabase\.app)$/.test(databaseURL)) throw new Error('Use a URL HTTPS do Firebase Realtime Database, sem caminhos adicionais.');
    if (!/^AIza[A-Za-z0-9_-]{30,}$/.test(value.apiKey || '') || !/^[a-z0-9-]+$/.test(value.projectId || '') || value.authDomain !== `${value.projectId}.firebaseapp.com`) throw new Error('Confira a configuração pública do aplicativo Web no Firebase.');
    return { ...value, databaseURL, configured: true };
  }
  const url = String(value?.url || '').trim().replace(/\/+$/, '');
  const publishableKey = String(value?.publishableKey || '').trim();
  if (!url && !publishableKey) return { url: '', publishableKey: '', configured: false };
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) throw new Error('Use a Project URL HTTPS do Supabase, sem caminhos adicionais.');
  if (!publishableKey) throw new Error('Configure a chave publicável do Supabase.');
  let publicKey = /^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey);
  if (!publicKey && publishableKey.split('.').length === 3) {
    try {
      const payload = JSON.parse(atob(publishableKey.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      publicKey = payload.role === 'anon';
    } catch { /* Reject keys whose public role cannot be verified. */ }
  }
  if (!publicKey) throw new Error('Use somente a chave publicável (sb_publishable_) ou a chave anon. Chaves secretas e service_role não podem ir para o site.');
  return { url, publishableKey, configured: true };
}
