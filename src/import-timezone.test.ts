import assert from "node:assert/strict";
import test from "node:test";
import { excelDateTime, toStorageTimestamp } from "./date";
import { isLikelyLegacyTimezoneShift } from "./api";

test("número serial preserva a entrada do processo 0811079-52.2024.8.14.0028", () => {
  const result = excelDateTime(46219.48237268518);
  assert.deepEqual(result, {
    value: "2026-07-16T11:34:37",
    precise: true,
  });
});

test("número serial preserva o envio do processo 0811079-52.2024.8.14.0028", () => {
  const result = excelDateTime(46219.52179398148);
  assert.deepEqual(result, {
    value: "2026-07-16T12:31:23",
    precise: true,
  });
});

test("o horário importado é armazenado com o deslocamento correto de Belém", () => {
  assert.equal(
    toStorageTimestamp("2026-07-16T12:31:23"),
    "2026-07-16T15:31:23.000Z",
  );
});

test("detecta o erro histórico de três horas", () => {
  assert.equal(
    isLikelyLegacyTimezoneShift(
      "2026-07-16T12:31:23.000Z",
      "2026-07-16T15:31:23.000Z",
    ),
    true,
  );
});

test("não sobrescreve diferença comum que não seja o erro de fuso", () => {
  assert.equal(
    isLikelyLegacyTimezoneShift(
      "2026-07-16T15:00:00.000Z",
      "2026-07-16T15:31:23.000Z",
    ),
    false,
  );
});
