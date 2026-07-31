import assert from "node:assert/strict";
import test from "node:test";
import { PROCEDURAL_PRIORITY_OPTIONS, proceduralPriorityLabel } from "./proceduralPriorities";

test("prioridades processuais possuem valores únicos e opção neutra", () => {
  const values = PROCEDURAL_PRIORITY_OPTIONS.map((item) => item.value);
  assert.equal(new Set(values).size, values.length);
  assert.equal(values[0], "Nenhuma");
});

test("inclui idoso, superprioridade, ECA e doença grave", () => {
  assert.equal(proceduralPriorityLabel("Idoso"), "Pessoa idosa (60 anos ou mais)");
  assert.equal(proceduralPriorityLabel("Idoso +80"), "Pessoa idosa (80 anos ou mais)");
  assert.equal(proceduralPriorityLabel("ECA"), "Criança ou adolescente (ECA)");
  assert.equal(proceduralPriorityLabel("Doença grave"), "Pessoa com doença grave");
});
