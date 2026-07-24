import assert from "node:assert/strict";
import test from "node:test";
import { usefulElapsedHours } from "./date";
import { hasCompleteTime } from "./efficiency";

test("timestamp UTC à meia-noite é reconhecido pelo horário local", () => {
  const value = "2026-07-24T00:00:00.000Z";
  const parsed = new Date(value);
  const expected = parsed.getHours() !== 0 || parsed.getMinutes() !== 0 || parsed.getSeconds() !== 0;
  assert.equal(hasCompleteTime(value), expected);
});

test("data local artificial à meia-noite continua sem horário preciso", () => {
  assert.equal(hasCompleteTime("2026-07-24T00:00:00"), false);
});

test("processo recebido às 21h e enviado às 11h19 do dia seguinte fica até duas horas úteis", () => {
  const hours = usefulElapsedHours("2026-07-23T21:00:00-03:00", "2026-07-24T11:19:00-03:00");
  assert.ok(hours != null);
  assert.ok(hours <= 2);
});

test("cálculo usa o horário real do recebimento, e não a meia-noite", () => {
  const hours = usefulElapsedHours("2026-07-23T21:00:00-03:00", "2026-07-24T11:19:00-03:00");
  assert.equal(Number(hours?.toFixed(2)), 0);
});
