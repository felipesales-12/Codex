import { icon } from "./icons.js";
import { materials, criticalStock, fitScraps } from "./inventory.js";
import {
  priorities,
  statuses,
  selectTasks,
  getMetrics,
  dateLabel,
  dateTimeLabel,
  duration,
  isOverdue,
  normalize,
} from "./tasks.js";

export const h = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const btn = (label, action, id = "", style = "secondary", symbol = "") =>
  `<button type="button" class="button ${style}" data-action="${action}" data-id="${h(id)}" ${!label ? `aria-label="${h({ "sheet-edit": "Editar chapa", "task-edit": "Editar atividade", "task-duplicate": "Duplicar atividade", "task-delete": "Excluir atividade", menu: "Abrir ou fechar menu", theme: "Alternar tema" }[action] || action)}"` : ""}>${symbol ? icon(symbol) : ""}${label}</button>`;
export const options = (entries, value) =>
  entries
    .map(
      ([id, label]) =>
        `<option value="${h(id)}" ${String(id) === String(value) ? "selected" : ""}>${h(label)}</option>`,
    )
    .join("");
export const field = (label, name, value = "", type = "text", extra = "") =>
  `<label>${label}<input name="${name}" type="${type}" value="${h(value)}" ${extra}></label>`;
export const select = (label, name, entries, value = "") =>
  `<label>${label}<select name="${name}">${options(entries, value)}</select></label>`;
export const empty = (title, text) =>
  `<div class="empty">${icon("grid")}<h3>${title}</h3><p>${text}</p></div>`;
export const title = (eyebrow, name, description, action = "") =>
  `<div class="page-heading"><div><span class="eyebrow">${eyebrow}</span><h1>${name}</h1><p>${description}</p></div><div class="button-row">${action}</div></div>`;
export const pages = {
  dashboard: "Visão geral",
  chapas: "Chapas inteiras",
  retalhos: "Retalhos",
  atividades: "Atividades",
  movimentacoes: "Movimentações",
  backup: "Dados e backups",
};
export const actionLabels = {
  sheet_move: "Movimentação de chapas",
  sheet_edit: "Localização de chapa",
  scrap_add: "Cadastro de retalho",
  scrap_consume: "Consumo de retalho",
  task_save: "Atividade atualizada",
  task_delete: "Atividade excluída",
  task_import: "Atividades importadas",
  task_replace: "Atividades restauradas",
};

