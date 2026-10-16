export const priorities = {
  critical: { label: 'Crítica', weight: 4, color: 'red' },
  high: { label: 'Alta', weight: 3, color: 'orange' },
  medium: { label: 'Média', weight: 2, color: 'yellow' },
  low: { label: 'Baixa', weight: 1, color: 'green' },
};
export const statuses = { pending: 'Pendente', progress: 'Em andamento', completed: 'Concluída' };
export const normalize = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
export const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const isOverdue = task => task.status !== 'completed' && Boolean(task.dueDate) && task.dueDate < localDate();
export const dateLabel = value => value ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value.length === 10 ? `${value}T12:00:00` : value)) : 'Sem prazo';
export const dateTimeLabel = value => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—';
export function duration(task) {
  if (!task.completedAt) return '—';
  const minutes = Math.max(0, Math.floor((new Date(task.completedAt) - new Date(task.createdAt)) / 60000));
  if (minutes < 1) return 'Menos de 1 minuto';
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  return [days && `${days}d`, hours && `${hours}h`, `${minutes % 60}min`].filter(Boolean).join(' ');
}

export function createTask(values, original = null) {
  const now = new Date().toISOString();
  const task = {
    id: original?.id || uniqueId(),
    title: values.title.trim(), requester: values.requester.trim(),
    priority: values.priority, description: values.description.trim(),
    location: values.location.trim(), notes: values.notes.trim(),
    status: values.status, dueDate: values.dueDate || '',
    createdAt: original?.createdAt || now, updatedAt: now,
    completedAt: values.status === 'completed' ? (original?.completedAt || now) : null,
    ...(original?._cloudRevision ? { _cloudRevision: original._cloudRevision } : {}),
  };
  return task;
}

// randomUUID is restricted to HTTPS/localhost; getRandomValues also works on LAN HTTP.
export function uniqueId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function selectTasks(tasks, filters = {}, history = false) {
  const query = normalize(filters.search || '').trim();
  const result = tasks.filter(task => {
    if (history ? task.status !== 'completed' : task.status === 'completed') return false;
    const date = history ? localDate(new Date(task.completedAt)) : localDate(new Date(task.createdAt));
    return (!query || normalize([task.title, task.requester, task.description, task.location, task.notes].join(' ')).includes(query))
      && (!filters.priority || task.priority === filters.priority)
      && (!filters.status || task.status === filters.status)
      && (!filters.requester || normalize(task.requester) === normalize(filters.requester))
      && (!filters.from || date >= filters.from)
      && (!filters.to || date <= filters.to);
  });
  const sort = filters.sort || (history ? 'completed' : 'priority');
  return result.sort((a, b) => {
    if (sort === 'recent') return b.createdAt.localeCompare(a.createdAt);
    if (sort === 'oldest') return a.createdAt.localeCompare(b.createdAt);
    if (sort === 'due') return (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || a.createdAt.localeCompare(b.createdAt);
    if (sort === 'completed') return (b.completedAt || '').localeCompare(a.completedAt || '');
    return Number(isOverdue(b)) - Number(isOverdue(a)) || priorities[b.priority].weight - priorities[a.priority].weight || (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || b.createdAt.localeCompare(a.createdAt);
  });
}

export function getMetrics(tasks) {
  const active = tasks.filter(t => t.status !== 'completed');
  const completed = tasks.filter(t => t.status === 'completed');
  return {
    active: active.length, pending: active.filter(t => t.status === 'pending').length,
    progress: active.filter(t => t.status === 'progress').length,
    critical: active.filter(t => t.priority === 'critical').length,
    today: completed.filter(t => localDate(new Date(t.completedAt)) === localDate()).length,
    completed: completed.length, overdue: active.filter(isOverdue).length,
  };
}
