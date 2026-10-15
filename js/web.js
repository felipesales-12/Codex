// The web layer only caches application files. Activities remain in IndexedDB.
const state = {
  online: navigator.onLine,
  offlineReady: false,
  installable: false,
  installed: matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
  development: document.querySelector('meta[name="compasso-release"]')?.content === 'development',
  supported: 'serviceWorker' in navigator && window.isSecureContext,
  updateAvailable: false,
};
let installPrompt, registration, onChange = () => {}, notify = () => {}, refreshing = false;

export const webState = () => ({ ...state });

function publish() {
  const status = document.getElementById('connection-status');
  status.classList.toggle('is-offline', !state.online);
  status.querySelector('span:last-child').textContent = state.online ? 'Dados neste navegador' : 'Sem conexão';
  status.title = state.offlineReady ? 'Aplicativo disponível offline neste navegador.' : 'Seus registros ficam salvos neste navegador.';
  document.getElementById('install-app').hidden = !state.installable || state.installed;
  document.getElementById('web-update').hidden = !state.updateAvailable;
  onChange();
}

export async function installApp() {
  if (!installPrompt) {
    notify('No menu do navegador, procure “Instalar aplicativo” ou “Adicionar à tela inicial”. A disponibilidade depende do navegador.');
    return;
  }
  const prompt = installPrompt;
  installPrompt = null;
  state.installable = false;
  await prompt.prompt();
  const choice = await prompt.userChoice;
  if (choice.outcome === 'accepted') notify('Instalação solicitada ao navegador.');
  publish();
}

export function initializeWeb(options) {
  onChange = options.onChange;
  notify = options.notify;
  for (const event of ['online', 'offline']) window.addEventListener(event, () => { state.online = navigator.onLine; publish(); });
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    state.installable = true;
    publish();
  });
  window.addEventListener('appinstalled', () => {
    state.installed = true;
    state.installable = false;
    installPrompt = null;
    publish();
    notify('Compasso instalado. Você pode abri-lo pelo atalho do aplicativo.');
  });
  document.getElementById('update-app').addEventListener('click', () => {
    if (document.querySelector('dialog[open]')) {
      notify('Finalize ou cancele a edição aberta antes de atualizar.');
      return;
    }
    if (registration?.waiting) {
      refreshing = true;
      registration.waiting.postMessage({ type: 'ACTIVATE_UPDATE' });
    }
  });
  publish();
  // During direct source development, never cache files and hide edits on reload.
  if (!state.supported || state.development) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (refreshing) location.reload(); });
  navigator.serviceWorker.register(new URL('../sw.js', import.meta.url), { updateViaCache: 'none' })
    .then(async result => {
      registration = result;
      const watchUpdate = () => {
        if (registration.waiting) { state.updateAvailable = true; publish(); }
      };
      watchUpdate();
      registration.addEventListener('updatefound', () => {
        registration.installing?.addEventListener('statechange', watchUpdate);
      });
      await navigator.serviceWorker.ready;
      state.offlineReady = true;
      document.documentElement.dataset.offlineReady = 'true';
      publish();
    })
    .catch(() => {
      notify('Não foi possível preparar o acesso offline. Você pode continuar usando o site conectado e tentar novamente ao reabrir.');
    });
}
