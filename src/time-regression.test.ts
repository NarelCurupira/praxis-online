import assert from "node:assert/strict";
import test from "node:test";
import {
  configureWorkdaySchedule,
  excelDateTime,
  localDatePart,
  toStorageTimestamp,
  usefulElapsedHours,
} from "./date";
import { buildReportModel } from "./reporting";
import type { ProcessMovement, TeamMember } from "./types";

test("datetime-local é armazenado como instante de Belém", () => {
  assert.equal(
    toStorageTimestamp("2026-07-24T15:30"),
    "2026-07-24T18:30:00.000Z",
  );
});

test("data UTC é agrupada pelo dia local de Belém", () => {
  assert.equal(localDatePart("2026-07-24T02:30:00.000Z"), "2026-07-23");
});

test("planilha reconhece hora na mesma célula", () => {
  assert.deepEqual(
    excelDateTime("24/07/2026 15:30"),
    { value: "2026-07-24T15:30:00", precise: true },
  );
});

test("planilha reconhece coluna separada de hora", () => {
  assert.deepEqual(
    excelDateTime("24/07/2026", "15:30"),
    { value: "2026-07-24T15:30:00", precise: true },
  );
});

test("tempo útil no mesmo dia preserva a duração real", () => {
  configureWorkdaySchedule({
    workdayStart: "08:00",
    workdayEnd: "14:00",
    workdayHours: 6,
  });

  const hours = usefulElapsedHours(
    "2026-07-16T14:34:37.000Z",
    "2026-07-16T15:31:23.000Z",
  );

  assert.ok(hours !== null);
  assert.equal(Number(hours.toFixed(4)), 0.9461);
});

test("tempo útil ignora a noite e conta o expediente do dia seguinte", () => {
  configureWorkdaySchedule({
    workdayStart: "08:00",
    workdayEnd: "14:00",
    workdayHours: 6,
  });

  const hours = usefulElapsedHours(
    "2026-07-24T00:00:00.000Z",
    "2026-07-24T14:19:00.000Z",
  );

  assert.ok(hours !== null);
  assert.equal(Number(hours.toFixed(4)), 3.3167);
});

test("fim de semana e data sem expediente não entram no tempo útil", () => {
  configureWorkdaySchedule({
    workdayStart: "08:00",
    workdayEnd: "14:00",
    workdayHours: 6,
  });

  const hours = usefulElapsedHours(
    "2026-07-24T16:00:00.000Z",
    "2026-07-27T16:00:00.000Z",
    new Set(["2026-07-27"]),
  );

  assert.equal(hours, 1);
});

test("tempo útil de período histórico preserva fins de semana e exclusões", () => {
  configureWorkdaySchedule({
    workdayStart: "08:00",
    workdayEnd: "14:00",
    workdayHours: 6,
  });

  const hours = usefulElapsedHours(
    "2024-01-02T11:00:00.000Z",
    "2026-06-20T11:00:00.000Z",
    new Set(["2024-01-15", "2025-04-21", "2026-01-01"]),
  );

  assert.equal(hours, 3846);
});

test("relatório infere cobertura pelos registros existentes", () => {
  const member: TeamMember = {
    userId: "a",
    fullName: "A",
    email: "a@example.test",
    role: "admin",
    active: true,
    mfaRequired: false,
    historicalCoverageSince: null,
  };

  const record: ProcessMovement = {
    movementId: 1,
    caseId: 1,
    mpNumber: "MP",
    judicialNumber: "1",
    className: "Apelação Cível",
    subject: "Teste",
    receivedAt: "2026-01-02T12:00:00.000Z",
    receivedTimePrecise: true,
    deadlineAt: "",
    draftStatus: "Minutado",
    workflowStatus: "Enviado",
    sentAt: "2026-01-02T13:00:00.000Z",
    sentTimePrecise: true,
    actionType: "Manifestação",
    notes: "",
    priority: "Normal",
    documentPath: "",
    elapsedHours: 1,
    sociallyRelevant: false,
    extremelyComplex: false,
    socialTheme: "",
    relevanceReason: "",
    fundamentalRight: "",
    affectedGroup: "",
    reach: "",
    territorialScope: "",
    impactType: "",
    socialResult: "",
    sdgs: [],
    complexityReason: "",
    deletedAt: null,
    assignedTo: "a",
    assignedName: "A",
  };

  const model = buildReportModel(
    [record],
    [member],
    {
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      scope: "team",
      className: "all",
      actionType: "all",
      highlight: "all",
    },
  );

  assert.equal(model.coverage.available, 1);
  assert.equal(model.flow.received, 1);
  assert.equal(model.flow.sent, 1);
});
