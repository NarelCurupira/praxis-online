import assert from "node:assert/strict";
import test from "node:test";
import { databaseUsagePercentage, diagnosticsText, SUPABASE_FREE_DATABASE_LIMIT_BYTES } from "./diagnosticsApi";

test("calcula o percentual da referência gratuita", () => {
  assert.equal(databaseUsagePercentage(SUPABASE_FREE_DATABASE_LIMIT_BYTES / 2), 50);
});

test("diagnóstico copiável não contém dados processuais", () => {
  const value = diagnosticsText({workspaceName:"Gabinete",processes:10,movements:20,activeUsers:3,impreciseReceived:1,impreciseSent:2,technicalErrors:0,slowOperations:0,archivedSlowOperations:0,importBatches:0,databaseBytes:1024,databasePretty:"1024 bytes",checkedAt:"2026-07-25T12:00:00Z"});
  assert.match(value,/Processos: 10/);
  assert.doesNotMatch(value,/número judicial|assunto|08\.2026/i);
});
