import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { backendFixture, connectFixture, configureCloudFixture } from './helpers/cloud-fixture.js';

async function add(page, title) {
  await page.getByRole('button', { name: 'Nova atividade', exact: true }).first().click();
  const form = page.locator('#task-form');
  await form.getByLabel('Nome da atividade').fill(title);
  await form.getByLabel('Solicitante').fill('Equipe');
  await form.getByLabel('Local de realização').fill('Produção');
  await page.locator('#save-task').click();
  await expect(page.locator('#task-dialog')).not.toBeVisible();
}
async function login(page, email = 'ana@example.test') {
  await page.goto('/#conta');
  const form = page.locator('[data-auth-form="login"]');
  await form.locator('[name="email"]').fill(email);
  await form.locator('[name="password"]').fill('Teste-seguro-123');
  await form.getByRole('button', { name: 'Entrar e carregar atividades' }).click();
  await expect(page.locator('.account-summary')).toContainText(email);
  await expect(page.locator('#storage-banner')).not.toBeVisible();
}
async function localRecords(page) {
  return page.evaluate(async () => (await import('/js/database.js')).localDatabase.all());
}
async function dashboard(page) {
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Seu dia, sob controle.' })).toBeVisible();
}

test('sem configuração, informa que os registros ainda são locais', async ({ page, context }) => {
  await configureCloudFixture(context, { url: '', publishableKey: '' });
  await page.goto('/#conta');
  await expect(page.getByText('A conexão com a nuvem ainda não foi ativada.')).toBeVisible();
  await expect(page.locator('[data-auth-form]')).toHaveCount(0);
});

test('migração explícita preserva originais e permite consultar em outro navegador', async ({ page, context, browser }) => {
  const backend = backendFixture();
  await connectFixture(context, backend);
  await page.goto('/');
  await add(page, 'Atividade local original');
  const local = await localRecords(page);
  await login(page);
  expect(backend.account('ana@example.test').tasks.size).toBe(0);
  await page.getByRole('button', { name: 'Enviar atividades locais' }).click();
  await page.locator('#confirm-dialog').getByRole('button', { name: 'Enviar para a nuvem', exact: true }).click();
  await expect.poll(() => backend.account('ana@example.test').tasks.size).toBe(1);
  expect(await localRecords(page)).toEqual(local);
  expect([...backend.account('ana@example.test').tasks.values()][0].payload).toEqual(local[0]);
  const otherContext = await browser.newContext();
  try {
    await connectFixture(otherContext, backend);
    const other = await otherContext.newPage();
    await login(other);
    await dashboard(other);
    await expect(other.locator('table .task-title')).toHaveText('Atividade local original');
    await other.getByRole('button', { name: 'Concluir atividade', exact: true }).click();
    await expect(other.locator('[data-metric="completed"]')).toHaveText('1');
    await page.getByRole('button', { name: 'Sincronizar agora' }).click();
    await page.getByRole('link', { name: 'Histórico de concluídas' }).click();
    await expect(page.locator('table .task-title')).toHaveText('Atividade local original');
    await page.reload();
    await expect(page.locator('table .task-title')).toHaveText('Atividade local original');
    expect(await localRecords(page)).toEqual(local);
  } finally { await otherContext.close(); }
});

test('falha de rede não salva em um banco local substituto e mantém o formulário', async ({ page, context }) => {
  const backend = backendFixture(); await connectFixture(context, backend);
  await login(page); await dashboard(page);
  backend.failWrites = true;
  await page.getByRole('button', { name: 'Nova atividade', exact: true }).first().click();
  await page.locator('#task-form [name="title"]').fill('Manter preenchido');
  await page.locator('#task-form [name="requester"]').fill('Equipe');
  await page.locator('#task-form [name="location"]').fill('Setor');
  await page.locator('#save-task').click();
  await expect(page.locator('#form-error')).toContainText('não foi confirmada');
  await expect(page.locator('#task-form [name="title"]')).toHaveValue('Manter preenchido');
  expect(backend.account('ana@example.test').tasks.size).toBe(0);
  expect(await localRecords(page)).toHaveLength(0);
  backend.failWrites = false;
  await page.locator('#save-task').click();
  await expect(page.locator('#task-dialog')).not.toBeVisible();
  expect(backend.account('ana@example.test').tasks.size).toBe(1);
});

test('confirmação perdida pode ser repetida sem duplicar o cadastro', async ({ page, context }) => {
  const backend = backendFixture(); await connectFixture(context, backend);
  await login(page); await dashboard(page);
  backend.loseAcknowledgement = true;
  await page.getByRole('button', { name: 'Nova atividade', exact: true }).first().click();
  await page.locator('#task-form [name="title"]').fill('Uma única vez');
  await page.locator('#task-form [name="requester"]').fill('Equipe');
  await page.locator('#task-form [name="location"]').fill('Setor');
  await page.locator('#save-task').click();
  await expect(page.locator('#form-error')).toBeVisible();
  expect(backend.account('ana@example.test').tasks.size).toBe(1);
  await page.locator('#save-task').click();
  await expect(page.locator('#task-dialog')).not.toBeVisible();
  expect(backend.account('ana@example.test').tasks.size).toBe(1);
  expect(backend.writes[0].p_request_id).toBe(backend.writes[1].p_request_id);
  expect(backend.writes[0].p_task.id).toBe(backend.writes[1].p_task.id);
});

