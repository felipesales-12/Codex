import {
  cloud,
  configured,
  snapshot,
  events,
  allEvents,
  apply,
  watch,
} from "./stock-cloud.js";
import { catalog, purchaseList, materials } from "./inventory.js";
import { createTask, dateTimeLabel, duration, uniqueId } from "./tasks.js";
import { validateBackup, backupJSON, tasksCSV, download } from "./backup.js";
import * as views from "./stock-views.js";
import * as forms from "./stock-forms.js";
const $ = (s) => document.querySelector(s),
  root = $("#root"),
  dialog = $("#dialog");
let user = null,
  data = null,
  logs = [],
  stopWatch,
  live = false,
  error = "",
  loading = false,
  page = "dashboard",
  filters = {},
  toastTimer;
let modalHandler,
  pendingRequest = null,
  busy = false,
  generation = 0,
  refreshRunning = false,
  refreshAgain = false,
  modalOpener;
try {
  document.documentElement.dataset.theme =
    localStorage.getItem("compasso-theme") || "light";
} catch {}
function notify(message) {
  $("#toast").textContent = message;
  $("#toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("#toast").hidden = true), 6500);
}
function status() {
  const el = $("#sync");
  if (!el) return;
  el.textContent = !navigator.onLine
    ? "Sem conexão"
    : error
      ? "Falha na atualização"
      : loading
        ? "Atualizando…"
        : live
          ? "Sincronização em tempo real"
          : "Atualização periódica";
  el.classList.toggle("offline", !navigator.onLine || Boolean(error));
}
function render() {
  if (!user) {
    root.innerHTML = views.login(configured);
    return;
  }
  if (!$("#main") || !$(".app-shell")) root.innerHTML = views.shell(user, page);
  const main = $("#main");
  if (!data) {
    main.innerHTML = `<div class="loading" role="status">${error ? `<h1>Não foi possível abrir a operação</h1><p>${views.h(error)}</p>${views.btn("Tentar novamente", "refresh")}` : "Carregando estoque e atividades…"}</div>`;
    status();
    return;
  }
  const content = {
    dashboard: () => views.dashboard(data, logs),
    chapas: () => views.sheetsPage(data, filters),
    retalhos: () => views.scrapsPage(data, filters),
    atividades: () => views.tasksPage(data, filters),
    movimentacoes: () => views.logsPage(logs),
    backup: views.backupPage,
  };
  main.innerHTML =
    (error
      ? `<div class="notice warning" role="alert">${views.h(error)} ${views.btn("Atualizar", "refresh")}</div>`
      : "") + content[page]();
  status();
}
async function refresh() {
  if (!user) return;
  if (refreshRunning) {
    refreshAgain = true;
    return;
  }
  const version = generation;
  refreshRunning = true;
  loading = true;
  status();
  try {
    const [next, nextLogs] = await Promise.all([snapshot(), events()]);
    if (version !== generation) return;
    data = next;
    logs = nextLogs;
    error = "";
  } catch (e) {
    if (version === generation) {
      error = e.message;
      if (/não autorizado/i.test(e.message)) data = null;
    }
  } finally {
    refreshRunning = false;
    loading = false;
    if (version === generation) {
      // Keep in-progress filters intact when another device changes stock.
      const f = $("#filters");
      if (f) filters = { ...filters, ...Object.fromEntries(new FormData(f)) };
      render();
    }
    if (refreshAgain) {
      refreshAgain = false;
      void refresh();
    }
  }
}
function navigate() {
  page = Object.hasOwn(views.pages, location.hash.slice(1))
    ? location.hash.slice(1)
    : "dashboard";
  filters = {};
  if (user) {
    root.innerHTML = views.shell(user, page);
    render();
    $("#main").focus();
  }
}
async function sessionChanged(session) {
  const next = session?.user || null;
  if (next?.id === user?.id) return;
  generation++;
  stopWatch?.();
  data = null;
  logs = [];
  user = next;
  error = "";
  live = false;
  dialog.close();
  pendingRequest = null;
  root.innerHTML = "";
  navigate();
  render();
  if (user) {
    stopWatch = watch(refresh, (value) => {
      live = value;
      status();
    });
    await refresh();
  }
}
function open(title, body, handler, submit) {
  modalOpener = document.activeElement;
  modalHandler = handler;
  pendingRequest = null;
  dialog.innerHTML = forms.dialogContent(title, body, submit);
  dialog.showModal();
}
function close() {
  if (busy) return;
  if (pendingRequest) {
    notify(
      "Confirme o resultado reenviando a mesma operação antes de fechar esta janela.",
    );
    return;
  }
  dialog.close();
  modalHandler = null;
  modalOpener?.focus();
}
async function mutate(action, payload) {
  // An uncertain response must be retried with the EXACT request, even if inputs changed.
  if (!pendingRequest)
    pendingRequest = {
      p_request_id: uniqueId(),
      p_action: action,
      p_data: payload,
    };
  await apply(pendingRequest);
  pendingRequest = null;
}
function taskEdit(task, duplicate = false) {
  const original = duplicate ? null : task;
  open(
    duplicate
      ? "Duplicar atividade"
      : task
        ? "Editar atividade"
        : "Nova atividade",
    forms.taskForm(duplicate ? { ...task, status: "pending" } : task),
    async (values) => {
      const record = createTask(values, original);
      await mutate("task_save", {
        id: record.id,
        task: record,
        revision: original?._cloudRevision || 0,
      });
    },
    "Salvar atividade",
  );
}
function confirmTask(t, action) {
  const labels = {
    "task-start": "Iniciar",
    "task-complete": "Concluir",
    "task-restore": "Restaurar",
    "task-delete": "Excluir",
  };
  open(
    `${labels[action]} atividade`,
    `<p>${views.h(t.title)}</p><p>${action === "task-delete" ? "A atividade será removida da lista. Seu registro de auditoria será preservado." : "A alteração será compartilhada com a equipe."}</p>`,
    async () => {
      if (action === "task-delete")
        await mutate("task_delete", { id: t.id, revision: t._cloudRevision });
      else {
        const status = {
          "task-start": "progress",
          "task-complete": "completed",
          "task-restore": "pending",
        }[action];
        await mutate("task_save", {
          id: t.id,
          task: createTask({ ...t, status }, t),
          revision: t._cloudRevision,
        });
      }
    },
    labels[action],
  );
}
function importTasks(imported) {
  const revision = data.revision;
  open(
    "Importar atividades",
    `<p>Backup validado: <strong>${imported.tasks.length} atividades</strong>.</p>${views.select(
      "Como importar",
      "mode",
      [
        ["task_import", "Adicionar ausentes (preservar existentes)"],
        ["task_replace", "Substituir todas as atividades atuais"],
      ],
    )}<p>A substituição remove a lista atual e restaura a lista do arquivo. O estado anterior fica registrado na auditoria. Exporte um backup antes de continuar.</p><label class="checkbox"><input type="checkbox" required> Conferi o arquivo e confirmo a importação.</label>`,
    async (values) => {
      await mutate(values.mode, { tasks: imported.tasks, revision });
    },
    "Confirmar importação",
  );
}
async function action(name, id) {
  const sheet = data?.sheets.find((r) => r.id === id),
    scrap = data?.scraps.find((r) => r.id === id),
    task = data?.tasks.find((r) => r.id === id);
  if (name === "register") {
    if (!configured)
      return notify("Configure o Supabase antes do primeiro acesso.");
    open(
      "Criar meu acesso",
      `<p>Use o e-mail autorizado pelo administrador. O acesso ao estoque será liberado após confirmar seu endereço.</p>${views.field("E-mail de acesso", "email", "", "email", 'required autocomplete="username"')}${views.field("Criar senha", "password", "", "password", 'required minlength="10" autocomplete="new-password"')}${views.field("Repetir senha", "confirm", "", "password", 'required minlength="10" autocomplete="new-password"')}`,
      async (values) => {
        if (values.password !== values.confirm)
          throw new Error("As senhas precisam ser iguais.");
        const { error } = await cloud.auth.signUp({
          email: values.email.trim(),
          password: values.password,
          options: { emailRedirectTo: location.origin + location.pathname },
        });
        if (error)
          throw new Error(
            "Não foi possível cadastrar. Confira o endereço, use uma senha com pelo menos 10 caracteres e tente novamente.",
          );
        return "Confira a caixa de entrada, confirme seu e-mail e volte ao site para entrar. Se já possui conta, use sua senha atual.";
      },
      "Criar acesso e enviar confirmação",
    );
    return;
  }
  if (name === "close") {
    close();
    return;
  }
  if (name === "menu") {
    $(".sidebar").classList.toggle("open");
    return;
  }
  if (name === "theme") {
    const theme =
      document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("compasso-theme", theme);
    } catch {}
    return;
  }
  if (name === "logout") {
    const { error } = await cloud.auth.signOut({ scope: "local" });
    if (error) throw error;
    await sessionChanged(null);
    return;
  }
  if (name === "refresh") {
    await refresh();
    return;
  }
  if (!data) return;
  if (name === "clear-filters") {
    filters = {};
    render();
    return;
  }
  if (name === "copy-purchase") {
    const text = purchaseList(data.sheets);
    try {
      await navigator.clipboard.writeText(text);
      notify("Lista de compra copiada.");
    } catch {
      open(
        "Lista de compra",
        `<textarea class="wide" rows="15" readonly>${views.h(text)}</textarea>`,
        async () => {},
        "Fechar",
      );
    }
    return;
  }
  if (name.startsWith("sheet-")) {
    const mode =
      name === "sheet-edit" ? "edit" : name === "sheet-out" ? "out" : "in";
    open(
      mode === "edit" ? "Editar localização e dimensão" : "Movimentar chapa",
      forms.sheetForm(data.sheets, sheet, mode),
      async (values) => {
        if (mode === "edit")
          await mutate("sheet_edit", {
            id: sheet.id,
            revision: sheet.revision,
            dimensions: values.dimensions.trim(),
            location: values.location.trim(),
          });
        else
          await mutate("sheet_move", {
            id: values.id,
            delta: Number(values.quantity) * Number(values.direction),
            note: values.note.trim(),
          });
      },
    );
    return;
  }
  if (name === "scrap-new") {
    open(
      "Cadastrar retalho",
      forms.scrapForm(),
      async (values) => {
        await mutate("scrap_add", {
          ...values,
          catalog_id: `${values.material}-${values.thickness}`,
          quantity: Number(values.quantity),
          width: Number(values.width),
          length: Number(values.length),
        });
      },
      "Cadastrar retalho",
    );
    return;
  }
  if (name === "scrap-use") {
    open(
      "Utilizar retalho",
      forms.consumeForm(scrap),
      async (values) => {
        await mutate("scrap_consume", {
          id: scrap.id,
          revision: scrap.revision,
          quantity: Number(values.quantity),
          note: values.note,
          remainder: values.hasRemainder
            ? {
                width: Number(values.width),
                length: Number(values.length),
                code: values.code,
                notes: values.notes,
              }
            : null,
        });
      },
      "Confirmar consumo",
    );
    return;
  }
  if (name === "task-new") {
    taskEdit();
    return;
  }
  if (name === "task-edit" || name === "task-duplicate") {
    taskEdit(task, name === "task-duplicate");
    return;
  }
  if (
    ["task-start", "task-complete", "task-restore", "task-delete"].includes(
      name,
    )
  ) {
    confirmTask(task, name);
    return;
  }
  if (name === "task-view") {
    filters = { view: id, status: id === "completed" ? "" : id };
    render();
    return;
  }
  if (name === "task-detail") {
    open(
      "Detalhes da atividade",
      `<h3>${views.h(task.title)}</h3><dl class="details-grid">${Object.entries(
        {
          Solicitante: task.requester,
          Local: task.location,
          Descrição: task.description,
          Observações: task.notes,
          Cadastro: dateTimeLabel(task.createdAt),
          "Última alteração": dateTimeLabel(task.updatedAt),
          Conclusão: dateTimeLabel(task.completedAt),
          "Tempo decorrido": duration(task),
          Identificador: task.id,
        },
      )
        .map(
          ([k, v]) => `<div><dt>${k}</dt><dd>${views.h(v) || "—"}</dd></div>`,
        )
        .join("")}</dl>`,
      async () => {},
      "Fechar",
    );
    return;
  }
  if (name === "tasks-csv") {
    download(
      tasksCSV(
        data.tasks.filter((t) =>
          id === "completed"
            ? t.status === "completed"
            : t.status !== "completed",
        ),
      ),
      "atividades",
      "csv",
      "text/csv;charset=utf-8",
    );
    return;
  }
  if (name === "logs-more") {
    const older = await events(logs.at(-1)?.id);
    logs.push(...older);
    render();
    if (!older.length) notify("Você chegou ao início do histórico.");
    return;
  }
  if (name === "event-detail") {
    const e = logs.find((x) => String(x.id) === id);
    open(
      "Detalhes da movimentação",
      `<p>${views.h(e.actor_name)} · ${new Date(e.created_at).toLocaleString("pt-BR")}</p><h3>Antes</h3><pre>${views.h(JSON.stringify(e.before_data, null, 2))}</pre><h3>Depois</h3><pre>${views.h(JSON.stringify(e.after_data, null, 2))}</pre>`,
      async () => {},
      "Fechar",
    );
    return;
  }
  if (name === "export-tasks") {
    download(
      backupJSON(data.tasks, {}),
      "compasso-atividades",
      "json",
      "application/json",
    );
    return;
  }
  if (name === "export-all") {
    notify("Preparando arquivo com o histórico completo…");
    const latest = await snapshot(),
      audit = await allEvents();
    download(
      JSON.stringify(
        {
          format: "compasso-industrial",
          version: 2,
          exportedAt: new Date().toISOString(),
          ...latest,
          events: audit,
        },
        null,
        2,
      ),
      "compasso-completo",
      "json",
      "application/json",
    );
    return;
  }
  if (name === "import-local") {
    const { localDatabase } = await import("./database.js");
    const tasks = await localDatabase.all();
    if (!tasks.length) {
      notify("Não há atividades antigas neste navegador e endereço.");
      return;
    }
    importTasks(validateBackup(JSON.parse(backupJSON(tasks, {}))));
  }
}
document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (button && !busy)
    void action(button.dataset.action, button.dataset.id).catch((e) =>
      notify(e.message),
    );
});
document.addEventListener("submit", async (event) => {
  const form = event.target;
  event.preventDefault();
  if (form.getAttribute("id") === "filters") {
    const values = Object.fromEntries(new FormData(form));
    if (values.from && values.to && values.from > values.to) {
      notify("A data inicial deve ser anterior à data final.");
      return;
    }
    if (Boolean(values.width) !== Boolean(values.length)) {
      notify("Informe largura e comprimento para buscar aproveitamento.");
      return;
    }
    filters = { view: filters.view, status: filters.status, ...values };
    render();
    return;
  }
  if (busy) return;
  const values = Object.fromEntries(new FormData(form));
  busy = true;
  const submit =
    form.querySelector('[type="submit"]') || form.querySelector("button");
  submit.disabled = true;
  form.querySelector(".form-error").textContent = "";
  try {
    if (form.getAttribute("id") === "login-form") {
      const { error } = await cloud.auth.signInWithPassword({
        email: values.email.trim(),
        password: values.password,
      });
      if (error)
        throw new Error(
          "Não foi possível entrar. Verifique e-mail, senha e conexão.",
        );
    }
    if (form.getAttribute("id") === "operation-form") {
      let message = "Operação concluída.";
      if (pendingRequest) {
        await apply(pendingRequest);
        pendingRequest = null;
      } else message = (await modalHandler(values)) || message;
      busy = false;
      close();
      notify(message);
      await refresh();
    }
  } catch (e) {
    form.querySelector(".form-error").textContent =
      e.message +
      (pendingRequest
        ? " Se houve falha de conexão, mantenha esta janela e tente novamente. A mesma operação será consultada sem duplicação."
        : "");
    // Validation/revision errors are deterministic: allow correction with a new request.
    if (e.definitive) {
      pendingRequest = null;
      for (const el of form.querySelectorAll("input,select,textarea"))
        el.disabled = false;
    }
    if (pendingRequest) {
      for (const el of form.querySelectorAll("input,select,textarea"))
        el.disabled = true;
    }
  } finally {
    busy = false;
    submit.disabled = false;
  }
});
document.addEventListener("change", async (event) => {
  const el = event.target;
  if (
    el.name === "material" &&
    el.closest("#operation-form") &&
    dialog.querySelector('[name="thickness"]')
  )
    dialog.querySelector('[name="thickness"]').innerHTML = views.options(
      catalog[el.value].map((x) => [x, x]),
    );
  if (el.name === "hasRemainder") {
    const group = $("#remainder-fields");
    group.hidden = !el.checked;
    group.disabled = !el.checked;
  }
  if (el.id === "import-file" && el.files[0]) {
    try {
      if (el.files[0].size > 20 * 1024 * 1024)
        throw new Error("Arquivo maior que 20 MB.");
      const parsed = JSON.parse(await el.files[0].text());
      const payload =
        parsed.format === "compasso-industrial"
          ? {
              format: "atividades-local",
              version: 1,
              tasks: parsed.tasks,
              settings: {},
            }
          : parsed;
      importTasks(validateBackup(payload));
    } catch (e) {
      notify(e.message);
    }
    el.value = "";
  }
});
dialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  close();
});
window.addEventListener("hashchange", navigate);
window.addEventListener("offline", status);
window.addEventListener("online", status);
window.addEventListener("beforeunload", (event) => {
  if (busy || pendingRequest) {
    event.preventDefault();
    event.returnValue = "";
  }
});
// The old service worker must not keep serving the previous local-only UI.
if ("serviceWorker" in navigator)
  navigator.serviceWorker
    .getRegistrations()
    .then((rs) => Promise.all(rs.map((r) => r.unregister())))
    .catch(() => {});
render();
if (cloud) {
  cloud.auth.onAuthStateChange((_event, session) => {
    setTimeout(() => void sessionChanged(session), 0);
  });
  cloud.auth
    .getSession()
    .then(({ data }) => sessionChanged(data.session))
    .catch((e) => notify(e.message));
}
