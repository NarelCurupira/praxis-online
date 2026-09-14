import { applyMovementOperation } from "./movementOperations";
import { getMovementForOfflineSync } from "./api";
import { usefulElapsedHours } from "./date";
import {
  listOfflineOperations,
  markOfflineOperationConflict,
  markOfflineOperationError,
  remapOfflineMovementId,
  removeOfflineOperation,
  type OfflineConflict,
  type OfflineConflictField,
  type OfflineOperation,
  type OfflineOperationBaseline,
  type OfflineOperationPayload,
} from "./offlineStore";
import type { ProcessEditData, ProcessFormData, ProcessMovement, TeamMember } from "./types";

function asIso(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

function text(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (Array.isArray(value)) return JSON.stringify([...value].map(String).sort());
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

function isoText(value: string | null | undefined): string {
  return text(asIso(value || null));
}

const FIELD_LABELS: Record<string, string> = {
  workflowStatus: "Status",
  sentAt: "Data de envio",
  draftStatus: "Situação da minuta",
  actionType: "Providência",
  assignedTo: "Responsável",
  className: "Classe",
  subject: "Assunto",
  receivedAt: "Data de entrada",
  receivedTimePrecise: "Precisão da entrada",
  deadlineAt: "Prazo",
  sentTimePrecise: "Precisão do envio",
  notes: "Observações",
  priority: "Prioridade",
  proceduralPriority: "Prioridade processual",
  documentPath: "Documento",
  sociallyRelevant: "Relevância social",
  extremelyComplex: "Alta complexidade",
  socialTheme: "Tema social",
  relevanceReason: "Justificativa de relevância",
  fundamentalRight: "Direito fundamental",
  affectedGroup: "Grupo afetado",
  reach: "Alcance",
  territorialScope: "Abrangência territorial",
  impactType: "Tipo de impacto",
  socialResult: "Resultado social",
  sdgs: "ODS",
  complexityReason: "Justificativa de complexidade",
  deletedAt: "Exclusão",
  archivedAt: "Arquivamento",
};

function recordValue(record: ProcessMovement, field: string): string {
  if (field === "receivedAt" || field === "sentAt" || field === "deletedAt" || field === "archivedAt") {
    return isoText(record[field as "receivedAt" | "sentAt" | "deletedAt" | "archivedAt"] ?? null);
  }
  return text((record as unknown as Record<string, unknown>)[field]);
}

function editTargetValues(data: ProcessEditData): Record<string, string> {
  return {
    className: text(data.className),
    subject: text(data.subject),
    receivedAt: isoText(data.receivedAt),
    receivedTimePrecise: text(Boolean(data.receivedTimePrecise)),
    deadlineAt: text(data.deadlineAt),
    sentAt: isoText(data.sentAt),
    sentTimePrecise: text(Boolean(data.sentAt && data.sentTimePrecise)),
    actionType: text(data.actionType),
    notes: text(data.notes),
    priority: text(data.priority),
    proceduralPriority: text(data.proceduralPriority),
    documentPath: text(data.documentPath),
    assignedTo: text(data.assignedTo),
    sociallyRelevant: text(data.sociallyRelevant),
    extremelyComplex: text(data.extremelyComplex),
    socialTheme: text(data.socialTheme),
    relevanceReason: text(data.relevanceReason),
    fundamentalRight: text(data.fundamentalRight),
    affectedGroup: text(data.affectedGroup),
    reach: text(data.reach),
    territorialScope: text(data.territorialScope),
    impactType: text(data.impactType),
    socialResult: text(data.socialResult),
    sdgs: text(data.sdgs),
    complexityReason: text(data.complexityReason),
  };
}

function fieldsForPayload(payload: OfflineOperationPayload): string[] {
  if (payload.kind === "assignment") return ["assignedTo"];
  if (payload.kind === "action") return ["actionType"];
  if (payload.kind === "status") {
    const fields = ["workflowStatus", "sentAt"];
    if (payload.status === "Minutado" || payload.status === "Enviado") fields.push("draftStatus");
    if (payload.actionType !== undefined) fields.push("actionType");
    return fields;
  }
  if (payload.kind === "edit") return Object.keys(editTargetValues(payload.data));
  return [];
}

export function createOfflineBaseline(record: ProcessMovement | undefined, payload: OfflineOperationPayload): OfflineOperationBaseline | null {
  if (!record || payload.kind === "create") return null;
  const values: Record<string, string | null> = {
    deletedAt: recordValue(record, "deletedAt"),
    archivedAt: recordValue(record, "archivedAt"),
  };
  for (const field of fieldsForPayload(payload)) values[field] = recordValue(record, field);
  return { values };
}

function targetValues(operation: OfflineOperation): Record<string, string> {
  const payload = operation.payload;
  if (payload.kind === "assignment") return { assignedTo: text(payload.assignedTo) };
  if (payload.kind === "action") return { actionType: text(payload.actionType) };
  if (payload.kind === "status") {
    const values: Record<string, string> = {
      workflowStatus: text(payload.status),
      sentAt: payload.status === "Enviado" ? isoText(operation.createdAt) : "",
    };
    if (payload.status === "Minutado" || payload.status === "Enviado") values.draftStatus = "Minutado";
    if (payload.actionType !== undefined) values.actionType = text(payload.actionType);
    return values;
  }
  if (payload.kind === "edit") return editTargetValues(payload.data);
  return {};
}

function displayValue(value: string): string {
  if (!value) return "—";
  if (value === "true") return "Sim";
  if (value === "false") return "Não";
  if (value.length > 180) return `${value.slice(0, 177)}…`;
  return value;
}

export function detectOfflineConflict(operation: OfflineOperation, server: ProcessMovement | null): OfflineConflict | null {
  if (operation.payload.kind === "create" || operation.conflictResolution === "local_wins") return null;
  if (!server) {
    return {
      detectedAt: new Date().toISOString(),
      kind: "record_unavailable",
      message: "O registro existente não está mais disponível no servidor.",
      fields: [],
      canApplyLocal: false,
    };
  }

  if (!operation.baseline) {
    return {
      detectedAt: new Date().toISOString(),
      kind: "baseline_unavailable",
      message: "Esta alteração foi criada por uma versão anterior da contingência e não possui base segura para comparação automática.",
      fields: [],
      canApplyLocal: true,
    };
  }

  const baseline = operation.baseline.values;
  const lifecycleFields: OfflineConflictField[] = [];
  for (const field of ["deletedAt", "archivedAt"]) {
    const before = baseline[field] ?? "";
    const current = recordValue(server, field);
    if (current !== before) {
      lifecycleFields.push({
        field,
        label: FIELD_LABELS[field],
        baseline: displayValue(before),
        server: displayValue(current),
        local: "Não alterado localmente",
      });
    }
  }
  if (lifecycleFields.length) {
    return {
      detectedAt: new Date().toISOString(),
      kind: "lifecycle_change",
      message: "O processo foi arquivado ou excluído no servidor enquanto havia alterações locais pendentes.",
      fields: lifecycleFields,
      canApplyLocal: false,
    };
  }

  const local = targetValues(operation);
  const conflicts: OfflineConflictField[] = [];
  for (const field of Object.keys(local)) {
    const before = baseline[field] ?? "";
    const current = recordValue(server, field);
    const desired = local[field];
    // Three-way merge: só há conflito se o servidor mudou desde a base E
    // terminou em valor diferente daquele desejado localmente.
    if (current !== before && current !== desired) {
      conflicts.push({
        field,
        label: FIELD_LABELS[field] ?? field,
        baseline: displayValue(before),
        server: displayValue(current),
        local: displayValue(desired),
      });
    }
  }

  if (!conflicts.length) return null;
  return {
    detectedAt: new Date().toISOString(),
    kind: "concurrent_change",
    message: `${conflicts.length} campo${conflicts.length === 1 ? " foi alterado" : "s foram alterados"} no servidor depois que esta alteração local foi iniciada.`,
    fields: conflicts,
    canApplyLocal: true,
  };
}

function operationAlreadyApplied(operation: OfflineOperation, server: ProcessMovement): boolean {
  const local = targetValues(operation);
  const fields = Object.keys(local);
  return fields.length > 0 && fields.every((field) => recordValue(server, field) === local[field]);
}

export function offlineMovementFromForm(data: ProcessFormData, movementId: number, members: TeamMember[], createdAt = new Date().toISOString()): ProcessMovement {
  const receivedAt = asIso(data.receivedAt) ?? createdAt;
  const assignedTo = data.assignedTo || "";
  return {
    movementId,
    caseId: movementId,
    mpNumber: data.mpNumber,
    judicialNumber: data.judicialNumber,
    className: data.className,
    subject: data.subject,
    receivedAt,
    receivedTimePrecise: data.receivedTimePrecise ?? true,
    deadlineAt: data.deadlineAt,
    draftStatus: "Pendente",
    workflowStatus: "Recebido",
    sentAt: null,
    sentTimePrecise: false,
    actionType: data.actionType,
    notes: data.notes,
    priority: data.priority,
    proceduralPriority: data.proceduralPriority,
    documentPath: data.documentPath,
    elapsedHours: null,
    sociallyRelevant: data.sociallyRelevant,
    extremelyComplex: data.extremelyComplex,
    socialTheme: data.socialTheme,
    relevanceReason: data.relevanceReason,
    fundamentalRight: data.fundamentalRight,
    affectedGroup: data.affectedGroup,
    reach: data.reach,
    territorialScope: data.territorialScope,
    impactType: data.impactType,
    socialResult: data.socialResult,
    sdgs: data.sdgs,
    complexityReason: data.complexityReason,
    deletedAt: null,
    archivedAt: null,
    assignedTo,
    assignedName: members.find((member) => member.userId === assignedTo)?.fullName || "",
    detailsLoaded: true,
  };
}

export function projectOfflineOperations(records: ProcessMovement[], operations: OfflineOperation[], members: TeamMember[]): ProcessMovement[] {
  let next = [...records];
  const memberNames = new Map(members.map((member) => [member.userId, member.fullName]));

  for (const operation of [...operations].sort((left, right) => left.createdAt.localeCompare(right.createdAt))) {
    if (operation.payload.kind === "create") {
      const temporaryId = operation.tempMovementId ?? operation.movementId;
      if (temporaryId == null) continue;
      const created = offlineMovementFromForm(operation.payload.data, temporaryId, members, operation.createdAt);
      next = [created, ...next.filter((record) => record.movementId !== temporaryId)];
      continue;
    }

    if (operation.movementId == null) continue;
    next = next.map((record) => {
      if (record.movementId !== operation.movementId) return record;
      if (operation.payload.kind === "assignment") {
        return { ...record, assignedTo: operation.payload.assignedTo, assignedName: memberNames.get(operation.payload.assignedTo) || record.assignedName };
      }
      if (operation.payload.kind === "action") return { ...record, actionType: operation.payload.actionType };
      if (operation.payload.kind === "status") {
        const sentAt = operation.payload.status === "Enviado" ? operation.createdAt : null;
        return {
          ...record,
          workflowStatus: operation.payload.status,
          actionType: operation.payload.actionType ?? record.actionType,
          draftStatus: operation.payload.status === "Minutado" || operation.payload.status === "Enviado" ? "Minutado" : record.draftStatus,
          sentAt,
          sentTimePrecise: operation.payload.status === "Enviado",
          elapsedHours: sentAt ? usefulElapsedHours(record.receivedAt, sentAt) : null,
        };
      }
      if (operation.payload.kind !== "edit") return record;
      const data = operation.payload.data;
      const receivedAt = asIso(data.receivedAt) ?? data.receivedAt;
      const sentAt = asIso(data.sentAt);
      return {
        ...record,
        ...data,
        receivedAt,
        sentAt,
        receivedTimePrecise: Boolean(data.receivedTimePrecise),
        sentTimePrecise: Boolean(data.sentTimePrecise),
        elapsedHours: usefulElapsedHours(receivedAt, sentAt),
        assignedName: memberNames.get(data.assignedTo) || record.assignedName,
        detailsLoaded: true,
      };
    });
  }

  return next.sort((left, right) => {
    const date = right.receivedAt.localeCompare(left.receivedAt);
    return date || right.movementId - left.movementId;
  });
}

export interface OfflineSyncResult {
  synced: number;
  failed: number;
  conflicts: number;
  remaining: number;
  error: string;
}

async function syncWorkspace(userId: string, workspaceId: string): Promise<OfflineSyncResult> {
  const operations = await listOfflineOperations(userId, workspaceId);
  const tempMap = new Map<number, number>();
  let synced = 0;
  let conflicts = 0;
  let error = "";

  for (const operation of operations) {
    try {
      if (operation.conflict && operation.conflictResolution !== "local_wins") {
        conflicts = 1;
        error = "Há um conflito pendente de resolução na fila local.";
        break;
      }

      if (operation.payload.kind === "create") {
        const id = await applyMovementOperation("create", null, operation.payload.data, { operationId: operation.id, userId, workspaceId });
        const created = { movementId: id };
        if (operation.tempMovementId != null) {
          tempMap.set(operation.tempMovementId, created.movementId);
          await remapOfflineMovementId(userId, workspaceId, operation.tempMovementId, created.movementId);
        }
      } else {
        const rawMovementId = operation.movementId;
        if (rawMovementId == null) throw new Error("Operação local sem identificador de movimento.");
        const movementId = tempMap.get(rawMovementId) ?? rawMovementId;
        if (movementId < 0) throw new Error("O cadastro local correspondente ainda não foi sincronizado.");

        const current = await getMovementForOfflineSync(movementId);
        const originatedFromLocalCreate = operation.tempMovementId != null && operation.tempMovementId < 0;
        const conflict = !operation.baseline && originatedFromLocalCreate
          ? null
          : detectOfflineConflict(operation, current);
        if (conflict) {
          await markOfflineOperationConflict(operation.id, conflict);
          conflicts = 1;
          error = conflict.message;
          break;
        }
        if (!current) throw new Error("O movimento não está mais disponível no servidor.");

        if (!operationAlreadyApplied(operation, current)) {
          const payload = operation.payload.kind === "edit" ? operation.payload.data
            : operation.payload.kind === "status" ? { status: operation.payload.status, ...(operation.payload.actionType !== undefined ? { actionType: operation.payload.actionType } : {}), occurredAt: operation.createdAt }
            : operation.payload.kind === "action" ? { actionType: operation.payload.actionType }
            : { assignedTo: operation.payload.assignedTo };
          await applyMovementOperation(operation.payload.kind, movementId, payload, { operationId: operation.id, baseline: current, userId, workspaceId });
        }
      }
      await removeOfflineOperation(operation.id);
      synced += 1;
    } catch (syncError) {
      error = syncError instanceof Error ? syncError.message : String(syncError);
      await markOfflineOperationError(operation.id, error);
      break; // Preserva a ordem: operações posteriores podem depender desta.
    }
  }

  const remaining = (await listOfflineOperations(userId, workspaceId)).length;
  return { synced, failed: error && !conflicts ? 1 : 0, conflicts, remaining, error };
}

export async function syncOfflineOperationsForWorkspace(userId: string, workspaceId: string): Promise<OfflineSyncResult> {
  if (typeof navigator !== "undefined" && navigator.locks) return navigator.locks.request(`praxis-sync:${userId}:${workspaceId}`, () => syncWorkspace(userId, workspaceId));
  return syncWorkspace(userId, workspaceId); // A transação e o recibo no servidor também protegem navegadores sem Web Locks.
}
