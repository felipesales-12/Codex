import { test, expect, chromium } from '@playwright/test';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const form = page => page.locator('#task-form');
async function boot(page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Seu dia, sob controle.' })).toBeVisible();
}
async function addTask(page, title = 'Inspeção de bomba hidráulica', extras = {}) {
  await page.getByRole('button', { name: 'Nova atividade', exact: true }).first().click();
  await form(page).getByLabel('Nome da atividade').fill(title);
  await form(page).getByLabel('Solicitante').fill(extras.requester || 'José da manutenção');
  await form(page).getByLabel('Local de realização').fill(extras.location || 'Produção — Linha 03');
  await form(page).getByLabel('Descrição', { exact: true }).fill('Inspecionar pressão\nTrocar vedação se necessário.');
  await form(page).getByLabel('Observações').fill('Levar equipamento de proteção.');
  await form(page).getByLabel('Urgência').selectOption(extras.priority || 'critical');
  if (extras.dueDate) await form(page).getByLabel('Data prevista').fill(extras.dueDate);
  if (extras.status) await form(page).getByLabel('Status').selectOption(extras.status);
  await page.getByRole('button', { name: 'Salvar atividade', exact: true }).click();
  await expect(page.locator('#task-dialog')).not.toBeVisible();
}
async function records(page) {
  return page.evaluate(async () => (await import('/js/database.js')).database.all());
}
async function downloadText(page, action) {
  const pending = page.waitForEvent('download');
  await action();
  const download = await pending;
  return readFile(await download.path(), 'utf8');
}
async function confirm(page, name) { await page.locator('#confirm-dialog').getByRole('button', { name, exact: true }).click(); }

test('cadastrar, recarregar, editar, iniciar, concluir, histórico, restaurar, duplicar e excluir', async ({ page }) => {
  await boot(page);
  await expect(page.locator('[data-metric="active"]')).toHaveText('0');
  await addTask(page, undefined, { dueDate: '2000-01-01' });
  await expect(page.locator('[data-metric="active"]')).toHaveText('1');
  await expect(page.locator('[data-metric="critical"]')).toHaveText('1');
  await expect(page.locator('.overdue-alert')).toContainText('1 atividade');
  const original = (await records(page))[0];
  await page.reload();
  await expect(page.locator('table .task-title')).toHaveText(original.title);
  await page.getByRole('button', { name: 'Editar atividade', exact: true }).click();
  await form(page).getByLabel('Nome da atividade').fill('Inspeção revisada');
  await form(page).getByLabel('Observações').fill('Peça já disponível.');
  await page.getByRole('button', { name: 'Salvar atividade', exact: true }).click();
  await expect(page.locator('table .task-title')).toHaveText('Inspeção revisada');
  await page.getByRole('button', { name: 'Iniciar atividade', exact: true }).click();
  await expect(page.locator('[data-metric="pending"]')).toHaveText('0');
  await expect(page.locator('[data-metric="progress"]')).toHaveText('1');
  await page.getByRole('button', { name: 'Concluir atividade', exact: true }).click();
  await expect(page.locator('[data-metric="active"]')).toHaveText('0');
  await expect(page.locator('[data-metric="today"]')).toHaveText('1');
  await expect(page.locator('[data-metric="completed"]')).toHaveText('1');
  await expect(page.locator('table')).toHaveCount(0);
  await page.getByRole('link', { name: 'Histórico de concluídas' }).click();
  await expect(page.locator('table .task-title')).toHaveText('Inspeção revisada');
  await page.reload();
  await expect(page.locator('table .task-title')).toHaveText('Inspeção revisada');
  await page.locator('table .task-title').click();
  await expect(page.locator('#detail-dialog')).toContainText('Peça já disponível.');
  await expect(page.locator('#detail-dialog')).toContainText(original.id);
  await expect(page.locator('#detail-dialog')).toContainText('Trocar vedação');
  await page.getByRole('button', { name: 'Fechar detalhes' }).click();
  const complete = (await records(page))[0];
  expect(complete.id).toBe(original.id);
  expect(complete.createdAt).toBe(original.createdAt);
  expect(complete.completedAt).toBeTruthy();
  await page.getByRole('button', { name: 'Restaurar atividade' }).click();
  await confirm(page, 'Restaurar atividade');
  await expect(page.locator('table')).toHaveCount(0);
  await page.getByRole('link', { name: /^Pendentes/ }).click();
  await expect(page.locator('table .task-title')).toHaveText('Inspeção revisada');
  expect((await records(page))[0].completedAt).toBeNull();
  await page.getByRole('button', { name: 'Duplicar atividade' }).click();
  await page.getByRole('button', { name: 'Salvar atividade', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(2);
  const copies = await records(page);
  expect(new Set(copies.map(t => t.id)).size).toBe(2);
  await page.getByRole('button', { name: 'Excluir atividade' }).first().click();
  await confirm(page, 'Cancelar');
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await page.getByRole('button', { name: 'Excluir atividade' }).first().click();
  await confirm(page, 'Excluir permanentemente');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('tbody tr')).toHaveCount(1);
});

test('pesquisa, filtros combinados, ordenação, atalhos do dashboard e histórico', async ({ page }) => {
  await boot(page);
  await addTask(page, 'Bomba principal', { priority: 'critical', requester: 'José' });
  await addTask(page, 'Limpeza do filtro', { priority: 'low', requester: 'Ana', status: 'progress' });
  await addTask(page, 'Entrega final', { status: 'completed', requester: 'Ana' });
  await page.locator('[data-metric="active"]').click();
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await page.getByRole('searchbox').fill('pressao');
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await page.locator('#filter-priority').selectOption('critical');
  await page.locator('#filter-requester').selectOption('José');
  await page.locator('#filter-status').selectOption('pending');
  const today = await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  await page.locator('#filter-from').fill(today);
  await page.locator('#filter-to').fill(today);
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('table .task-title')).toHaveText('Bomba principal');
  await page.getByRole('searchbox').fill('ausente');
  await expect(page.getByText('Nenhuma atividade encontrada')).toBeVisible();
  await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await page.locator('#sort').selectOption('oldest');
  await expect(page.locator('table .task-title').first()).toHaveText('Bomba principal');
  await page.locator('#sort').selectOption('recent');
  await expect(page.locator('table .task-title').first()).toHaveText('Limpeza do filtro');
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  await page.locator('[data-metric="critical"]').click();
  await expect(page.locator('#filter-priority')).toHaveValue('critical');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  await page.locator('[data-metric="today"]').click();
  await expect(page.locator('#filter-from')).toHaveValue(today);
  await expect(page.locator('table .task-title')).toHaveText('Entrega final');
  await page.locator('#filter-requester').selectOption('Ana');
  await page.getByRole('searchbox').fill('final');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.locator('#filter-to').fill('1999-01-01');
  await expect(page.getByText('A data inicial deve ser anterior')).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(0);
});

