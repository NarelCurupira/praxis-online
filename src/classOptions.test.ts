import assert from "node:assert/strict";
import test from "node:test";
import { withRequiredAppealClasses } from "./classOptions";

test("inclui Recurso Especial e Recurso Extraordinário quando ausentes", () => {
  const result = withRequiredAppealClasses([{ name: "Apelação Cível", businessDays: 20 }]);
  assert.equal(result.find((item) => item.name === "Recurso Especial")?.businessDays, 30);
  assert.equal(result.find((item) => item.name === "Recurso Extraordinário")?.businessDays, 30);
});

test("preserva prazo configurado e não duplica classes existentes", () => {
  const result = withRequiredAppealClasses([
    { name: "Recurso Especial", businessDays: 15 },
    { name: "Recurso Extraordinário", businessDays: 20 },
  ]);
  assert.equal(result.filter((item) => item.name === "Recurso Especial").length, 1);
  assert.equal(result.find((item) => item.name === "Recurso Especial")?.businessDays, 15);
  assert.equal(result.find((item) => item.name === "Recurso Extraordinário")?.businessDays, 20);
});
