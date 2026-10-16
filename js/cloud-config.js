// Public client configuration. GitHub repository variables can override both fields.
// Never put a secret key or a service_role key in frontend files.
export const cloudConfig = Object.freeze({ url: 'https://pzvcsiowxewfzilczsgy.supabase.co', publishableKey: 'sb_publishable_BBkdgPvZIox-GA4FdHSSEw_1YJBHZ5m' });

export function validateCloudConfig(value) {
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