test('backup JSON e CSV, validação, confirmação e restauração fiel', async ({ page }) => {
  await boot(page);
  await addTask(page);
  await addTask(page, 'Serviço concluído', { status: 'completed' });
  const before = await records(page);
  await page.getByRole('link', { name: 'Backup e restauração' }).click();
  const raw = await downloadText(page, () => page.getByRole('button', { name: 'Baixar backup JSON' }).click());
  expect(JSON.parse(raw).tasks).toEqual(before);
  const activeCSV = await downloadText(page, () => page.getByRole('button', { name: 'Ativas em CSV' }).click());
  expect(activeCSV).toContain('Inspeção de bomba hidráulica');
  expect(activeCSV).not.toContain('Serviço concluído');
  expect(activeCSV).toContain('Inspecionar pressão\nTrocar');
  const historyCSV = await downloadText(page, () => page.getByRole('button', { name: 'Histórico em CSV' }).click());
  expect(historyCSV).toContain('Serviço concluído');
  expect(historyCSV).toContain('Conclusão (ISO)');
  await page.locator('#backup-file').setInputFiles({ name: 'invalido.json', mimeType: 'application/json', buffer: Buffer.from('{"tasks":[]}') });
  await expect(page.getByRole('alert')).toContainText('Backup inválido');
  expect(await records(page)).toEqual(before);
  await page.locator('#backup-file').setInputFiles({ name: 'corrompido.json', mimeType: 'application/json', buffer: Buffer.from('{invalid') });
  await expect(page.getByRole('alert').last()).toContainText('não é um JSON válido');
  const duplicate = JSON.parse(raw); duplicate.tasks.push(duplicate.tasks[0]);
  await page.locator('#backup-file').setInputFiles({ name: 'duplicado.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(duplicate)) });
  await expect(page.getByRole('alert').last()).toContainText('inválidos');
  await page.locator('#backup-file').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(raw) });
  await confirm(page, 'Cancelar');
  expect(await records(page)).toEqual(before);
  // Remove all data through a validated empty backup, then restore the actual file.
  await page.locator('#backup-file').setInputFiles({ name: 'vazio.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...JSON.parse(raw), tasks: [] })) });
  await confirm(page, 'Substituir e restaurar');
  await expect.poll(async () => (await records(page)).length).toBe(0);
  await page.locator('#backup-file').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(raw) });
  await confirm(page, 'Substituir e restaurar');
  await expect.poll(() => records(page)).toEqual(before);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Uma cópia. Mais tranquilidade.' })).toBeVisible();
  expect(await records(page)).toEqual(before);
});

