import { test } from "node:test";
import assert from "node:assert/strict";
import {
  catalog,
  criticalStock,
  purchaseList,
  fitScraps,
} from "../js/inventory.js";

test("catálogo contém exatamente as 14 combinações solicitadas", () => {
  assert.deepEqual(
    catalog.carbono,
    [2, 3, 4.76, 6.35, 7.94, 9.35, 12.7, 19.05],
  );
  assert.deepEqual(catalog.inox, [1.5, 2, 3, 4, 5, 6]);
});
test("alerta inclui zero e dois, mas não três", () => {
  const rows = [0, 1, 2, 3].map((quantity) => ({
    material: "carbono",
    thickness: 4.76,
    quantity,
  }));
  assert.deepEqual(
    criticalStock(rows).map((x) => x.quantity),
    [0, 1, 2],
  );
  assert.match(purchaseList(rows), /Aço Carbono 4.76 mm: 2 chapas/);
});
test("busca aceita rotação, ordena menor área e exclui consumidos", () => {
  const rows = [
    { id: "a", width: 400, length: 600, quantity: 1 },
    { id: "b", width: 300, length: 200, quantity: 2 },
    { id: "c", width: 300, length: 200, quantity: 0 },
  ];
  assert.deepEqual(
    fitScraps(rows, 200, 300).map((x) => x.id),
    ["b", "a"],
  );
  assert.equal(fitScraps(rows, 201, 301).length, 1);
  assert.equal(fitScraps(rows, -1, 300).length, 0);
});
