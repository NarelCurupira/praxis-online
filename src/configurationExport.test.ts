import assert from "node:assert/strict";
import test from "node:test";
import { buildConfigurationExport, configurationExportFileName } from "./configurationExport";

test("exportação de configurações não inclui dados processuais ou credenciais", () => {
  const result = buildConfigurationExport({
    settings: { unitName: "Unidade", leadProsecutor: "Responsável" } as never,
    classes: [{ name: "Apelação", deadlineBusinessDays: 30 }] as never,
    exclusions: [{ date: "2026-01-01", label: "Feriado" }] as never,
    closedPeriods: [] as never,
    exportedAt: "2026-07-28T12:00:00.000Z",
  });
  const text = JSON.stringify(result);
  assert.equal(result.format, "praxis-settings");
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.exportedAt, "2026-07-28T12:00:00.000Z");
  assert.equal(text.includes("password"), false);
  assert.equal(text.includes("access_token"), false);
  assert.equal(configurationExportFileName(new Date(result.exportedAt)), "praxis-configuracoes-2026-07-28.json");
});
