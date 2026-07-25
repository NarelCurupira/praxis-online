import assert from "node:assert/strict";
import test from "node:test";
import { actionGroupName, summarizeActionGroups } from "./actionGroups";

test("classifica as providências institucionais sem duplicar sobrestamento", () => {
  assert.equal(actionGroupName("Manifestação"), "Intervenção");
  assert.equal(actionGroupName("Desnecessária Intervenção"), "Desnecessária intervenção");
  assert.equal(actionGroupName("Diligência"), "Diligências e medidas processuais");
  assert.equal(actionGroupName("Prevenção"), "Diligências e medidas processuais");
  assert.equal(actionGroupName("Sobrestamento"), "Diligências e medidas processuais");
  assert.equal(actionGroupName("Suspeição"), "Diligências e medidas processuais");
  assert.equal(actionGroupName("Ciência Fundamentada"), "Ciência");
});

test("resume as categorias e preserva a decomposição para o tooltip", () => {
  const result = summarizeActionGroups(["Manifestação", "Manifestação", "Recurso", "Diligência", "Suspeição", "Ciência"]);
  assert.deepEqual(result.map(({name,value})=>({name,value})), [
    { name: "Intervenção", value: 3 },
    { name: "Diligências e medidas processuais", value: 2 },
    { name: "Ciência", value: 1 },
  ]);
  assert.deepEqual(result[0].details, [{name:"Manifestação",value:2},{name:"Recurso",value:1}]);
});
