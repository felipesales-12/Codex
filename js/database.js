const DB_NAME = 'atividades-local';
const DB_VERSION = 1;
let connection;

export function openDatabase() {
  if (connection) return Promise.resolve(connection);
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error('Este navegador não oferece IndexedDB. Use uma versão atual do Edge, Chrome ou Firefox.'));
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('tasks')) {
        const store = db.createObjectStore('tasks', { keyPath: 'id' });
        store.createIndex('status', 'status');
        store.createIndex('createdAt', 'createdAt');
      }
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings');
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Feche outras abas deste sistema e tente novamente para atualizar o banco local.'));
    request.onsuccess = () => {
      connection = request.result;
      connection.onversionchange = () => { connection.close(); connection = null; };
      resolve(connection);
    };
  });
}

// Resolve only after the transaction commits, not merely after a request succeeds.
async function transaction(stores, mode, operation) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    let result;
    const tx = db.transaction(stores, mode);
    tx.oncomplete = () => resolve(typeof result === 'function' ? result() : result);
    tx.onerror = () => reject(tx.error || new Error('Falha ao acessar os dados locais.'));
    tx.onabort = () => reject(tx.error || new Error('A gravação foi cancelada. Nenhum dado foi alterado.'));
    try { result = operation(tx); } catch (error) { tx.abort(); reject(error); }
  });
}

export const localDatabase = {
  all: () => transaction(['tasks'], 'readonly', tx => {
    const request = tx.objectStore('tasks').getAll();
    return () => request.result;
  }),
  add: task => transaction(['tasks'], 'readwrite', tx => tx.objectStore('tasks').add(task)),
  put: task => transaction(['tasks'], 'readwrite', tx => tx.objectStore('tasks').put(task)),
  remove: id => transaction(['tasks'], 'readwrite', tx => tx.objectStore('tasks').delete(id)),
  settings: () => transaction(['settings'], 'readonly', tx => {
    const store = tx.objectStore('settings');
    const keys = store.getAllKeys();
    const values = store.getAll();
    return () => Object.fromEntries(keys.result.map((key, index) => [key, values.result[index]]));
  }),
  setSetting: (key, value) => transaction(['settings'], 'readwrite', tx => tx.objectStore('settings').put(value, key)),
  replace: (tasks, settings) => transaction(['tasks', 'settings'], 'readwrite', tx => {
    const store = tx.objectStore('tasks');
    store.clear();
    for (const task of tasks) store.add(task);
    const preferences = tx.objectStore('settings');
    preferences.clear();
    for (const [key, value] of Object.entries(settings)) preferences.put(value, key);
  }),
};

let cloudAdapter = null;
export function useCloudDatabase(adapter) { cloudAdapter = adapter; }

// Preferences stay on this device; task operations use exactly one destination.
export const database = {
  all: (...args) => (cloudAdapter || localDatabase).all(...args),
  add: (...args) => (cloudAdapter || localDatabase).add(...args),
  put: (...args) => (cloudAdapter || localDatabase).put(...args),
  remove: (...args) => (cloudAdapter || localDatabase).remove(...args),
  replace: (tasks, settings) => cloudAdapter ? cloudAdapter.replace(tasks) : localDatabase.replace(tasks, settings),
  settings: () => localDatabase.settings(),
  setSetting: (key, value) => localDatabase.setSetting(key, value),
};
