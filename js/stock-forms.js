import { h, field, select, options, btn } from "./stock-views.js";
import { catalog, materials } from "./inventory.js";
import { priorities, statuses } from "./tasks.js";

const text = (label, name, value = "") =>
  `<label class="full">${label}<textarea name="${name}" maxlength="20000" rows="3">${h(value)}</textarea></label>`;
export function sheetForm(rows, row, mode) {
  if (mode === "edit")
    return `<p>${materials[row.material]} · ${row.thickness} mm</p><div class="form-grid">${field("Dimensão padrão", "dimensions", row.dimensions, "text", 'maxlength="100" placeholder="3000 × 1500 mm"')}${field("Localização / prateleira", "location", row.location, "text", 'maxlength="140" placeholder="Ex.: A-01"')}</div>`;
  return `<div class="form-grid">${select(
    "Material / espessura",
    "id",
    rows.map((r) => [
      r.id,
      `${materials[r.material]} · ${r.thickness} mm (${r.quantity} chapas)`,
    ]),
    row?.id,
  )}${select(
    "Tipo de movimentação",
    "direction",
    [
      ["1", "Entrada"],
      ["-1", "Baixa por corte / saída"],
    ],
    mode === "out" ? "-1" : "1",
  )}${field("Quantidade de chapas", "quantity", 1, "number", 'required min="1" max="1000000" step="1"')}${text("Motivo / ordem de produção", "note")}</div><p class="section-note">Para registrar uma sobra do corte, cadastre o retalho na seção Retalhos após confirmar esta movimentação.</p>`;
}
export function scrapForm() {
  return `<div class="form-grid">${select("Material", "material", Object.entries(materials), "carbono")}${select(
    "Espessura (mm)",
    "thickness",
    catalog.carbono.map((x) => [x, x]),
    2,
  )}${field("Largura útil (mm)", "width", "", "number", 'required min="0.01" max="100000" step="any"')}${field("Comprimento útil (mm)", "length", "", "number", 'required min="0.01" max="100000" step="any"')}${field("Quantidade de peças iguais", "quantity", 1, "number", 'required min="1" max="1000000" step="1"')}${field("Código / identificação", "code", "", "text", 'required maxlength="100" placeholder="RET-001"')}${field("Localização / prateleira", "location", "", "text", 'maxlength="140"')}${text("Observações", "notes")}</div>`;
}
export function consumeForm(row) {
  return `<p><strong>${h(row.code)}</strong> · ${materials[row.material]} ${row.thickness} mm · ${row.width} × ${row.length} mm</p><p>${row.quantity} peças disponíveis. A sobra informada será gerada para cada peça consumida.</p>${field("Peças a utilizar", "quantity", 1, "number", `required min="1" max="${row.quantity}" step="1"`)}<label class="checkbox"><input type="checkbox" name="hasRemainder"> Gerar sub-retalho aproveitável</label><fieldset id="remainder-fields" hidden disabled><legend>Medidas da nova sobra</legend><div class="form-grid">${field("Nova largura (mm)", "width", "", "number", 'required min="0.01" max="100000" step="any"')}${field("Novo comprimento (mm)", "length", "", "number", 'required min="0.01" max="100000" step="any"')}${field("Código do sub-retalho", "code", row.code + "-S", "text", 'required maxlength="100"')}${text("Observações da sobra", "notes")}</div></fieldset>${text("Motivo / ordem de produção", "note")}`;
}
export function taskForm(task = {}) {
  return `<div class="form-grid"><div class="full">${field("Nome da atividade", "title", task.title, "text", 'required maxlength="160"')}</div>${field("Solicitante", "requester", task.requester, "text", 'required maxlength="140"')}${select(
    "Urgência",
    "priority",
    Object.entries(priorities).map(([k, v]) => [k, v.label]),
    task.priority || "medium",
  )}${field("Local de realização", "location", task.location, "text", 'required maxlength="140"')}${field("Data prevista", "dueDate", task.dueDate, "date")}${select("Status", "status", Object.entries(statuses), task.status || "pending")}${text("Descrição", "description", task.description)}${text("Observações", "notes", task.notes)}</div>`;
}
export function dialogContent(title, body, submit = "Confirmar e salvar") {
  return `<form id="operation-form"><div class="dialog-heading"><div><span class="eyebrow">COMPASSO · OPERAÇÃO</span><h2 id="dialog-title">${title}</h2></div>${btn("Fechar", "close", "", "icon-button", "close")}</div>${body}<p class="form-error" role="alert"></p><div class="dialog-footer">${btn("Cancelar", "close")}<button class="button primary" type="submit">${submit}</button></div></form>`;
}