test('edição obsoleta não sobrescreve alteração feita em outro aparelho', async ({ page, context }) => {
  const backend = backendFixture(); await connectFixture(context, backend);
  await login(page); await dashboard(page); await add(page, 'Título inicial');
  const id = [...backend.account('ana@example.test').tasks.keys()][0];
  await page.getByRole('button', { name: 'Editar atividade', exact: true }).click();
  await page.locator('#task-form [name="title"]').fill('Minha edição antiga');
  backend.mutate('ana@example.test', id, { title: 'Alterada no outro aparelho' });
  await page.locator('#save-task').click();
  await expect(page.locator('#form-error')).toBeVisible();
  await expect(page.getByRole('alert').first()).toContainText('Outra alteração');
  expect(backend.account('ana@example.test').tasks.get(id).payload.title).toBe('Alterada no outro aparelho');
});

test('logout e troca de conta não revelam tarefas da conta anterior', async ({ page, context }) => {
  const backend = backendFixture(); await connectFixture(context, backend);
  await login(page); await dashboard(page); await add(page, 'Privada da Ana');
  await page.getByRole('link', { name: 'Conta e nuvem', exact: true }).click();
  await page.getByRole('button', { name: 'Sair da conta', exact: true }).click();
  await expect(page.locator('[data-auth-form="login"]')).toBeVisible();
  expect(await localRecords(page)).toHaveLength(0);
  await login(page, 'bia@example.test'); await dashboard(page);
  await expect(page.locator('[data-metric="active"]')).toHaveText('0');
  await expect(page.getByText('Privada da Ana')).toHaveCount(0);
  expect(backend.account('ana@example.test').tasks.size).toBe(1);
});

test('exportação cloud não inclui tokens/revisões e restauração preserva dados locais', async ({ page, context }) => {
  const backend = backendFixture(); await connectFixture(context, backend);
  await page.goto('/'); await add(page, 'Fica somente local');
  const local = await localRecords(page);
  await login(page); await dashboard(page); await add(page, 'Registro na nuvem');
  await page.getByRole('link', { name: 'Backup e restauração', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar backup JSON' }).click();
  const raw = await readFile(await (await pending).path(), 'utf8');
  expect(raw).not.toContain('access_token'); expect(raw).not.toContain('_cloudRevision');
  expect(JSON.parse(raw).tasks[0].title).toBe('Registro na nuvem');
  await page.locator('#backup-file').setInputFiles({ name: 'vazio.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...JSON.parse(raw), tasks: [] })) });
  await expect(page.locator('#confirm-dialog')).toContainText('todos os aparelhos');
  await page.locator('#confirm-dialog').getByRole('button', { name: 'Substituir e restaurar' }).click();
  await expect.poll(() => backend.account('ana@example.test').tasks.size).toBe(0);
  expect(await localRecords(page)).toEqual(local);
  await page.locator('#backup-file').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(raw) });
  await page.locator('#confirm-dialog').getByRole('button', { name: 'Substituir e restaurar' }).click();
  await expect.poll(() => backend.account('ana@example.test').tasks.size).toBe(1);
  expect(await localRecords(page)).toEqual(local);
});

test('cadastro com confirmação e recuperação de senha têm ações reais', async ({ page, context }) => {
  const backend = backendFixture(); await connectFixture(context, backend);
  await page.goto('/#conta');
  const signup = page.locator('[data-auth-form="signup"]');
  await signup.locator('[name="email"]').fill('ana@example.test');
  await signup.locator('[name="password"]').fill('Teste-seguro-123');
  await signup.getByRole('button', { name: 'Criar conta', exact: true }).click();
  await expect(page.getByText('Confira seu email para confirmar o cadastro. Depois, entre na conta.', { exact: true })).toBeVisible();
  await page.locator('.recovery-details summary').click();
  const recovery = page.locator('[data-auth-form="recover"]');
  await recovery.locator('[name="email"]').fill('ana@example.test');
  await recovery.getByRole('button').click();
  await expect.poll(() => backend.recoveries.length).toBe(1);
  const session = backend.session('ana@example.test');
  await page.goto(`/#access_token=${session.access_token}&refresh_token=${session.refresh_token}&type=recovery&expires_in=3600`);
  await expect(page.locator('[data-auth-form="password"]')).toBeVisible();
  expect(page.url()).not.toContain('access_token');
  await page.locator('[data-auth-form="password"] [name="password"]').fill('Nova-senha-segura-123');
  await page.getByRole('button', { name: 'Salvar nova senha' }).click();
  await expect.poll(() => backend.passwordChanges).toBe(1);
  await expect(page.locator('[data-auth-form="password"]')).toHaveCount(0);
});

test('renova uma sessão expirada e não troca silenciosamente pela base local', async ({ page, context }) => {
  const backend = backendFixture(); await connectFixture(context, backend);
  await login(page); await dashboard(page); await add(page, 'Permanece na conta');
  await page.evaluate(() => {
    const key = Object.keys(sessionStorage).find(key => key.startsWith('compasso-session:'));
    const value = JSON.parse(sessionStorage.getItem(key)); value.expires_at = 1; sessionStorage.setItem(key, JSON.stringify(value));
  });
  await page.reload();
  await expect(page.locator('table .task-title')).toHaveText('Permanece na conta');
  backend.failReads = true;
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Não foi possível abrir seus dados' })).toBeVisible();
  await expect(page.locator('[data-metric]')).toHaveCount(0);
  expect(await localRecords(page)).toHaveLength(0);
});
