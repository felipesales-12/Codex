import { database, openDatabase } from './database.js';
import { priorities, statuses, createTask, selectTasks, getMetrics, dateLabel, dateTimeLabel, duration, isOverdue, localDate } from './tasks.js';
import { backupJSON, tasksCSV, validateBackup, download } from './backup.js';
import { icon } from './icons.js';
import { initializeWeb, webState, installApp } from './web.js';

const $ = selector => document.querySelector(selector);
const html = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const labels = { dashboard: 'Dashboard', atividades: 'Todas as atividades', pendentes: 'Atividades pendentes', andamento: 'Atividades em andamento', historico: 'Histórico de concluídas', backup: 'Backup e restauração', configuracoes: 'Configurações' };
let tasks = [], settings = {}, ready = false, busy = false, editingId = null, limit = 50;
let filters = {};
let preserveNavigationFilters = false;
let page = getPage();
let storagePersisted = false;
let lastSaved = null;
const channel = globalThis.BroadcastChannel ? new BroadcastChannel('compasso-updates') : null;

document.querySelectorAll('[data-icon]').forEach(element => { element.innerHTML = icon(element.dataset.icon); });

function getPage() { const name = location.hash.slice(1); return Object.hasOwn(labels, name) ? name : 'dashboard'; }
function applyTheme() {
  const theme = settings.theme || 'system';
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('#theme-toggle').innerHTML = icon(dark ? 'sun' : 'moon');
  $('#theme-toggle').setAttribute('aria-label', dark ? 'Ativar tema claro' : 'Ativar tema escuro');
}
function notify(message, error = false) {
  const element = document.createElement('div');
  element.className = `toast ${error ? 'error' : ''}`;
  element.setAttribute('role', error ? 'alert' : 'status');
  element.innerHTML = `${icon(error ? 'alert' : 'circleCheck')}<span>${html(message)}</span><button class="icon-button" aria-label="Fechar aviso">${icon('close')}</button>`;
  element.querySelector('button').onclick = () => element.remove();
  $('#notifications').append(element);
  if (!error) setTimeout(() => element.remove(), 5500);
}
const priorityBadge = task => `<span class="badge priority ${priorities[task.priority].color}"><span class="priority-dot"></span>${priorities[task.priority].label}</span>`;
const statusBadge = task => `<span class="badge status ${task.status}">${icon(task.status === 'completed' ? 'circleCheck' : task.status === 'progress' ? 'clock' : 'list')}${statuses[task.status]}</span>`;
const button = (action, title, symbol, id, extra = '') => `<button type="button" class="icon-button ${extra}" data-action="${action}" data-id="${html(id)}" title="${title}" aria-label="${title}">${icon(symbol)}</button>`;

