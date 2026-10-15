import { priorities, statuses, localDate } from './tasks.js';

export function validateBackup(data) {
  if (!data || data.format !== 'atividades-local' || data.version !== 1 || !Array.isArray(data.tasks)) throw new Error('Backup inválido. Selecione um JSON exportado por este sistema (versão 1).');
  if (data.tasks.length > 50000) throw new Error('O backup excede o limite de 50.000 atividades.');
  const ids = new Set();
  const isoDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value.slice(0, 10);
  const validDay = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  const tasks = data.tasks.map((task, index) => {
    const fail = () => { throw new Error(`A atividade ${index + 1} contém campos, datas ou identificador inválidos. Nada foi importado.`); };
    if (!task || typeof task !== 'object') fail();
    if (typeof task.id !== 'string' || !task.id.trim() || task.id.length > 100 || ids.has(task.id)) fail();
    ids.add(task.id);
    for (const field of ['title', 'requester', 'location']) if (typeof task[field] !== 'string' || !task[field].trim() || task[field].length > (field === 'title' ? 160 : 140)) fail();
    for (const field of ['description', 'notes']) if (typeof task[field] !== 'string' || task[field].length > 20000) fail();
    if (typeof task.priority !== 'string' || typeof task.status !== 'string' || !Object.hasOwn(priorities, task.priority) || !Object.hasOwn(statuses, task.status)) fail();
    if (!isoDate(task.createdAt) || !isoDate(task.updatedAt) || Date.parse(task.updatedAt) < Date.parse(task.createdAt)) fail();
    if (task.dueDate !== '' && !validDay(task.dueDate)) fail();
    if (task.status === 'completed' ? !isoDate(task.completedAt) || Date.parse(task.completedAt) < Date.parse(task.createdAt) : task.completedAt !== null) fail();
    return Object.fromEntries(['id', 'title', 'requester', 'priority', 'description', 'location', 'notes', 'status', 'dueDate', 'createdAt', 'updatedAt', 'completedAt'].map(key => [key, task[key]]));
  });
  const settings = {};
  if (data.settings?.theme && ['light', 'dark', 'system'].includes(data.settings.theme)) settings.theme = data.settings.theme;
  if (isoDate(data.settings?.lastBackupAt)) settings.lastBackupAt = data.settings.lastBackupAt;
  return { tasks, settings };
}

export function backupJSON(tasks, settings) {
  return JSON.stringify({ format: 'atividades-local', version: 1, exportedAt: new Date().toISOString(), tasks, settings }, null, 2);
}

export function tasksCSV(tasks) {
  const headers = ['Identificador', 'Atividade', 'Solicitante', 'Urgência', 'Descrição', 'Local', 'Status', 'Cadastro (ISO)', 'Prazo', 'Conclusão (ISO)', 'Tempo decorrido (minutos)', 'Observações', 'Última alteração (ISO)'];
  // Prevent spreadsheet formulas, while retaining line breaks and delimiters safely.
  const cell = value => {
    let text = String(value ?? '');
    if (/^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const rows = tasks.map(t => [t.id, t.title, t.requester, priorities[t.priority].label, t.description, t.location, statuses[t.status], t.createdAt, t.dueDate, t.completedAt, t.completedAt ? Math.max(0, Math.floor((Date.parse(t.completedAt) - Date.parse(t.createdAt)) / 60000)) : '', t.notes, t.updatedAt]);
  return '\uFEFF' + [headers, ...rows].map(row => row.map(cell).join(';')).join('\r\n');
}

export function download(content, prefix, extension, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${prefix}-${localDate()}.${extension}`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
