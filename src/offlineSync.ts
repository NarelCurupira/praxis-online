import { createMovement, findMovementForOfflineCreate, getMovementOfflineSyncState, updateMovementAction, updateMovementAssignment, updateMovementStatus } from "./api";
import { usefulElapsedHours } from "./date";
import { updateMovementGoverned } from "./governanceApi";
import {
  listOfflineOperations,
  markOfflineOperationError,
  remapOfflineMovementId,
  removeOfflineOperation,
  type OfflineOperation,
} from "./offlineStore";
import type { ProcessFormData, ProcessMovement, TeamMember } from "./types";

function asIso(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
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
  remaining: number;
  error: string;
}

export async function syncOfflineOperationsForWorkspace(userId: string, workspaceId: string): Promise<OfflineSyncResult> {
  const operations = await listOfflineOperations(userId, workspaceId);
  const tempMap = new Map<number, number>();
  let synced = 0;
  let error = "";

  for (const operation of operations) {
    try {
      if (operation.payload.kind === "create") {
        // Idempotência prática para perda de confirmação: se o INSERT chegou ao servidor
        // mas a resposta se perdeu, a próxima tentativa reconhece o mesmo movimento.
        const existing = await findMovementForOfflineCreate(operation.payload.data);
        const created = existing ?? await createMovement(operation.payload.data);
        if (operation.tempMovementId != null) {
          tempMap.set(operation.tempMovementId, created.movementId);
          await remapOfflineMovementId(userId, workspaceId, operation.tempMovementId, created.movementId);
        }
      } else {
        const rawMovementId = operation.movementId;
        if (rawMovementId == null) throw new Error("Operação local sem identificador de movimento.");
        const movementId = tempMap.get(rawMovementId) ?? rawMovementId;
        if (movementId < 0) throw new Error("O cadastro local correspondente ainda não foi sincronizado.");
        if (operation.payload.kind === "edit") {
          await updateMovementGoverned(movementId, operation.payload.data);
        } else {
          // Evita duplicar histórico quando a gravação anterior chegou ao servidor,
          // mas a confirmação não retornou ao navegador antes da queda da conexão.
          const current = await getMovementOfflineSyncState(movementId);
          if (operation.payload.kind === "status") {
            const sameStatus = current.workflowStatus === operation.payload.status;
            const sameAction = operation.payload.actionType === undefined || current.actionType === operation.payload.actionType;
            if (!(sameStatus && sameAction)) await updateMovementStatus(movementId, operation.payload.status, operation.payload.actionType, operation.createdAt);
          } else if (operation.payload.kind === "action") {
            if (current.actionType !== operation.payload.actionType) await updateMovementAction(movementId, operation.payload.actionType);
          } else if (current.assignedTo !== operation.payload.assignedTo) {
            await updateMovementAssignment(movementId, operation.payload.assignedTo);
          }
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
  return { synced, failed: error ? 1 : 0, remaining, error };
}