function render() {
  if (!ready) return;
  const focused = document.activeElement;
  const focusId = focused?.id;
  const selection = focused?.tagName === 'INPUT' && focused.type === 'search' ? [focused.selectionStart, focused.selectionEnd] : null;
  const metrics = getMetrics(tasks);
  $('#pending-count').textContent = metrics.pending;
  $('#progress-count').textContent = metrics.progress;
  $('#breadcrumb-page').textContent = labels[page];
  document.title = `${labels[page]} · Compasso`;
  document.querySelectorAll('[data-page]').forEach(link => {
    const active = link.dataset.page === page;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  });
  $('#save-status').textContent = lastSaved ? `Salvo neste navegador às ${new Date(lastSaved).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'Dados armazenados neste navegador';
  $('#main').innerHTML = page === 'dashboard' ? dashboard(metrics) : page === 'backup' ? backupPage() : page === 'configuracoes' ? settingsPage() : listPage();
  if (focusId) {
    const replacement = document.getElementById(focusId);
    if (replacement && replacement !== focused) { replacement.focus(); if (selection) replacement.setSelectionRange(...selection); }
  }
}

function heading(eyebrow, title, subtitle, action = true) {
  return `<div class="page-heading"><div><span class="eyebrow">${eyebrow}</span><h1>${title}</h1><p>${subtitle}</p></div>${action ? `<button class="button primary" data-action="new">${icon('plus')}Nova atividade</button>` : ''}</div>`;
}
function empty(filtered = false, history = false) {
  return `<div class="empty-state"><div class="empty-art">${icon(filtered ? 'search' : history ? 'circleCheck' : 'list')}</div><h3>${filtered ? 'Nenhuma atividade encontrada' : history ? 'Cada conclusão terá seu lugar aqui' : 'Tudo começa com o primeiro passo'}</h3><p>${filtered ? 'Ajuste a pesquisa ou os filtros para encontrar o que procura.' : history ? 'Ao concluir uma atividade, ela será guardada neste histórico.' : 'Cadastre uma atividade e organize seu trabalho com mais clareza.'}</p><button class="button ${filtered ? 'secondary' : 'primary'}" data-action="${filtered ? 'clear-filters' : 'new'}">${icon(filtered ? 'close' : 'plus')}${filtered ? 'Limpar filtros' : 'Criar atividade'}</button></div>`;
}
function taskTable(rows, history = false, filtered = false) {
  if (!rows.length) return empty(filtered, history);
  return `<div class="table-scroll"><table><thead><tr><th>ATIVIDADE / SOLICITANTE</th><th>URGÊNCIA</th><th>LOCAL</th><th>${history ? 'CONCLUSÃO' : 'CADASTRO / PRAZO'}</th><th>STATUS</th><th class="actions-heading">AÇÕES</th></tr></thead><tbody>${rows.map(task => `<tr class="${isOverdue(task) ? 'overdue-row' : ''}"><td><button class="task-title" data-action="details" data-id="${html(task.id)}">${html(task.title)}</button><span class="secondary-text">${html(task.requester)}</span></td><td>${priorityBadge(task)}</td><td><span class="location-cell">${html(task.location)}</span></td><td><span class="date-cell">${history ? dateTimeLabel(task.completedAt) : dateLabel(task.createdAt)}</span><span class="secondary-text ${isOverdue(task) ? 'text-danger' : ''}">${history ? duration(task) : `${isOverdue(task) ? 'Atrasada · ' : ''}${task.dueDate ? 'Prazo ' + dateLabel(task.dueDate) : 'Sem prazo definido'}`}</span></td><td>${statusBadge(task)}</td><td><div class="row-actions">${task.status === 'pending' ? button('start', 'Iniciar atividade', 'play', task.id) : ''}${history ? button('restore', 'Restaurar atividade', 'history', task.id) : button('complete', 'Concluir atividade', 'check', task.id, 'complete-action')}${button('edit', 'Editar atividade', 'edit', task.id)}${button('duplicate', 'Duplicar atividade', 'copy', task.id)}${button('delete', 'Excluir atividade', 'trash', task.id, 'delete-action')}</div></td></tr>`).join('')}</tbody></table></div>`;
}

function dashboard(metrics) {
  const active = selectTasks(tasks);
  const recent = [...tasks].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 3);
  const date = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  const cards = [
    ['active', 'Atividades ativas', 'list', 'blue', 'Entre pendentes e em andamento', 'atividades'],
    ['pending', 'Pendentes', 'flag', 'amber', 'Prontas para o próximo passo', 'pendentes'],
    ['progress', 'Em andamento', 'clock', 'purple', 'Seu trabalho em movimento', 'andamento'],
    ['critical', 'Prioridade crítica', 'alert', 'red', 'Precisam da sua atenção', 'critical'],
    ['today', 'Concluídas hoje', 'circleCheck', 'green', 'Cada entrega faz a diferença', 'today'],
    ['completed', 'Total no histórico', 'history', 'slate', 'Todo o seu trabalho registrado', 'historico'],
  ];
  return `${heading('VISÃO GERAL · ' + html(date.toLocaleUpperCase('pt-BR')), 'Seu dia, sob controle<span class="heading-dot">.</span>', 'Organize as prioridades. Acompanhe cada passo. Faça acontecer.')}
    <section class="metrics-grid" aria-label="Indicadores">${cards.map(([key, label, symbol, color, hint, target]) => `<button class="metric-card" data-action="metric" data-target="${target}"><div class="metric-top"><span>${label}</span><span class="metric-icon ${color}">${icon(symbol)}</span></div><strong data-metric="${key}">${metrics[key]}</strong><span class="metric-caption">${hint}${icon('arrow')}</span></button>`).join('')}</section>
    ${metrics.overdue ? `<div class="overdue-alert">${icon('alert')}<div><strong>${metrics.overdue} atividade${metrics.overdue > 1 ? 's' : ''} com prazo vencido</strong><span>Revise as prioridades e mantenha suas entregas em dia.</span></div><a href="#atividades">Ver atividades ${icon('arrow')}</a></div>` : ''}
    <div class="dashboard-columns"><section class="panel main-panel"><div class="panel-heading"><div><h2>Na sua lista <span class="count-bubble">${metrics.active}</span></h2><p>Atividades ativas, organizadas por prioridade e atraso.</p></div><a class="text-link" href="#atividades">Ver todas ${icon('arrow')}</a></div>${taskTable(active.slice(0, 6))}${active.length ? `<div class="panel-footer">${icon('info')} Conclua uma atividade para movê-la ao histórico.</div>` : ''}</section>
    <section class="panel priority-panel"><div class="panel-heading"><div><h2>Foco nas prioridades</h2><p>Uma visão do que precisa de você.</p></div></div><div class="priority-bars">${Object.entries(priorities).map(([key, value]) => { const count = active.filter(t => t.priority === key).length; return `<button class="priority-summary" data-action="priority-filter" data-priority="${key}"><span><i class="priority-dot ${value.color}"></i>${value.label}<strong>${count}</strong></span><span class="bar-track"><span class="bar-fill ${value.color}" style="width:${metrics.active ? (count / metrics.active) * 100 : 0}%"></span></span></button>`; }).join('')}</div><div class="focus-note">${icon('flag')}<p>Um passo de cada vez.<br><strong>Comece pelo que mais importa.</strong></p></div></section></div>
    <section class="panel recent-panel"><div class="panel-heading"><div><h2>Adicionadas recentemente</h2><p>As últimas atividades do seu espaço.</p></div><span class="soft-icon">${icon('clock')}</span></div>${recent.length ? `<div class="recent-grid">${recent.map(t => `<button class="recent-item" data-action="details" data-id="${html(t.id)}"><span class="recent-icon">${icon('file')}</span><span><strong>${html(t.title)}</strong><small>${html(t.requester)} · ${dateLabel(t.createdAt)}</small></span>${icon('chevron')}</button>`).join('')}</div>` : '<div class="recent-empty">As novas atividades aparecerão aqui assim que forem cadastradas.</div>'}</section>`;
}

function filterBar(history) {
  const requesters = [...new Set(tasks.filter(t => history ? t.status === 'completed' : t.status !== 'completed').map(t => t.requester))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const options = (entries, value) => entries.map(([key, label]) => `<option value="${html(key)}" ${value === key ? 'selected' : ''}>${html(label)}</option>`).join('');
  return `<div class="filters"><div class="filter-top"><label class="search-field" for="search">${icon('search')}<input type="search" id="search" data-filter="search" value="${html(filters.search || '')}" placeholder="Pesquisar nome, solicitante, descrição ou local…" aria-label="Pesquisar atividades"></label><label class="sort-field">Ordenar por<select id="sort" data-filter="sort">${options([...(history ? [['completed', 'Conclusão mais recente']] : []), ['priority', 'Prioridade e atraso'], ['recent', 'Mais recentes'], ['oldest', 'Mais antigas'], ['due', 'Prazo mais próximo']], filters.sort || (history ? 'completed' : 'priority'))}</select></label></div><div class="filter-grid"><label>Urgência<select id="filter-priority" data-filter="priority"><option value="">Todas as urgências</option>${options(Object.entries(priorities).map(([k, v]) => [k, v.label]), filters.priority)}</select></label>${!history ? `<label>Status<select id="filter-status" data-filter="status"><option value="">${page === 'pendentes' ? 'Pendente' : page === 'andamento' ? 'Em andamento' : 'Todos os ativos'}</option>${page === 'atividades' ? options([['pending', 'Pendente'], ['progress', 'Em andamento']], filters.status) : ''}</select></label>` : ''}<label>Solicitante<select id="filter-requester" data-filter="requester"><option value="">Todos os solicitantes</option>${options(requesters.map(name => [name, name]), filters.requester)}</select></label><label>${history ? 'Conclusão de' : 'Cadastro de'}<input type="date" id="filter-from" data-filter="from" value="${html(filters.from || '')}"></label><label>Até<input type="date" id="filter-to" data-filter="to" value="${html(filters.to || '')}"></label><button class="button subtle clear-filters" data-action="clear-filters">${icon('close')}Limpar</button></div>${filters.from && filters.to && filters.from > filters.to ? '<p class="inline-error" role="alert">A data inicial deve ser anterior ou igual à data final.</p>' : ''}</div>`;
}

function listPage() {
  const history = page === 'historico';
  const effectiveFilters = { ...filters, ...(page === 'pendentes' ? { status: 'pending' } : page === 'andamento' ? { status: 'progress' } : {}) };
  const rows = selectTasks(tasks, effectiveFilters, history);
  const hasFilters = Object.entries(filters).some(([key, value]) => key !== 'sort' && value);
  const subtitles = { historico: 'Cada entrega conta. Consulte, exporte ou restaure suas atividades concluídas.', pendentes: 'Tudo o que está aguardando o próximo passo.', andamento: 'Acompanhe as atividades que já estão em execução.', atividades: 'Encontre, organize e acompanhe todas as suas atividades ativas.' };
  return `${heading(history ? 'SEU TRABALHO REGISTRADO' : 'GESTÃO DO DIA A DIA', labels[page], subtitles[page])}<section class="panel">${filterBar(history)}<div class="results-heading"><span><strong>${rows.length}</strong> atividade${rows.length === 1 ? '' : 's'} ${history ? 'concluída' : 'encontrada'}${rows.length === 1 ? '' : 's'}</span><button class="button subtle" data-action="${history ? 'export-history' : 'export-active'}">${icon('download')}Exportar ${history ? 'histórico' : 'ativas'} CSV</button></div>${taskTable(rows.slice(0, limit), history, hasFilters)}${rows.length > limit ? `<div class="load-more"><button class="button secondary" data-action="load-more">Mostrar mais atividades (${Math.min(limit, rows.length)} de ${rows.length})</button></div>` : ''}</section>${history ? '<p class="section-note">O histórico não expira. Atividades só são removidas quando você confirma uma exclusão ou substitui os dados por um backup.</p>' : '<p class="section-note">A data dos filtros considera o cadastro. As exportações incluem todas as atividades ativas, independentemente dos filtros.</p>'}`;
}

function backupPage() {
  return `${heading('CUIDADO COM SEUS DADOS', 'Uma cópia. Mais tranquilidade.', 'Proteja seu trabalho com backups que ficam sob o seu controle.', false)}
    <div class="notice warning">${icon('alert')}<div><strong>Seus dados pertencem a este navegador.</strong><p>Limpar os dados do site, apagar o perfil ou usar uma janela anônima pode remover suas atividades. Crie backups JSON regularmente e guarde uma cópia em outro local. Não há sincronização ou backup automático em nuvem.</p></div></div>
    <div class="backup-grid"><section class="panel backup-card"><div class="feature-icon green">${icon('download')}</div><h2>Exportar backup completo</h2><p>Um arquivo JSON com todas as atividades, histórico, identificadores, datas e preferências. Use para recuperar seus dados ou migrar de computador.</p><div class="backup-summary"><span>Atividades registradas<strong>${tasks.length}</strong></span><span>Última exportação JSON<strong>${settings.lastBackupAt ? dateTimeLabel(settings.lastBackupAt) : 'Ainda não realizada'}</strong></span></div><button class="button primary" data-action="export-json">${icon('download')}Baixar backup JSON</button></section>
    <section class="panel backup-card"><div class="feature-icon blue">${icon('backup')}</div><h2>Restaurar um backup</h2><p>Selecione um JSON exportado pelo Compasso. O arquivo será validado antes da confirmação. A restauração substitui todas as atividades e preferências atuais.</p><label class="file-drop" for="backup-file">${icon('file')}<strong>Selecionar arquivo JSON</strong><span>Até 20 MB · até 50.000 atividades</span><input id="backup-file" type="file" accept=".json,application/json"></label><p class="small-text">Exporte um backup atual antes de substituir os dados.</p></section></div>
    <section class="panel csv-panel"><div><h2>Leve seus relatórios para a planilha</h2><p>Arquivos CSV compatíveis com Excel, em UTF-8 e com separador ponto e vírgula. CSV é um relatório; use JSON para restaurar dados.</p></div><div class="button-row"><button class="button secondary" data-action="export-active">${icon('download')}Ativas em CSV</button><button class="button secondary" data-action="export-history">${icon('download')}Histórico em CSV</button></div></section>`;
}
function settingsPage() {
  const theme = settings.theme || 'system';
  return `${heading('DO SEU JEITO', 'Seu espaço de trabalho.', 'Pequenas preferências para uma rotina mais confortável.', false)}<section class="panel settings-panel"><div class="setting-row"><div><h2>Aparência</h2><p>Escolha o tema que combina com o seu dia.</p></div><label class="sr-only" for="theme-select">Tema</label><select id="theme-select"><option value="system" ${theme === 'system' ? 'selected' : ''}>Seguir o sistema</option><option value="light" ${theme === 'light' ? 'selected' : ''}>Claro</option><option value="dark" ${theme === 'dark' ? 'selected' : ''}>Escuro</option></select></div><div class="setting-row"><div><h2>Proteção do armazenamento</h2><p>${storagePersisted ? 'O navegador concedeu armazenamento persistente. Mantenha backups mesmo assim.' : 'Solicite ao navegador uma proteção adicional contra remoção automática dos dados. A concessão depende do navegador.'}</p></div><button class="button secondary" data-action="persist" ${storagePersisted ? 'disabled' : ''}>${icon('shield')}${storagePersisted ? 'Proteção concedida' : 'Solicitar proteção'}</button></div><div class="setting-row"><div><h2>Origem dos dados</h2><p>Use sempre o mesmo navegador, perfil e endereço para reencontrar suas atividades.</p></div><code>${html(location.origin)}</code></div>${webSettings()}</section><div class="notice">${icon('info')}<div><strong>Seus dados, neste navegador.</strong><p>As atividades são gravadas no navegador deste aparelho. Na rede local, mantenha o computador servidor ligado e os aparelhos conectados à mesma rede. Não é necessário acesso à internet. Os dados não são sincronizados entre aparelhos; use backups JSON para transferir registros.</p><a class="text-link" href="#backup">Gerenciar meus backups ${icon('arrow')}</a></div></div>`;
}

function webSettings() {
  const state = webState();
  const offline = state.offlineReady ? 'Este navegador já tem uma cópia do aplicativo para abrir sem conexão. Continue fazendo backups dos dados.' : 'Para abrir ou recarregar o site pela rede, mantenha o computador servidor ligado. Não é necessária conexão com a internet.';
  return `<div class="setting-row"><div><h2>Acesso pelo navegador</h2><p>${offline}</p></div><span class="badge ${state.offlineReady ? 'green' : 'blue'}">${icon(state.offlineReady ? 'circleCheck' : 'grid')}${state.offlineReady ? 'Disponível offline' : 'Acesso pela rede local'}</span></div>${state.supported && !state.development ? `<div class="setting-row"><div><h2>Instalar como aplicativo</h2><p>${state.installed ? 'O Compasso está aberto como aplicativo neste aparelho.' : 'Você também pode usar um atalho próprio. Se o navegador oferecer a opção, escolha instalar ou adicionar à tela inicial.'}</p></div>${state.installed ? '<span class="badge green">Instalado</span>' : '<button class="button secondary" data-action="install-app">Instalar app</button>'}</div>` : ''}`;
}

function openTask(task = null, duplicate = false) {
  if (!ready) return notify('O banco local ainda não está disponível.', true);
  const dialog = $('#task-dialog');
  if (dialog.open) return;
  const form = $('#task-form');
  form.reset();
  editingId = duplicate ? null : task?.id || null;
  $('#form-error').hidden = true;
  $('#task-dialog-title').textContent = duplicate ? 'Duplicar atividade' : task ? 'Editar atividade' : 'Nova atividade';
  if (task) {
    for (const name of ['title', 'requester', 'priority', 'description', 'location', 'notes', 'status', 'dueDate']) form.elements.namedItem(name).value = task[name];
    if (duplicate) { form.elements.title.value = `${task.title.slice(0, 152)} (cópia)`; form.elements.status.value = 'pending'; }
  }
  $('#requester-suggestions').innerHTML = [...new Set(tasks.map(t => t.requester))].map(name => `<option value="${html(name)}"></option>`).join('');
  $('#created-note').textContent = task && !duplicate ? `Cadastrada em ${dateTimeLabel(task.createdAt)} · ID ${task.id}` : 'A data de cadastro será registrada automaticamente.';
  dialog.showModal();
  $('#task-title').focus();
}
function openDetails(task) {
  const dialog = $('#detail-dialog');
  $('#detail-content').innerHTML = `<div class="dialog-heading"><div><span class="eyebrow">DETALHES DA ATIVIDADE</span><h2 id="detail-title">${html(task.title)}</h2></div><button class="icon-button" data-action="close-details" aria-label="Fechar detalhes">${icon('close')}</button></div><div class="detail-badges">${priorityBadge(task)}${statusBadge(task)}${isOverdue(task) ? '<span class="badge red">Prazo vencido</span>' : ''}</div><dl class="details-grid"><div><dt>Solicitante</dt><dd>${html(task.requester)}</dd></div><div><dt>Local de realização</dt><dd>${html(task.location)}</dd></div><div><dt>Cadastrada em</dt><dd>${dateTimeLabel(task.createdAt)}</dd></div><div><dt>Data prevista</dt><dd>${dateLabel(task.dueDate)}</dd></div><div><dt>Conclusão (data e horário)</dt><dd>${dateTimeLabel(task.completedAt)}</dd></div><div><dt>Tempo entre cadastro e conclusão</dt><dd>${duration(task)}</dd></div><div class="full"><dt>Descrição</dt><dd class="multiline">${html(task.description || 'Nenhuma descrição informada.')}</dd></div><div class="full"><dt>Observações</dt><dd class="multiline">${html(task.notes || 'Nenhuma observação informada.')}</dd></div><div class="full"><dt>Identificador</dt><dd class="identifier">${html(task.id)}</dd></div><div class="full"><dt>Última alteração</dt><dd>${dateTimeLabel(task.updatedAt)}</dd></div></dl><div class="dialog-footer"><button class="button secondary" data-action="duplicate" data-id="${html(task.id)}">${icon('copy')}Duplicar</button><button class="button primary" data-action="edit" data-id="${html(task.id)}">${icon('edit')}Editar atividade</button></div>`;
  if (!dialog.open) dialog.showModal();
}

function confirmAction(title, message, label = 'Excluir permanentemente', danger = true) {
  const dialog = $('#confirm-dialog');
  if (dialog.open) return Promise.resolve(false);
  $('#confirm-title').textContent = title;
  $('#confirm-message').textContent = message;
  $('#confirm-button').textContent = label;
  $('#confirm-button').className = `button ${danger ? 'danger' : 'primary'}`;
  $('#confirm-icon').innerHTML = icon(danger ? 'alert' : 'history');
  dialog.returnValue = 'cancel';
  return new Promise(resolve => { dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true }); dialog.showModal(); });
}

async function commit(operation, message) {
  if (busy) return false;
  busy = true;
  let persisted = false;
  try {
    await operation();
    persisted = true;
    tasks = await database.all();
    lastSaved = new Date().toISOString();
    render();
    channel?.postMessage('updated');
    notify(message);
    return true;
  } catch (error) {
    if (persisted) {
      channel?.postMessage('updated');
      notify('A operação foi salva, mas não foi possível atualizar a lista. Recarregue a página antes de continuar.', true);
      return true;
    }
    notify(`Não foi possível salvar a operação. ${error.message || 'Verifique o espaço livre e tente novamente.'}`, true);
    return false;
  } finally { busy = false; }
}

$('#task-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (busy) return;
  const form = event.currentTarget;
  for (const name of ['title', 'requester', 'location']) {
    const input = form.elements.namedItem(name);
    input.setCustomValidity(input.value.trim() ? '' : 'Preencha este campo com um texto.');
  }
  if (!form.reportValidity()) return;
  const original = editingId ? tasks.find(t => t.id === editingId) : null;
  if (editingId && !original) return notify('Esta atividade foi removida em outra aba. Feche o formulário e atualize a lista.', true);
  const task = createTask(Object.fromEntries(new FormData(form)), original);
  $('#save-task').disabled = true;
  $('#save-task').textContent = 'Salvando…';
  const success = await commit(() => original ? database.put(task) : database.add(task), original ? 'Atividade atualizada.' : 'Atividade cadastrada. Bom trabalho!');
  $('#save-task').disabled = false;
  $('#save-task').textContent = 'Salvar atividade';
  if (success) $('#task-dialog').close();
  else { $('#form-error').textContent = 'A atividade não foi salva. Seus campos continuam aqui; tente novamente.'; $('#form-error').hidden = false; }
});
$('#task-form').addEventListener('input', event => event.target.setCustomValidity?.(''));

function navigate(target, nextFilters = {}) {
  filters = nextFilters;
  limit = 50;
  preserveNavigationFilters = getPage() !== target;
  if (getPage() === target) { page = target; render(); } else location.hash = target;
}

async function actionHandler(action, element) {
  if (action === 'retry') return initialize();
  if (action === 'menu' || action === 'menu-close') {
    const open = action === 'menu' && !document.body.classList.contains('menu-open');
    document.body.classList.toggle('menu-open', open);
    $('.sidebar-overlay').hidden = !open;
    return;
  }
  if (!ready) return notify('O banco local ainda não está disponível. Tente reabrir o sistema.', true);
  if (action === 'new') return openTask();
  if (action === 'close-task') { if (!busy) $('#task-dialog').close(); return; }
  if (action === 'close-details') return $('#detail-dialog').close();
  if (action === 'clear-filters') { filters = {}; limit = 50; render(); return; }
  if (action === 'load-more') { limit += 50; render(); return; }
  if (action === 'priority-filter') return navigate('atividades', { priority: element.dataset.priority });
  if (action === 'metric') {
    if (element.dataset.target === 'critical') return navigate('atividades', { priority: 'critical' });
    if (element.dataset.target === 'today') return navigate('historico', { from: localDate(), to: localDate() });
    return navigate(element.dataset.target);
  }
  if (action === 'toggle-theme') return changeTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  if (action === 'install-app') return installApp();
  if (action === 'persist') {
    if (!navigator.storage?.persist) return notify('Este navegador não oferece a solicitação de proteção. Continue fazendo backups JSON.', true);
    storagePersisted = await navigator.storage.persist();
    render();
    notify(storagePersisted ? 'Proteção concedida pelo navegador. Continue mantendo backups.' : 'O navegador não concedeu a proteção. Faça backups JSON regularmente.');
    return;
  }
  if (action === 'export-json') {
    const stamp = new Date().toISOString();
    download(backupJSON(tasks, { ...settings, lastBackupAt: stamp }), 'compasso-backup', 'json', 'application/json;charset=utf-8');
    await database.setSetting('lastBackupAt', stamp);
    settings.lastBackupAt = stamp;
    render();
    channel?.postMessage('updated');
    notify('Download do backup iniciado. Guarde o arquivo em um local seguro.');
    return;
  }
  if (action === 'export-active' || action === 'export-history') {
    const history = action === 'export-history';
    download(tasksCSV(selectTasks(tasks, {}, history)), history ? 'compasso-historico' : 'compasso-ativas', 'csv', 'text/csv;charset=utf-8');
    notify('Download do CSV iniciado.');
    return;
  }
  const task = tasks.find(item => item.id === element.dataset.id);
  if (!task) return;
  if (action === 'details') return openDetails(task);
  if (action === 'edit' || action === 'duplicate') { $('#detail-dialog').close(); return openTask(task, action === 'duplicate'); }
  if (action === 'delete') {
    if (await confirmAction('Excluir esta atividade?', `“${task.title}” será excluída permanentemente do banco local. Esta ação não pode ser desfeita. Um backup anterior poderá recuperá-la.`)) await commit(() => database.remove(task.id), 'Atividade excluída permanentemente.');
    return;
  }
  if (action === 'restore') {
    if (await confirmAction('Restaurar esta atividade?', `“${task.title}” voltará para a lista de pendentes. A data da conclusão atual será removida; a data de cadastro será preservada.`, 'Restaurar atividade', false)) await commit(() => database.put({ ...task, status: 'pending', completedAt: null, updatedAt: new Date().toISOString() }), 'Atividade restaurada para pendentes.');
    return;
  }
  if (action === 'start' || action === 'complete') {
    const now = new Date().toISOString();
    await commit(() => database.put({ ...task, status: action === 'start' ? 'progress' : 'completed', updatedAt: now, completedAt: action === 'complete' ? now : null }), action === 'start' ? 'Atividade iniciada.' : 'Atividade concluída e guardada no histórico.');
  }
}

document.addEventListener('click', event => {
  const element = event.target.closest('[data-action]');
  if (element) actionHandler(element.dataset.action, element).catch(error => notify(`A operação não pôde ser concluída: ${error.message}`, true));
  if (event.target.closest('nav a, .brand')) { document.body.classList.remove('menu-open'); $('.sidebar-overlay').hidden = true; }
});

let searchTimer;
document.addEventListener('input', event => {
  if (event.target.dataset.filter === 'search') {
    filters.search = event.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { limit = 50; render(); }, 180);
  }
});
document.addEventListener('change', async event => {
  const element = event.target;
  if (element.dataset.filter && element.dataset.filter !== 'search') { filters[element.dataset.filter] = element.value; limit = 50; render(); }
  if (element.id === 'theme-select') changeTheme(element.value).catch(error => notify(error.message, true));
  if (element.id === 'backup-file') {
    const file = element.files[0];
    if (!file) return;
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('O arquivo excede o limite de 20 MB.');
      let data;
      try { data = JSON.parse((await file.text()).replace(/^\uFEFF/, '')); } catch { throw new Error('Este arquivo não é um JSON válido. Nenhum dado foi alterado.'); }
      const imported = validateBackup(data);
      if (await confirmAction('Substituir todos os dados?', `O backup contém ${imported.tasks.length} atividade(s). As ${tasks.length} atividade(s) atuais e suas preferências serão substituídas. Faça uma exportação antes de continuar.`, 'Substituir e restaurar')) {
        const success = await commit(() => database.replace(imported.tasks, imported.settings), 'Backup restaurado. Identificadores, datas e histórico preservados.');
        if (success) { settings = imported.settings; applyTheme(); render(); }
      }
    } catch (error) { notify(error.message, true); }
    finally { element.value = ''; }
  }
});

async function changeTheme(theme) {
  await database.setSetting('theme', theme);
  settings.theme = theme;
  applyTheme();
  render();
  channel?.postMessage('updated');
}
window.addEventListener('hashchange', () => {
  const next = getPage();
  // navigate() sets filters before changing the hash; ordinary links start fresh.
  if (!preserveNavigationFilters) filters = {};
  preserveNavigationFilters = false;
  page = next;
  limit = 50;
  render();
  window.scrollTo({ top: 0 });
  $('#main').focus({ preventScroll: true });
});
async function refresh() {
  if (!ready || busy) return;
  try { [tasks, settings] = await Promise.all([database.all(), database.settings()]); applyTheme(); render(); }
  catch (error) { notify(`Não foi possível reler o banco local: ${error.message}`, true); }
}
channel?.addEventListener('message', refresh);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (!settings.theme || settings.theme === 'system') applyTheme(); });
setInterval(() => { if (ready && !document.querySelector('dialog[open]')) render(); }, 60000);

async function initialize() {
  try {
    await openDatabase();
    [tasks, settings] = await Promise.all([database.all(), database.settings()]);
    storagePersisted = await navigator.storage?.persisted?.().catch(() => false) || false;
    ready = true;
    applyTheme();
    render();
  } catch (error) {
    $('#save-status').textContent = 'Banco local indisponível';
    $('#main').innerHTML = `<div class="notice warning" role="alert">${icon('alert')}<div><h1>Não foi possível abrir seus dados</h1><p>${html(error.message)}</p><p>Verifique se o navegador permite armazenar dados neste site. Não limpe o armazenamento para tentar corrigir o problema sem antes preservar um backup.</p><button class="button primary" data-action="retry">Tentar novamente</button></div></div>`;
  }
}
initialize();
initializeWeb({ notify, onChange: () => { if (page === 'configuracoes') render(); } });
