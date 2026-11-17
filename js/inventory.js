export const catalog = Object.freeze({
  carbono: [2, 3, 4.76, 6.35, 7.94, 9.35, 12.7, 19.05],
  inox: [1.5, 2, 3, 4, 5, 6],
});
export const materials = { carbono: "Aço Carbono", inox: "Aço Inox" };
export const criticalStock = (rows) => rows.filter((row) => row.quantity <= 2);
export const purchaseList = (rows) =>
  "SOLICITAÇÃO DE REPOSIÇÃO — CHAPAS\n" +
  criticalStock(rows)
    .map(
      (row) =>
        `• ${materials[row.material]} ${row.thickness} mm: ${row.quantity} chapas em estoque — solicitar reposição`,
    )
    .join("\n");
export function fitScraps(rows, width, length) {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(length) ||
    width <= 0 ||
    length <= 0
  )
    return [];
  return rows
    .filter(
      (r) =>
        r.quantity > 0 &&
        ((r.width >= width && r.length >= length) ||
          (r.length >= width && r.width >= length)),
    )
    .sort((a, b) => a.width * a.length - b.width * b.length);
}
