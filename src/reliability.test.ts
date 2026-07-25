import assert from "node:assert/strict";
import test from "node:test";
import { createErrorCode, normalizeTechnicalError, sanitizeTechnicalText, technicalDiagnosticText } from "./reliability";

test("gera código técnico reproduzível e sem dados processuais", () => {
  assert.equal(createErrorCode(new Date("2026-07-25T14:03:04"), .123456), "PRAXIS-20260725-140304-123456");
});

test("remove tokens e senhas de mensagens técnicas", () => {
  const sanitized = sanitizeTechnicalText("authorization=Bearer-abc token=segredo password=minhasenha");
  assert.equal(sanitized.includes("segredo"), false);
  assert.equal(sanitized.includes("minhasenha"), false);
  assert.match(sanitized, /conteúdo protegido/);
});

test("normaliza e limita o erro antes do registro", () => {
  const record = normalizeTechnicalError({ message: "x".repeat(2000), stack: "pilha", buildVersion: "0.10.0", buildCommit: "abc" }, new Date("2026-07-25T14:03:04"), 0);
  assert.equal(record.message.length, 1000);
  assert.equal(record.buildVersion, "0.10.0");
  assert.equal(record.code, "PRAXIS-20260725-140304-000000");
});

test("diagnóstico contém versão, compilação e código", () => {
  const record = normalizeTechnicalError({ message: "Falha", page: "Relatórios", buildVersion: "0.10.0", buildCommit: "abc123" }, new Date("2026-07-25T14:03:04"), 0);
  const text = technicalDiagnosticText(record);
  assert.match(text, /Versão: 0.10.0/);
  assert.match(text, /Compilação: abc123/);
  assert.match(text, /Página: Relatórios/);
});
