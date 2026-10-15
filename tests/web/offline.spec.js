import { test, expect } from '@playwright/test';

async function add(page, title) {
  await page.getByRole('button', { name: 'Nova atividade', exact: true }).first().click();
  await page.locator('#task-form').getByLabel('Nome da atividade').fill(title);
  await page.locator('#task-form').getByLabel('Solicitante').fill('Equipe local');
  await page.locator('#task-form').getByLabel('Local de realização').fill('Produção');
  await page.getByRole('button', { name: 'Salvar atividade', exact: true }).click();
  await expect(page.locator('#task-dialog')).not.toBeVisible();
}

for (const path of ['/', '/Codex/']) {
  test(`frontend compilado em ${path}: recarga offline, cadastro, conclusão e persistência`, async ({ page, context }) => {
    const errors = [], external = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (new URL(request.url()).hostname !== 'localhost') external.push(request.url()); });
    await page.goto(path);
    await expect(page.locator('html')).toHaveAttribute('data-offline-ready', 'true');
    await expect(page.locator('[data-metric="active"]')).toHaveText('0');
    await add(page, 'Antes de desconectar');
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('table .task-title')).toHaveText('Antes de desconectar');
    await expect(page.locator('#connection-status')).toContainText('Sem conexão');
    await add(page, 'Cadastrada offline');
    await expect(page.locator('[data-metric="active"]')).toHaveText('2');
    await page.getByRole('button', { name: 'Concluir atividade' }).first().click();
    await page.getByRole('link', { name: 'Histórico de concluídas' }).click();
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await page.reload();
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await page.getByRole('link', { name: 'Configurações', exact: true }).click();
    await expect(page.getByText('Disponível offline', { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
    expect(external).toEqual([]);
  });
}

test('pacote web inclui manifesto e ícones, sem arquivos do servidor ou do repositório', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-offline-ready', 'true');
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest.start_url).toBe('./');
  expect(manifest.scope).toBe('./');
  for (const item of manifest.icons) {
    const response = await request.get(item.src);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('image/png');
  }
  for (const path of ['/.git/config', '/server.py', '/README.md', '/tests/app.spec.js', '/package.json']) {
    expect((await request.get(path)).status()).toBe(404);
  }
});
