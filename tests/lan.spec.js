import { test, expect } from '@playwright/test';
import { networkInterfaces } from 'node:os';

const address = process.env.LAN_TEST_IP || Object.values(networkInterfaces()).flat().find(entry => entry.family === 'IPv4' && !entry.internal)?.address;
if (!address) throw new Error('Os testes de rede local precisam de um endereço IPv4 não loopback.');
const lanURL = `http://${address}:8765`;

// Some cloud browsers force private IP requests through an egress proxy.
// This optional transport fetches the REAL local HTTP response through Playwright's
// request client, while preserving the LAN origin and its insecure-context rules.
async function useTestTransport(context) {
  if (process.env.LAN_BROWSER_TRANSPORT !== 'api') return;
  await context.route(`${lanURL}/**`, async route => {
    const response = await context.request.fetch(route.request());
    await route.fulfill({ response });
  });
}
test.beforeEach(async ({ context }, testInfo) => {
  await useTestTransport(context);
  if (process.env.LAN_BROWSER_TRANSPORT === 'api') testInfo.annotations.push({ type: 'transport', description: 'HTTP real via APIRequestContext; origem LAN preservada no navegador.' });
});

async function create(page, title) {
  await page.getByRole('button', { name: 'Nova atividade', exact: true }).first().click();
  const form = page.locator('#task-form');
  await form.getByLabel('Nome da atividade').fill(title);
  await form.getByLabel('Solicitante').fill('Equipe da rede');
  await form.getByLabel('Local de realização').fill('Oficina');
  await page.getByRole('button', { name: 'Salvar atividade', exact: true }).click();
  await expect(page.locator('#task-dialog')).not.toBeVisible();
}

test('HTTP pelo IP da rede: cadastro, edição, início, histórico e recarga em contexto não seguro', async ({ page }) => {
  const errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (new URL(request.url()).hostname !== address) external.push(request.url()); });
  await page.goto(lanURL);
  await expect(page.locator('[data-metric="active"]')).toHaveText('0');
  expect(await page.evaluate(() => isSecureContext)).toBe(false);
  expect(await page.evaluate(() => typeof crypto.randomUUID)).toBe('undefined');
  await create(page, 'Atividade via rede local');
  await expect(page.locator('[data-metric="active"]')).toHaveText('1');
  await page.getByRole('button', { name: 'Editar atividade', exact: true }).click();
  await page.locator('#task-form').getByLabel('Nome da atividade').fill('Editada pela rede');
  await page.getByRole('button', { name: 'Salvar atividade', exact: true }).click();
  await expect(page.locator('table .task-title')).toHaveText('Editada pela rede');
  await page.getByRole('button', { name: 'Iniciar atividade' }).click();
  await expect(page.locator('[data-metric="progress"]')).toHaveText('1');
  await page.getByRole('button', { name: 'Concluir atividade' }).click();
  await expect(page.locator('[data-metric="active"]')).toHaveText('0');
  await page.getByRole('link', { name: 'Histórico de concluídas' }).click();
  await expect(page.locator('table .task-title')).toHaveText('Editada pela rede');
  await page.reload();
  await expect(page.locator('table .task-title')).toHaveText('Editada pela rede');
  const task = await page.evaluate(async () => (await (await import('/js/database.js')).database.all())[0]);
  expect(task.id).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
  expect(task.completedAt).toBeTruthy();
  await page.getByRole('link', { name: 'Configurações', exact: true }).click();
  await expect(page.getByText('Acesso pela rede local', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test('navegadores e origens diferentes mantêm bases independentes', async ({ page, context, browser }) => {
  await page.goto(lanURL);
  await expect(page.locator('[data-metric="active"]')).toHaveText('0');
  await create(page, 'Registro do primeiro navegador');
  const localhost = await context.newPage();
  await localhost.goto('http://localhost:8765');
  await expect(localhost.locator('[data-metric="active"]')).toHaveText('0');
  const otherBrowser = await browser.newContext();
  try {
    await useTestTransport(otherBrowser);
    const other = await otherBrowser.newPage();
    await other.goto(lanURL);
    await expect(other.locator('[data-metric="active"]')).toHaveText('0');
  } finally { await otherBrowser.close(); }
  await page.reload();
  await expect(page.locator('table .task-title')).toHaveText('Registro do primeiro navegador');
});

test('servidor de rede entrega só arquivos da aplicação', async ({ request }) => {
  for (const path of ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/js/web.js', '/css/style.css']) {
    const response = await request.get(lanURL + path);
    expect(response.status(), path).toBe(200);
  }
  for (const path of ['/README.md', '/server.py', '/.git/config', '/package.json', '/tests/app.spec.js', '/css/../server.py']) {
    const response = await request.get(lanURL + path);
    expect(response.status(), path).toBe(404);
  }
});
