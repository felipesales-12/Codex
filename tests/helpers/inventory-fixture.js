import { catalog } from "../../js/inventory.js";
export async function fixture(context) {
  const user = {
    id: "11111111-1111-4111-8111-111111111111",
    email: "operador@fabrica.test",
    aud: "authenticated",
    role: "authenticated",
  };
  const jwt =
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url",
    ) +
    "." +
    Buffer.from(
      JSON.stringify({
        sub: user.id,
        exp: Math.floor(Date.now() / 1000) + 3600,
        role: "authenticated",
        email: user.email,
      }),
    ).toString("base64url") +
    ".fixture";
  const token = {
    access_token: jwt,
    refresh_token: "test-refresh",
    expires_in: 3600,
    token_type: "bearer",
    user,
  };
  const state = {
    revision: 1,
    sheets: Object.entries(catalog).flatMap(([material, values]) =>
      values.map((thickness, i) => ({
        id: `${material}-${thickness}`,
        material,
        thickness,
        quantity: [8, 5, 2, 12, 6, 1, 4, 0][i] ?? 6,
        dimensions: "3000 × 1500 mm",
        location: "A-" + (i + 1),
        revision: 1,
      })),
    ),
    scraps: [],
    tasks: [],
  };
  const events = [],
    requests = new Map(),
    sockets = [];
  let failAfterCommit = false;
  const broadcast = () =>
    sockets.forEach((ws) =>
      ws.send(
        JSON.stringify([
          null,
          null,
          "realtime:factory-stock",
          "postgres_changes",
          {
            ids: [1],
            data: {
              schema: "public",
              table: "inventory_state",
              columns: [
                { name: "id", type: "bool" },
                { name: "revision", type: "int8" },
              ],
              type: "UPDATE",
              commit_timestamp: new Date().toISOString(),
              record: { id: true, revision: state.revision },
              old_record: {},
            },
          },
        ]),
      ),
    );
  await context.routeWebSocket("wss://inventory-test.supabase.co/**", (ws) => {
    sockets.push(ws);
    ws.onMessage((raw) => {
      const [joinRef, ref, topic, event] = JSON.parse(raw);
      if (event === "phx_join")
        ws.send(
          JSON.stringify([
            joinRef,
            ref,
            topic,
            "phx_reply",
            {
              status: "ok",
              response: {
                postgres_changes: [
                  {
                    id: 1,
                    event: "UPDATE",
                    schema: "public",
                    table: "inventory_state",
                  },
                ],
              },
            },
          ]),
        );
      if (event === "heartbeat")
        ws.send(
          JSON.stringify([
            joinRef,
            ref,
            topic,
            "phx_reply",
            { status: "ok", response: {} },
          ]),
        );
    });
  });
  await context.route(
    "https://inventory-test.supabase.co/**",
    async (route) => {
      const req = route.request(),
        path = new URL(req.url()).pathname;
      const json = (data, status = 200) =>
        route.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify(data),
        });
      if (path.endsWith("/token")) return json(token);
      if (path.endsWith("/user")) return json(user);
      if (path.endsWith("/logout")) return json({});
      if (path.endsWith("/inventory_snapshot")) return json(state);
      if (path.endsWith("/inventory_events")) return json(events);
      if (path.endsWith("/inventory_apply")) {
        const body = req.postDataJSON(),
          d = body.p_data;
        if (!requests.has(body.p_request_id)) {
          requests.set(body.p_request_id, body);
          const before = structuredClone(state);
          if (body.p_action === "sheet_move")
            state.sheets.find((x) => x.id === d.id).quantity += d.delta;
          if (body.p_action === "sheet_edit")
            Object.assign(
              state.sheets.find((x) => x.id === d.id),
              { location: d.location, dimensions: d.dimensions },
            );
          if (body.p_action === "scrap_add") {
            const sheet = state.sheets.find((x) => x.id === d.catalog_id);
            state.scraps.unshift({
              ...d,
              id: crypto.randomUUID(),
              material: sheet.material,
              thickness: sheet.thickness,
              revision: 1,
            });
          }
          if (body.p_action === "scrap_consume") {
            const r = state.scraps.find((x) => x.id === d.id);
            r.quantity -= d.quantity;
            r.revision++;
            if (d.remainder)
              state.scraps.unshift({
                ...r,
                ...d.remainder,
                id: crypto.randomUUID(),
                quantity: d.quantity,
                revision: 1,
              });
          }
          if (body.p_action === "task_save") {
            const index = state.tasks.findIndex((t) => t.id === d.id);
            const t = { ...d.task, _cloudRevision: d.revision + 1 };
            if (index < 0) state.tasks.push(t);
            else state.tasks[index] = t;
          }
          if (body.p_action === "task_delete")
            state.tasks = state.tasks.filter((t) => t.id !== d.id);
          if (body.p_action === "task_replace")
            state.tasks = d.tasks.map((t) => ({ ...t, _cloudRevision: 1 }));
          if (body.p_action === "task_import")
            state.tasks.push(
              ...d.tasks
                .filter((t) => !state.tasks.some((x) => x.id === t.id))
                .map((t) => ({ ...t, _cloudRevision: 1 })),
            );
          state.revision++;
          events.unshift({
            id: state.revision,
            actor_name: "Operador de teste",
            action: body.p_action,
            entity: d.id || d.code || "backup",
            created_at: new Date().toISOString(),
            note: d.note || "",
            before_data:
              body.p_action === "sheet_move"
                ? before.sheets.find((x) => x.id === d.id)
                : null,
            after_data:
              body.p_action === "sheet_move"
                ? state.sheets.find((x) => x.id === d.id)
                : d,
          });
          broadcast();
          if (failAfterCommit) {
            failAfterCommit = false;
            return route.abort("failed");
          }
        }
        return json({ confirmed: true });
      }
      return json({ message: "Unexpected fixture request " + path }, 404);
    },
  );
  return {
    state,
    events,
    requests,
    broadcast,
    loseNextResponse() {
      failAfterCommit = true;
    },
  };
}
export async function login(page) {
  await page.goto("/Codex/");
  await page
    .getByLabel("E-mail", { exact: true })
    .fill("operador@fabrica.test");
  await page.getByLabel("Senha", { exact: true }).fill("senha-de-teste");
  await page.getByRole("button", { name: "Entrar no sistema" }).click();
  await page
    .getByRole("heading", { name: "Visão geral", exact: true })
    .waitFor();
}
