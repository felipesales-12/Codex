import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTask, selectTasks, getMetrics, localDate, duration } from '../js/tasks.js';
import { backupJSON, validateBackup, tasksCSV } from '../js/backup.js';

const make = (changes = {}) => createTask({ title: 'Inspeção hidráulica', requester: 'José', priority: 'high', description: 'Revisar pressão\nTrocar vedação', location: 'Produção', notes: 'Usar EPI', status: 'pending', dueDate: '', ...changes });

test('criação gera ID, datas e conclusão consistente; edição preserva identidade', () => {
  const task = make();
  const completed = createTask({ ...task, title: 'Editada', status: 'completed' }, task);
  assert.equal(completed.id, task.id);
  assert.equal(completed.createdAt, task.createdAt);
  assert.ok(completed.completedAt);
  assert.equal(createTask({ ...completed, status: 'pending' }, completed).completedAt, null);
  assert.notEqual(make().id, task.id);
});

test('prioriza atrasos, depois urgência, sem alterar a coleção original', () => {
  const normal = make({ priority: 'critical' });
  const overdue = make({ priority: 'low', dueDate: '2000-01-01' });
  const input = [normal, overdue];
  assert.equal(selectTasks(input)[0].id, overdue.id);
  assert.equal(input[0].id, normal.id);
});

test('pesquisa ignora acentos e combina urgência, solicitante, status e intervalo', () => {
  const task = make();
  const today = localDate();
  assert.equal(selectTasks([task], { search: 'pressao', requester: 'JOSE', priority: 'high', status: 'pending', from: today, to: today }).length, 1);
  for (const search of ['hidraulica', 'jose', 'producao', 'epi']) assert.equal(selectTasks([task], { search }).length, 1);
  assert.equal(selectTasks([task], { priority: 'low' }).length, 0);
  assert.equal(selectTasks([task], { from: '9999-01-01' }).length, 0);
});

test('separa histórico e calcula todos os indicadores', () => {
  const task = make({ priority: 'critical', dueDate: '2000-01-01' });
  const progress = make({ status: 'progress' });
  const completed = make({ status: 'completed' });
  const all = [task, progress, completed];
  assert.deepEqual(getMetrics(all), { active: 2, pending: 1, progress: 1, critical: 1, today: 1, completed: 1, overdue: 1 });
  assert.equal(selectTasks(all).length, 2);
  assert.equal(selectTasks(all, {}, true)[0].id, completed.id);
  assert.equal(duration(completed), 'Menos de 1 minuto');
});

test('backup mantém todos os campos e preferências', () => {
  const tasks = [make(), make({ status: 'completed', priority: 'low' })];
  const settings = { theme: 'dark', lastBackupAt: new Date().toISOString() };
  const result = validateBackup(JSON.parse(backupJSON(tasks, settings)));
  assert.deepEqual(result, { tasks, settings });
  assert.deepEqual(validateBackup(JSON.parse(backupJSON([], {}))).tasks, []);
});

test('rejeita backups malformados, campos inválidos, IDs duplicados e datas impossíveis', () => {
  const valid = JSON.parse(backupJSON([make()], {}));
  for (const data of [null, {}, { ...valid, version: 9 }, { ...valid, tasks: [valid.tasks[0], valid.tasks[0]] }]) assert.throws(() => validateBackup(data));
  const bad = [
    { title: '' }, { priority: '__proto__' }, { status: 'constructor' }, { dueDate: '2026-02-30' },
    { createdAt: '2026-02-30T12:00:00Z' }, { notes: null }, { id: '' }, { completedAt: 'bad' },
    { status: 'completed', completedAt: null }, { status: 'completed', completedAt: '1999-01-01T00:00:00.000Z' },
  ];
  for (const changes of bad) assert.throws(() => validateBackup({ ...valid, tasks: [{ ...valid.tasks[0], ...changes }] }));
});

test('CSV preserva acentos e texto multilinha e neutraliza fórmulas de planilha', () => {
  const csv = tasksCSV([make({ title: '=1+1', description: 'Texto "com aspas";\nsegunda linha' })]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('Urgência'));
  assert.ok(csv.includes('"\'=1+1"'));
  assert.ok(csv.includes('"Texto ""com aspas"";\nsegunda linha"'));
});