test('sem internet: operações completas, navegação, recarga local e nenhum recurso externo', async ({ page, context }) => {
  const external = [];
  await context.route('**/*', route => {
    if (new URL(route.request().url()).hostname !== 'localhost') { external.push(route.request().url()); return route.abort(); }
    return route.continue();
  });
  await boot(page);
  await addTask(page, 'Antes de desconectar');
  // Deny every network request. The loaded application must remain fully functional.
  await context.setOffline(true);
  await addTask(page, 'Cadastrada sem internet');
  await page.getByRole('link', { name: /^Pendentes/ }).click();
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await page.getByRole('button', { name: 'Concluir atividade' }).first().click();
  await page.getByRole('link', { name: 'Histórico de concluídas' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  const raw = await downloadText(page, () => page.getByRole('button', { name: 'Exportar histórico CSV' }).click());
  expect(raw).toContain('Concluída');
  // Re-enable loopback HTTP only; all non-local destinations remain blocked.
  await context.setOffline(false);
  await page.reload();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  expect((await records(page)).length).toBe(2);
  expect(external).toEqual([]);
});

test('tema persiste, layout móvel, validação, clique repetido e conteúdo sem execução HTML', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await boot(page);
  await page.getByRole('button', { name: 'Ativar tema escuro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Nova atividade', exact: true }).first().click();
  await form(page).getByLabel('Nome da atividade').fill('   ');
  await form(page).getByLabel('Solicitante').fill('Teste');
  await form(page).getByLabel('Local de realização').fill('Oficina');
  await page.getByRole('button', { name: 'Salvar atividade', exact: true }).click();
  await expect(page.locator('#task-dialog')).toBeVisible();
  expect(await records(page)).toHaveLength(0);
  await form(page).getByLabel('Nome da atividade').fill('<img src=x onerror=alert(1)>');
  await page.locator('#save-task').evaluate(button => { button.click(); button.click(); });
  await expect(page.locator('#task-dialog')).not.toBeVisible();
  expect(await records(page)).toHaveLength(1);
  await expect(page.locator('table img')).toHaveCount(0);
  await expect(page.locator('table .task-title')).toContainText('<img src=x');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Abrir menu' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await page.getByRole('link', { name: /^Pendentes/ }).click();
  await expect(page.locator('body')).not.toHaveClass(/menu-open/);
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('falha de gravação mantém o formulário, informa erro e não cria registro falso', async ({ page }) => {
  await boot(page);
  await page.evaluate(async () => {
    const { database } = await import('/js/database.js');
    database.add = async () => { throw new DOMException('Sem espaço no armazenamento.', 'QuotaExceededError'); };
  });
  await page.getByRole('button', { name: 'Nova atividade', exact: true }).first().click();
  await form(page).getByLabel('Nome da atividade').fill('Não deve desaparecer');
  await form(page).getByLabel('Solicitante').fill('Teste');
  await form(page).getByLabel('Local de realização').fill('Oficina');
  await page.getByRole('button', { name: 'Salvar atividade', exact: true }).click();
  await expect(page.locator('#form-error')).toContainText('não foi salva');
  await expect(form(page).getByLabel('Nome da atividade')).toHaveValue('Não deve desaparecer');
  expect(await records(page)).toHaveLength(0);
  await expect(page.locator('[data-metric="active"]')).toHaveText('0');
});

test('falha ao abrir o banco informa indisponibilidade sem fingir uma lista vazia', async ({ page }) => {
  await page.addInitScript(() => { IDBFactory.prototype.open = () => { throw new Error('Leitura bloqueada pelo navegador.'); }; });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Não foi possível abrir seus dados' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Leitura bloqueada');
  await expect(page.locator('[data-metric]')).toHaveCount(0);
});

test('uma importação abortada reverte a transação inteira', async ({ page }) => {
  await boot(page);
  await addTask(page);
  const before = await records(page);
  const result = await page.evaluate(async () => {
    const { database } = await import('/js/database.js');
    const task = (await database.all())[0];
    try { await database.replace([task, task], { theme: 'dark' }); return 'unexpected-success'; }
    catch { return 'aborted'; }
  });
  expect(result).toBe('aborted');
  expect(await records(page)).toEqual(before);
  await page.reload();
  await expect(page.locator('table .task-title')).toHaveText(before[0].title);
});

test('gravação confirmada com falha posterior de leitura não solicita novo cadastro', async ({ page }) => {
  await boot(page);
  await page.evaluate(async () => {
    const { database } = await import('/js/database.js');
    const original = database.all;
    let fail = true;
    database.all = async () => { if (fail) { fail = false; throw new Error('Leitura temporariamente indisponível.'); } return original(); };
  });
  await addTask(page, 'Gravada uma única vez');
  await expect(page.getByRole('alert')).toContainText('A operação foi salva');
  expect(await records(page)).toHaveLength(1);
  await page.reload();
  await expect(page.locator('table .task-title')).toHaveText('Gravada uma única vez');
});

test('IndexedDB permanece após fechar e reabrir o navegador com o mesmo perfil', async ({}, testInfo) => {
  const profile = await mkdtemp(join(tmpdir(), 'compasso-profile-'));
  const options = { ...testInfo.project.use.launchOptions, headless: true };
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, options);
    let page = await context.newPage();
    await page.goto('http://localhost:8765');
    await expect(page.locator('[data-metric="active"]')).toHaveText('0');
    await addTask(page, 'Sobrevive ao fechamento');
    const before = await records(page);
    await context.close();
    context = await chromium.launchPersistentContext(profile, options);
    page = await context.newPage();
    await page.goto('http://localhost:8765');
    await expect(page.locator('table .task-title')).toHaveText('Sobrevive ao fechamento');
    expect(await records(page)).toEqual(before);
  } finally { await context?.close(); await rm(profile, { recursive: true, force: true }); }
});
