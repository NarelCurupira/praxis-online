import assert from "node:assert/strict";
import test from "node:test";
import { formatDate, toStorageTimestamp } from "./date";
import { dateKey, hasCompleteTime } from "./efficiency";

test("datetime-local é convertido para o instante UTC correspondente", () => {
  assert.equal(toStorageTimestamp("2026-07-24T15:30"), "2026-07-24T18:30:00.000Z");
});

test("timestamp UTC é agrupado pela data local de Belém", () => {
  assert.equal(dateKey("2026-07-24T00:00:00.000Z"), "2026-07-23");
});

test("registro histórico migrado para meia-noite local não finge possuir horário", () => {
  assert.equal(hasCompleteTime("2026-07-24T03:00:00.000Z"), false);
  assert.equal(formatDate("2026-07-24T03:00:00.000Z", true), "24/07/2026");
});

test("registro novo preserva e apresenta o horário real", () => {
  assert.equal(hasCompleteTime("2026-07-24T18:30:00.000Z"), true);
  assert.match(formatDate("2026-07-24T18:30:00.000Z", true), /24\/07\/2026.*15:30/);
});
