import { test, expect } from '@playwright/test';
import { backendFixture, connectFixture } from './helpers/firebase-fixture.js';

async function login(page, email = 'ana@example.test') {
  await page.goto('/#conta');
  const form = page.locator('[data-auth-form="login"]');
  await form.locator('[name="email"]').fill(email); await form.locator('[name="password"]').fill('Teste-seguro-123');
  await form.getByRole('button').click();
  await expect(page.locator('.account-summary')).toContainText(email);
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
}
async function draft(page, title) {
  await page.getByRole('button', { name: 'Nova atividade', exact: true }).first().click();
  for (const [name, value] of Object.entries({ title, requester: 'Equipe', location: 'Setor' })) await page.locator(`#task-form [name="${name}"]`).fill(value);
}
async function save(page) { await page.locator('#save-task').click(); await expect(page.locator('#task-dialog')).not.toBeVisible(); }
const rows = backend => Object.values(backend.account('ana@example.test').data?.tasks || {});

test('Firebase: grava, recarrega, conclui e acessa em outro navegador sem copiar para IndexedDB', async ({ page, context, browser }) => {
  const backend = backendFixture(); await connectFixture(context, backend);
  await login(page); await draft(page, 'Salva na conta Firebase'); await save(page);
  expect(rows(backend)[0].payload.title).toBe('Salva na conta Firebase');
  await page.reload(); await expect(page.locator('table .task-title')).toHaveText('Salva na conta Firebase');
  const otherContext = await browser.newContext();
  try {
    await connectFixture(otherContext, backend); const other = await otherContext.newPage(); await login(other);
    await expect(other.locator('table .task-title')).toHaveText('Salva na conta Firebase');
    await other.getByRole('button', { name: 'Concluir atividade', exact: true }).click();
    await expect(other.locator('[data-metric="completed"]')).toHaveText('1');
    await page.reload(); await expect(page.locator('[data-metric="completed"]')).toHaveText('1');
    expect(await page.evaluate(async () => (await import('/js/database.js')).localDatabase.all())).toHaveLength(0);
  } finally { await otherContext.close(); }
});
test('Firebase: resposta perdida pode ser repetida sem duplicação; falha mantém formulário', async ({ page, context }) => {
  const backend = backendFixture(); await connectFixture(context, backend); await login(page);
  await draft(page, 'Uma vez'); backend.loseAcknowledgement = true;
  await page.locator('#save-task').click(); await expect(page.locator('#form-error')).toContainText('não foi confirmada');
  expect(rows(backend)).toHaveLength(1); await save(page); expect(rows(backend)).toHaveLength(1); expect(backend.writes).toHaveLength(1);
  await draft(page, 'Ainda não salva'); backend.failWrites = true; await page.locator('#save-task').click();
  await expect(page.locator('#form-error')).toBeVisible(); await expect(page.locator('#task-form [name="title"]')).toHaveValue('Ainda não salva');
  backend.failWrites = false; await save(page); expect(rows(backend)).toHaveLength(2);
});
test('Firebase: ETag rejeita edição concorrente e preserva a alteração do outro aparelho', async ({ page, context }) => {
  const backend = backendFixture(); await connectFixture(context, backend); await login(page); await draft(page, 'Inicial'); await save(page);
  await page.getByRole('button', { name: 'Editar atividade', exact: true }).click(); await page.locator('#task-form [name="title"]').fill('Edição antiga');
  backend.race = account => { account.data.version++; const row = Object.values(account.data.tasks)[0]; row.revision = account.data.version; row.payload.title = 'Outra alteração'; account.etag++; };
  await page.locator('#save-task').click(); await expect(page.locator('#form-error')).toContainText('Outra alteração');
  expect(rows(backend)[0].payload.title).toBe('Outra alteração');
});
test('Firebase: logout isola contas e sessão expirada é renovada', async ({ page, context }) => {
  const backend = backendFixture(); await connectFixture(context, backend); await login(page); await draft(page, 'Somente Ana'); await save(page);
  await page.evaluate(() => { const key = Object.keys(sessionStorage).find(k => k.startsWith('compasso-firebase-session:')); const value = JSON.parse(sessionStorage.getItem(key)); value.expiresAt = 1; sessionStorage.setItem(key, JSON.stringify(value)); });
  await page.reload(); await expect(page.locator('table .task-title')).toHaveText('Somente Ana');
  await page.getByRole('link', { name: 'Conta e nuvem', exact: true }).click(); await page.getByRole('button', { name: 'Sair da conta', exact: true }).click();
  await login(page, 'bia@example.test'); await expect(page.locator('[data-metric="active"]')).toHaveText('0'); await expect(page.getByText('Somente Ana')).toHaveCount(0);
});
test('Firebase: migração explícita preserva originais e restauração vazia funciona', async ({ page, context }) => {
  const backend = backendFixture(); await connectFixture(context, backend); await page.goto('/'); await draft(page, 'Origem local'); await save(page);
  const local = await page.evaluate(async () => (await import('/js/database.js')).localDatabase.all());
  await login(page); await page.getByRole('link', { name: 'Conta e nuvem', exact: true }).click();
  await page.getByRole('button', { name: 'Enviar atividades locais' }).click(); await page.locator('#confirm-dialog').getByRole('button', { name: 'Enviar para a nuvem', exact: true }).click();
  await expect.poll(() => rows(backend).length).toBe(1);
  expect(await page.evaluate(async () => (await import('/js/database.js')).localDatabase.all())).toEqual(local);
  await page.getByRole('link', { name: 'Backup e restauração', exact: true }).click();
  await page.locator('#backup-file').setInputFiles({ name: 'vazio.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'atividades-local', version: 1, tasks: [], settings: {} })) });
  await page.locator('#confirm-dialog').getByRole('button', { name: 'Substituir e restaurar' }).click(); await expect.poll(() => rows(backend).length).toBe(0);
});
test('Firebase: cadastro e recuperação usam endpoints do Firebase; falha de leitura não mostra base vazia', async ({ page, context }) => {
  const backend = backendFixture(); await connectFixture(context, backend); await page.goto('/#conta');
  await page.locator('.recovery-details summary').click(); const recovery = page.locator('[data-auth-form="recover"]'); await recovery.locator('[name="email"]').fill('ana@example.test'); await recovery.getByRole('button').click();
  await expect.poll(() => backend.recoveries.length).toBe(1);
  const signup = page.locator('[data-auth-form="signup"]'); await signup.locator('[name="email"]').fill('ana@example.test'); await signup.locator('[name="password"]').fill('Teste-seguro-123'); await signup.getByRole('button').click();
  await expect(page.locator('.account-summary')).toContainText('ana@example.test'); backend.failReads = true; await page.reload();
  await expect(page.getByRole('heading', { name: 'Não foi possível abrir seus dados' })).toBeVisible();
});

test('Firebase: exclusão usa revisão e importação desatualizada não apaga alterações novas', async ({ page, context }) => {
  const backend = backendFixture(); await connectFixture(context, backend); await login(page); await draft(page, 'Preservar'); await save(page);
  const result = await page.evaluate(async () => {
    const cloud = await import('/js/cloud.js'); const tasks = await cloud.cloudDatabase.all();
    await cloud.cloudDatabase.put({ ...tasks[0], title: 'Editada' });
    return cloud.cloudDatabase.all();
  });
  expect(result[0].title).toBe('Editada');
  // Another device updates the account after our last snapshot.
  const account = backend.account('ana@example.test'); account.data.version++; Object.values(account.data.tasks)[0].revision = account.data.version; account.etag++;
  const failure = await page.evaluate(async () => { try { await (await import('/js/cloud.js')).cloudDatabase.replace([]); } catch (error) { return error.message; } });
  expect(failure).toContain('Outra alteração'); expect(rows(backend)).toHaveLength(1);
  await page.evaluate(async () => { const { cloudDatabase } = await import('/js/cloud.js'); const tasks = await cloudDatabase.all(); await cloudDatabase.remove(tasks[0].id, tasks[0]._cloudRevision); });
  expect(rows(backend)).toHaveLength(0);
});

test('Firebase: ETag repete uma alteração independente sem perder a gravação concorrente', async ({ page, context }) => {
  const backend = backendFixture(); await connectFixture(context, backend); await login(page); await draft(page, 'Primeira'); await save(page);
  await page.getByRole('button', { name: 'Editar atividade', exact: true }).click(); await page.locator('#task-form [name="title"]').fill('Primeira editada');
  backend.race = account => {
    account.data.version++; account.etag++;
    const task = { ...Object.values(account.data.tasks)[0].payload, id: 'outra-atividade', title: 'Criada em outro aparelho' };
    const key = 't_' + Buffer.from(task.id).toString('base64url');
    account.data.tasks[key] = { payload: task, revision: account.data.version };
  };
  await save(page); expect(rows(backend)).toHaveLength(2);
  expect(rows(backend).map(row => row.payload.title).sort()).toEqual(['Criada em outro aparelho', 'Primeira editada']);
});