export function login(configured) {
  return `<div class="login"><section class="login-story"><a class="brand" href="#">${icon("grid")}<span>compasso<small>MATERIAIS & OPERAÇÕES</small></span></a><div class="login-copy"><span class="eyebrow">DO ALMOXARIFADO À PRODUÇÃO</span><h1>Cada chapa conta.<br>Cada sobra também.</h1><p>Estoque, aproveitamento e atividades.<br>Toda a operação, no mesmo compasso.</p><div class="sheet-art" aria-hidden="true"><div></div><div></div><div><span>MATÉRIA-PRIMA<br>→ POSSIBILIDADES</span></div></div></div><span class="login-foot">CONTROLE INDUSTRIAL · FEITO PARA A SUA ROTINA</span></section><main id="main" class="login-main"><div class="login-form"><span class="badge green">${icon("shield")} ACESSO À EQUIPE</span><h2>Bom ter você por aqui.</h2><p>Entre para acompanhar sua operação.</p>${!configured ? '<div class="notice warning"><strong>Configuração inicial necessária</strong><p>Preencha as variáveis do Supabase no arquivo .env e gere o build. Consulte o README do projeto.</p></div>' : ""}<form id="login-form">${field("E-mail", "email", "", "email", 'required autocomplete="username" placeholder="voce@empresa.com.br"')}${field("Senha", "password", "", "password", 'required autocomplete="current-password" minlength="6" placeholder="Sua senha"')}<button class="button primary wide" ${!configured ? "disabled" : ""}>Entrar no sistema ${icon("arrow")}</button><p class="form-error" role="alert"></p></form><div class="login-help">${btn("Primeiro acesso · Criar minha conta", "register", "", "subtle")}<p>Esqueceu sua senha? Solicite ajuda ao administrador.</p></div><div class="login-trust">${icon("cloud")} Dados compartilhados com segurança na nuvem</div></div><small class="login-legal">Compasso · Controle de chapas e retalhos</small></main></div>`;
}
export function shell(user, page) {
  const links = [
    ["dashboard", "grid"],
    ["chapas", "file"],
    ["retalhos", "grid"],
    ["atividades", "list"],
    ["movimentacoes", "history"],
  ];
  return `<aside class="sidebar">${btn("Fechar menu", "menu", "", "mobile-close icon-button", "close")}<a class="brand" href="#dashboard">${icon("grid")}<span>compasso<small>MATERIAIS & OPERAÇÕES</small></span></a><div class="workspace"><span class="workspace-mark">F</span><div>Chão de fábrica<small>PCP / Almoxarifado</small></div><span class="online-dot"></span></div><span class="nav-label">OPERAÇÃO</span><nav>${links.map(([key, symbol]) => `<a href="#${key}" ${page === key ? 'aria-current="page"' : ""}>${icon(symbol)}${pages[key]}${key === "chapas" ? '<span class="nav-counter">14</span>' : ""}</a>`).join("")}<span class="nav-label">GERENCIAR</span><a href="#backup" ${page === "backup" ? 'aria-current="page"' : ""}>${icon("backup")}Dados e backups</a></nav><div class="sidebar-bottom"><div class="reuse-note">${icon("grid")}<strong>Antes de cortar,<br>confira os retalhos.</strong><p>Menos desperdício.<br>Mais aproveitamento.</p><a href="#retalhos">Encontrar um retalho ${icon("arrow")}</a></div><small>COMPASSO <span>v2.0</span></small></div></aside><div class="app-shell"><header class="topbar"><div class="breadcrumb">${btn("", "menu", "", "icon-button", "menu")}<span>Minha operação</span>${icon("chevron")}<strong>${pages[page]}</strong></div><div class="top-tools"><span id="sync" class="sync" role="status">Conectando…</span>${btn("", "theme", "", "icon-button", "moon")}<span class="avatar" title="${h(user.email)}">${h(user.email?.slice(0, 2).toUpperCase())}</span>${btn("Sair", "logout", "", "subtle")}</div></header><main id="main" tabindex="-1"></main><footer class="app-footer"><span>${icon("shield")} Estoque e histórico na nuvem</span><span>Precisão em cada movimento.</span></footer></div>`;
}
function stockBadge(row) {
  return `<span class="badge ${row.quantity <= 2 ? "amber" : "green"}">${row.quantity === 0 ? "Sem estoque" : row.quantity <= 2 ? "Reposição" : "Disponível"}</span>`;
}
function sheetTable(rows) {
  return `<div class="table-scroll"><table><thead><tr><th>Material / Espessura</th><th>Dimensão padrão</th><th>Localização</th><th>Quantidade</th><th>Situação</th><th>Movimentar</th></tr></thead><tbody>${rows.map((r) => `<tr><td><div class="material-cell"><span class="material-symbol ${r.material}">${icon("file")}</span><span><strong>${materials[r.material]}</strong><small>${r.thickness} mm</small></span></div></td><td>${h(r.dimensions) || "Não informada"}</td><td>${h(r.location) || "Não informada"}</td><td><strong class="quantity">${r.quantity}</strong><small> chapas</small></td><td>${stockBadge(r)}</td><td><div class="row-actions">${btn("+ Entrada", "sheet-in", r.id, "small")}${btn("− Baixa", "sheet-out", r.id, "small")}${btn("", "sheet-edit", r.id, "icon-button", "edit")}</div></td></tr>`).join("")}</tbody></table></div>`;
}
export function dashboard(data, logs) {
  const low = criticalStock(data.sheets),
    scraps = data.scraps.filter((r) => r.quantity > 0),
    metrics = getMetrics(data.tasks);
  const count = (m) =>
    data.sheets
      .filter((r) => r.material === m)
      .reduce((a, b) => a + b.quantity, 0);
  return `${title("PAINEL DA OPERAÇÃO", "Visão geral", "Seu estoque em dia. Sua produção em movimento.", btn("Cadastrar retalho", "scrap-new", "", "secondary", "plus") + btn("Movimentar chapa", "sheet-new", "", "primary", "plus"))}
    ${low.length ? `<section class="purchase-banner" aria-label="Avisos de reposição"><div class="alert-icon">${icon("alert")}</div><div><h2>${low.length} materiais precisam de reposição</h2><p>Estoque mínimo atingido: 2 chapas ou menos. Solicite a compra.</p><details><summary>Ver materiais e espessuras</summary><ul>${low.map((r) => `<li>${materials[r.material]} ${r.thickness} mm atingiu ${r.quantity} chapas — Solicitar reposição</li>`).join("")}</ul></details></div>${btn("Copiar lista de compra", "copy-purchase", "", "amber-button", "copy")}</section>` : `<div class="notice success">${icon("circleCheck")} Todos os materiais estão acima do estoque mínimo.</div>`}
    <section class="metrics-grid" aria-label="Resumo do estoque">${[
      [
        count("carbono"),
        "Chapas de aço carbono",
        "8 espessuras cadastradas",
        "file",
      ],
      [count("inox"), "Chapas de aço inox", "6 espessuras cadastradas", "file"],
      [
        scraps.length,
        "Retalhos cadastrados",
        scraps.reduce((a, b) => a + b.quantity, 0) + " peças disponíveis",
        "grid",
      ],
      [
        low.length,
        "Alertas ativos",
        "Materiais com 2 chapas ou menos",
        "alert",
      ],
    ]
      .map(
        ([n, label, hint, symbol]) =>
          `<article class="metric"><div><span>${label}</span>${icon(symbol)}</div><strong>${n}</strong><small>${hint}</small></article>`,
      )
      .join("")}</section>
    <div class="dashboard-grid"><section class="panel"><div class="panel-heading"><div><h2>Estoque por material</h2><p>Uma visão rápida das chapas disponíveis.</p></div><a href="#chapas">Ver estoque ${icon("arrow")}</a></div><div class="stock-overview">${[
      "carbono",
      "inox",
    ]
      .map(
        (m) =>
          `<div><div class="overview-title"><span class="material-symbol ${m}">${icon("file")}</span><strong>${materials[m]}</strong><span>${count(m)} <small>chapas</small></span></div><div class="thickness-grid">${data.sheets
            .filter((r) => r.material === m)
            .map(
              (r) =>
                `<button data-action="sheet-in" data-id="${r.id}" class="thickness ${r.quantity <= 2 ? "low" : ""}" title="Entrada de ${materials[m]} ${r.thickness} mm"><span>${r.thickness} <small>mm</small></span><strong>${r.quantity}</strong></button>`,
            )
            .join("")}</div></div>`,
      )
      .join(
        "",
      )}</div><div class="panel-note"><span class="legend-dot"></span> Quantidades em destaque estão no limite de reposição.</div></section><section class="reuse-panel"><span class="eyebrow">APROVEITAMENTO INTELIGENTE</span><div class="cut-art" aria-hidden="true"><div></div><div></div><div></div></div><h2>A próxima peça pode<br>estar numa sobra.</h2><p>Informe as medidas do corte e encontre retalhos compatíveis em estoque.</p><a class="button primary" href="#retalhos">Buscar retalhos ${icon("arrow")}</a><small>${scraps.length} lotes disponíveis para consulta</small></section></div>
    <div class="dashboard-grid"><section class="panel"><div class="panel-heading"><div><h2>Últimas movimentações</h2><p>Cada alteração deixa um registro.</p></div><a href="#movimentacoes">Ver histórico ${icon("arrow")}</a></div>${eventList(logs.slice(0, 4))}</section><section class="panel"><div class="panel-heading"><div><h2>Atividades da equipe</h2><p>O trabalho continua por aqui.</p></div></div><div class="task-summary"><div><strong>${metrics.pending}</strong><span>Pendentes</span></div><div><strong>${metrics.progress}</strong><span>Em andamento</span></div><div><strong>${metrics.overdue}</strong><span>Atrasadas</span></div></div><a class="panel-link" href="#atividades">Acompanhar atividades ${icon("arrow")}</a></section></div>`;
}
export function sheetsPage(data, f) {
  const rows = data.sheets.filter(
    (r) =>
      (!f.material || r.material === f.material) &&
      (!f.critical || r.quantity <= 2) &&
      normalize(
        `${materials[r.material]} ${r.thickness} ${r.location}`,
      ).includes(normalize(f.search || "")),
  );
  return (
    title(
      "MATÉRIA-PRIMA",
      "Chapas inteiras",
      "Entradas, baixas e localização das 14 combinações do seu estoque.",
      btn("Movimentar chapa", "sheet-new", "", "primary", "plus"),
    ) +
    `<section class="panel"><form class="filters" id="filters">${field("Pesquisar", "search", f.search, "search", 'placeholder="Material, espessura ou local"')}${select("Material", "material", [["", "Todos os materiais"], ...Object.entries(materials)], f.material)}<label class="checkbox"><input type="checkbox" name="critical" ${f.critical ? "checked" : ""}> Apenas reposição (≤ 2)</label><button class="button secondary">Filtrar</button></form>${rows.length ? sheetTable(rows) : empty("Nenhuma chapa encontrada", "Ajuste os filtros para consultar o estoque.")}</section>`
  );
}
export function scrapsPage(data, f) {
  const base = data.scraps.filter(
    (r) =>
      (f.consumed || r.quantity > 0) &&
      (!f.material || r.material === f.material) &&
      (!f.thickness || Number(f.thickness) === r.thickness) &&
      normalize(`${r.code} ${r.location} ${r.notes}`).includes(
        normalize(f.search || ""),
      ),
  );
  const fit = Boolean(f.width && f.length),
    rows = fit ? fitScraps(base, Number(f.width), Number(f.length)) : base;
  return (
    title(
      "SOBRAS QUE VIRAM VALOR",
      "Retalhos",
      "Encontre a peça certa antes de usar uma chapa inteira.",
      btn("Cadastrar retalho", "scrap-new", "", "primary", "plus"),
    ) +
    `<section class="panel"><form id="filters"><div class="fit-search"><div>${icon("search")}<h2>Buscar aproveitamento</h2><p>Medidas mínimas do corte</p></div>${field("Largura (mm)", "width", f.width, "number", 'min="0.01" max="100000" step="any" placeholder="Ex.: 300"')}${field("Comprimento (mm)", "length", f.length, "number", 'min="0.01" max="100000" step="any" placeholder="Ex.: 500"')}<button class="button primary">Encontrar retalhos</button></div><div class="filters">${field("Código, local ou observação", "search", f.search, "search")}${select("Material", "material", [["", "Todos"], ...Object.entries(materials)], f.material)}${field("Espessura (mm)", "thickness", f.thickness, "number", 'step="any" min="0.01"')}<label class="checkbox"><input name="consumed" type="checkbox" ${f.consumed ? "checked" : ""}> Incluir consumidos</label>${btn("Limpar", "clear-filters")}</div></form><div class="results-heading"><strong>${rows.length} retalhos ${fit ? "compatíveis" : "encontrados"}</strong><span>${fit ? "Rotação de 90° incluída · menor área primeiro" : "Dimensões em milímetros"}</span></div>${rows.length ? `<div class="table-scroll"><table><thead><tr><th>Código / Local</th><th>Material</th><th>Medidas úteis</th><th>Peças</th><th>Observações</th><th>Ação</th></tr></thead><tbody>${rows.map((r) => `<tr class="${fit ? "compatible" : ""}"><td><strong>${h(r.code)}</strong><small>${h(r.location) || "Sem localização"}</small></td><td>${materials[r.material]}<small>${r.thickness} mm</small></td><td><strong>${r.width} × ${r.length}</strong><small>${fit ? "✓ Compatível com o corte" : "mm"}</small></td><td>${r.quantity}</td><td class="notes-cell">${h(r.notes) || "—"}</td><td>${r.quantity ? btn("Utilizar / gerar sobra", "scrap-use", r.id, "small") : '<span class="badge">Consumido</span>'}</td></tr>`).join("")}</tbody></table></div>` : empty(fit ? "Nenhum retalho compatível" : "Nenhum retalho encontrado", fit ? "Confira outras medidas ou consulte o estoque de chapas." : "Cadastre as sobras aproveitáveis para começar.")}</section><p class="section-note">Considere o retângulo útil do material. Confira furos, formato irregular, sentido de acabamento e folga do corte antes de utilizar.</p>`
  );
}
export function tasksPage(data, f) {
  const history = f.view === "completed";
  const rows = selectTasks(data.tasks, f, history);
  const m = getMetrics(data.tasks);
  return (
    title(
      "GESTÃO DO DIA A DIA",
      "Atividades",
      "Organize prioridades, acompanhe prazos e preserve cada entrega.",
      btn("Nova atividade", "task-new", "", "primary", "plus"),
    ) +
    `<div class="task-tabs">${[
      ["", "Ativas", m.active],
      ["pending", "Pendentes", m.pending],
      ["progress", "Em andamento", m.progress],
      ["completed", "Histórico de concluídas", m.completed],
    ]
      .map(
        ([v, label, n]) =>
          `<button data-action="task-view" data-id="${v}" class="${(f.view || "") === v ? "selected" : ""}">${label}<span>${n}</span></button>`,
      )
      .join(
        "",
      )}</div><section class="panel"><form id="filters" class="filters task-filters">${field("Pesquisar atividades", "search", f.search, "search", 'placeholder="Nome, local, descrição…"')}${select("Urgência", "priority", [["", "Todas"], ...Object.entries(priorities).map(([k, v]) => [k, v.label])], f.priority)}${select("Solicitante", "requester", [["", "Todos"], ...[...new Set(data.tasks.map((t) => t.requester))].map((x) => [x, x])], f.requester)}${field(history ? "Conclusão de" : "Cadastro de", "from", f.from, "date")}${field("Até", "to", f.to, "date")}${select(
      "Ordenação",
      "sort",
      [
        ["priority", "Prioridade e atraso"],
        ["recent", "Mais recentes"],
        ["oldest", "Mais antigas"],
        ["due", "Prazo"],
        ["completed", "Conclusão"],
      ],
      f.sort,
    )}<button class="button secondary">Filtrar</button>${btn("Limpar", "clear-filters")}</form><div class="results-heading"><strong>${rows.length} atividades</strong>${btn("Exportar CSV", "tasks-csv", history ? "completed" : "active", "subtle", "download")}</div>${rows.length ? `<div class="table-scroll"><table><thead><tr><th>Atividade / Solicitante</th><th>Urgência</th><th>Local</th><th>${history ? "Conclusão" : "Prazo"}</th><th>Status</th><th>Ações</th></tr></thead><tbody>${rows.map((t) => `<tr><td><button class="text-button" data-action="task-detail" data-id="${h(t.id)}">${h(t.title)}</button><small>${h(t.requester)}</small></td><td><span class="badge ${priorities[t.priority].color}">${priorities[t.priority].label}</span></td><td>${h(t.location)}</td><td>${history ? dateTimeLabel(t.completedAt) : dateLabel(t.dueDate)}<small class="${isOverdue(t) ? "danger" : ""}">${history ? duration(t) : isOverdue(t) ? "Prazo vencido" : ""}</small></td><td><span class="badge">${statuses[t.status]}</span></td><td><div class="row-actions">${t.status === "pending" ? btn("Iniciar", "task-start", t.id, "small") : ""}${btn(history ? "Restaurar" : "Concluir", history ? "task-restore" : "task-complete", t.id, "small")}${btn("", "task-edit", t.id, "icon-button", "edit")}${btn("", "task-duplicate", t.id, "icon-button", "copy")}${btn("", "task-delete", t.id, "icon-button", "trash")}</div></td></tr>`).join("")}</tbody></table></div>` : empty("Nenhuma atividade nesta lista", "Crie uma atividade ou ajuste os filtros.")}</section>`
  );
}
export function eventList(rows) {
  return rows.length
    ? `<ul class="event-list">${rows.map((e) => `<li><span class="event-icon">${icon(e.action.startsWith("task") ? "list" : "history")}</span><div><strong>${h(actionLabels[e.action] || e.action)}</strong><p>${h(e.after_data?.code || e.before_data?.code || e.after_data?.title || e.before_data?.title || e.entity)}${e.action === "sheet_move" ? ` · ${e.before_data.quantity} → ${e.after_data.quantity} chapas` : ""}</p><small>${h(e.actor_name)} · ${new Date(e.created_at).toLocaleString("pt-BR")}</small>${e.note ? `<p>${h(e.note)}</p>` : ""}</div>${btn("Detalhes", "event-detail", e.id, "subtle")}</li>`).join("")}</ul>`
    : empty(
        "O histórico começa com você",
        "As movimentações aparecerão aqui após a primeira operação.",
      );
}
export function logsPage(logs) {
  return (
    title(
      "RASTREABILIDADE",
      "Movimentações",
      "Quem fez, quando fez e o que mudou. Registros permanentes da operação.",
    ) +
    `<section class="panel">${eventList(logs)}<div class="panel-actions">${btn("Carregar registros anteriores", "logs-more", "", "secondary", "history")}</div></section>`
  );
}
export function backupPage() {
  return (
    title(
      "SEUS DADOS, PRESERVADOS",
      "Dados e backups",
      "Exporte seus registros e traga as atividades do Compasso anterior.",
    ) +
    `<div class="backup-grid"><section class="panel padded"><span class="feature-icon">${icon("download")}</span><h2>Exportar dados</h2><p>Baixe chapas, retalhos, atividades e todo o histórico de movimentações em JSON para conferência e arquivo.</p>${btn("Exportar arquivo completo", "export-all", "", "primary", "download")}<hr><p>O backup de atividades mantém o formato compatível com o Compasso original.</p>${btn("Backup de atividades", "export-tasks", "", "secondary", "download")}</section><section class="panel padded"><span class="feature-icon">${icon("backup")}</span><h2>Importar atividades</h2><p>Selecione um backup JSON do Compasso. Você poderá adicionar atividades ausentes ou restaurar a lista, com confirmação.</p><label class="file-drop">Selecionar backup JSON<input type="file" id="import-file" accept=".json,application/json"></label><p class="section-note">O estoque e o histórico de movimentações são preservados. Limite: 20 MB / 50.000 atividades.</p>${btn("Buscar atividades deste navegador", "import-local", "", "secondary", "search")}<p class="section-note">Para dados antigos na nuvem, exporte o backup pela versão anterior antes de migrar.</p></section></div><section class="notice"><div><strong>Armazenamento compartilhado</strong><p>As alterações são confirmadas após a gravação no banco. Se a conexão cair, mantenha o formulário aberto e tente novamente. O tema é uma preferência deste navegador.</p></div></section>`
  );
}
