import { test, expect } from "@playwright/test";
import { fixture, login } from "./helpers/inventory-fixture.js";
test("primeiro acesso exige confirmação de senha e orienta confirmação de e-mail", async ({
  page,
  context,
}) => {
  await fixture(context);
  await page.goto("/Codex/");
  await page
    .getByRole("button", { name: "Primeiro acesso · Criar minha conta" })
    .click();
  await page.getByLabel("E-mail de acesso").fill("operador@fabrica.test");
  await page
    .getByLabel("Criar senha", { exact: true })
    .fill("uma-senha-de-teste");
  await page.getByLabel("Repetir senha").fill("outra-senha-de-teste");
  await page
    .getByRole("button", { name: "Criar acesso e enviar confirmação" })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "As senhas precisam ser iguais",
  );
  await page.getByLabel("Repetir senha").fill("uma-senha-de-teste");
  await page
    .getByRole("button", { name: "Criar acesso e enviar confirmação" })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator("#toast")).toContainText("confirme seu e-mail");
  await expect(
    page.getByRole("heading", { name: "Bom ter você por aqui." }),
  ).toBeVisible();
});
test("login obrigatório, painel, alerta e logout; responsividade sem rolagem lateral", async ({
  page,
  context,
}) => {
  await fixture(context);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/Codex/#chapas");
  await expect(
    page.getByRole("heading", { name: "Bom ter você por aqui." }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/login-desktop.png",
    fullPage: true,
  });
  await login(page);
  await expect(
    page.getByText("Sincronização em tempo real", { exact: true }),
  ).toBeVisible();
  await page.getByText("Ver materiais e espessuras").click();
  await expect(
    page.getByText(
      "Aço Carbono 4.76 mm atingiu 2 chapas — Solicitar reposição",
    ),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/dashboard-desktop.png",
    fullPage: true,
  });
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/dashboard-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Bom ter você por aqui." }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("entrada com resposta perdida é repetida sem duplicação; atualização remota chega automaticamente", async ({
  page,
  context,
}) => {
  const f = await fixture(context);
  await login(page);
  const initial = f.state.sheets[0].quantity;
  await page
    .getByRole("button", { name: "Movimentar chapa", exact: true })
    .click();
  await page.getByLabel("Quantidade de chapas").fill("3");
  f.loseNextResponse();
  await page.getByRole("button", { name: "Confirmar e salvar" }).click();
  await expect(page.locator(".form-error")).toContainText("mesma operação");
  await expect(page.getByLabel("Quantidade de chapas")).toBeDisabled();
  await page.getByRole("button", { name: "Confirmar e salvar" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(f.state.sheets[0].quantity).toBe(initial + 3);
  expect(f.requests.size).toBe(1);
  f.state.sheets[0].quantity = 47;
  f.broadcast();
  await expect(page.locator(".thickness").first()).toContainText("47");
});
test("retalho, busca com rotação e consumo parcial com sub-retalho", async ({
  page,
  context,
}) => {
  const f = await fixture(context);
  await login(page);
  await page
    .getByRole("button", { name: "Cadastrar retalho", exact: true })
    .click();
  await page.getByLabel("Largura útil (mm)").fill("300");
  await page.getByLabel("Comprimento útil (mm)").fill("500");
  await page.getByLabel("Código / identificação").fill("RET-001");
  await page.getByLabel("Quantidade de peças iguais").fill("2");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cadastrar retalho" })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("link", { name: "Retalhos", exact: true }).click();
  await page.getByLabel("Largura (mm)", { exact: true }).fill("400");
  await page.getByLabel("Comprimento (mm)", { exact: true }).fill("200");
  await page.getByRole("button", { name: "Encontrar retalhos" }).click();
  await expect(page.getByText("1 retalhos compatíveis")).toBeVisible();
  await page.getByRole("button", { name: "Utilizar / gerar sobra" }).click();
  await page.getByLabel("Gerar sub-retalho aproveitável").check();
  await page.getByLabel("Nova largura (mm)").fill("100");
  await page.getByLabel("Novo comprimento (mm)").fill("200");
  await page.getByRole("button", { name: "Confirmar consumo" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(f.state.scraps).toHaveLength(2);
  expect(f.state.scraps.every((r) => r.quantity === 1)).toBe(true);
});
test("atividades preservam criação, edição, duplicação, conclusão, restauração, CSV e backup", async ({
  page,
  context,
}) => {
  const f = await fixture(context);
  await login(page);
  await page.getByRole("link", { name: "Atividades", exact: true }).click();
  await page.getByRole("button", { name: "Nova atividade" }).click();
  await page.getByLabel("Nome da atividade").fill("Inspeção da guilhotina");
  await page.getByLabel("Solicitante").last().fill("José");
  await page.getByLabel("Local de realização").fill("Corte");
  await page
    .getByLabel("Descrição", { exact: true })
    .fill("<script>alert(1)</script>");
  await page.getByRole("button", { name: "Salvar atividade" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page
    .getByRole("button", { name: "Duplicar atividade", exact: true })
    .click();
  await page.getByLabel("Nome da atividade").fill("Inspeção duplicada");
  await page.getByRole("button", { name: "Salvar atividade" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(f.state.tasks).toHaveLength(2);
  await page
    .getByRole("button", { name: "Concluir", exact: true })
    .first()
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Concluir", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: /Histórico de concluídas/ }).click();
  await expect(
    page.getByRole("button", { name: "Restaurar", exact: true }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar CSV" }).click();
  expect((await download).suggestedFilename()).toMatch(/\.csv$/);
  await page.getByRole("button", { name: "Restaurar", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Restaurar", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(f.state.tasks.every((t) => t.status !== "completed")).toBe(true);
  await page.getByRole("link", { name: "Dados e backups" }).click();
  const backup = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Backup de atividades", exact: true })
    .click();
  expect((await backup).suggestedFilename()).toMatch(/\.json$/);
});
