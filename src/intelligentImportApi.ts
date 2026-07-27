import { localDatePart, toStorageTimestamp, usefulElapsedHours } from "./date";
import { requireSupabase } from "./supabase";
import type { ImportRecord, ImportResult, ProcessMovement, WorkflowStatus } from "./types";

export type ExistingRecordPolicy = "skip" | "fill_missing" | "update_different";
export type DuplicatePolicy = "block" | "first";
export type TimestampConflictPolicy = "keep_existing" | "use_imported";
export type ValidationMode = "tolerant" | "strict";

export interface IntelligentImportRules {
  existingPolicy: ExistingRecordPolicy;
  duplicatePolicy: DuplicatePolicy;
  timestampConflictPolicy: TimestampConflictPolicy;
  validationMode: ValidationMode;
  useCurrentUserWhenAssigneeMissing: boolean;
  estimateMissingSentAt: boolean;
}

export const DEFAULT_IMPORT_RULES: IntelligentImportRules = {
  existingPolicy: "fill_missing",
  duplicatePolicy: "block",
  timestampConflictPolicy: "keep_existing",
  validationMode: "tolerant",
  useCurrentUserWhenAssigneeMissing: true,
  estimateMissingSentAt: true,
};

export type ImportPreviewKind = "new_case" | "new_movement" | "update" | "unchanged" | "duplicate" | "conflict" | "invalid";

export interface ImportPreviewItem {
  key: string;
  record: ImportRecord;
  kind: ImportPreviewKind;
  label: string;
  details: string[];
  accepted: boolean;
}

export interface ImportPreview {
  items: ImportPreviewItem[];
  total: number;
  accepted: number;
  newCases: number;
  newMovements: number;
  updates: number;
  unchanged: number;
  duplicates: number;
  conflicts: number;
  invalid: number;
  preciseReceived: number;
  preciseSent: number;
}

export interface ImportBatchEntry {
  id: number;
  batchCode: string;
  fileName: string;
  templateName: string;
  status: "processing" | "completed" | "failed" | "reverted";
  startedAt: string;
  completedAt: string | null;
  revertedAt: string | null;
  actorName: string;
  result: Record<string, unknown>;
  preview: Record<string, unknown>;
  errorMessage: string;
}

export interface ImportRevertResult {
  restoredMovements: number;
  deletedMovements: number;
  restoredCases: number;
  deletedCases: number;
  skipped: number;
}

export interface MovementProvenance {
  dataOrigin: string;
  sourceFileName: string;
  importedAt: string | null;
  receivedOrigin: string;
  sentOrigin: string;
  batchCode: string;
}

interface ApiContext {
  client: ReturnType<typeof requireSupabase>;
  userId: string;
  workspaceId: string;
}

let contextPromise: Promise<ApiContext> | null = null;

async function context(): Promise<ApiContext> {
  if (contextPromise) return contextPromise;
  contextPromise = (async () => {
    const client = requireSupabase();
    const { data: userData, error: userError } = await client.auth.getUser();
    if (userError) throw userError;
    if (!userData.user) throw new Error("Sessão expirada. Entre novamente.");
    const { data: profile } = await client.from("profiles").select("current_workspace_id").eq("id", userData.user.id).maybeSingle();
    let workspaceId = String(profile?.current_workspace_id ?? "");
    if (!workspaceId) {
      const { data, error } = await client.from("workspace_members").select("workspace_id").eq("user_id", userData.user.id).eq("active", true).limit(1).single();
      if (error) throw error;
      workspaceId = String(data.workspace_id);
    }
    return { client, userId: userData.user.id, workspaceId };
  })();
  return contextPromise;
}

function normal(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

function sameTimestamp(left: string | null | undefined, right: string | null | undefined): boolean {
  if (!left && !right) return true;
  if (!left || !right) return false;
  const a = new Date(left).getTime();
  const b = new Date(right).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return normal(left) === normal(right);
  return Math.abs(a - b) < 60_000;
}

function recordKey(record: Pick<ImportRecord, "judicialNumber" | "receivedAt">): string {
  return `${normal(record.judicialNumber)}|${localDatePart(record.receivedAt)}`;
}

function existingKey(record: ProcessMovement): string {
  return `${normal(record.judicialNumber)}|${localDatePart(record.receivedAt)}`;
}

function invalidReasons(record: ImportRecord): string[] {
  const reasons: string[] = [];
  if (!normal(record.judicialNumber)) reasons.push("Número judicial ausente");
  if (!normal(record.mpNumber)) reasons.push("Número MP ausente");
  if (!toStorageTimestamp(record.receivedAt)) reasons.push("Data de entrada inválida");
  if (record.workflowStatus === "Enviado" && record.sentAt && !toStorageTimestamp(record.sentAt)) reasons.push("Data de envio inválida");
  const received = toStorageTimestamp(record.receivedAt);
  const sent = toStorageTimestamp(record.sentAt);
  if (received && sent && new Date(sent).getTime() < new Date(received).getTime()) reasons.push("Envio anterior à entrada");
  return reasons;
}

function potentialChanges(imported: ImportRecord, existing: ProcessMovement): string[] {
  const changes: string[] = [];
  const importedReceived = toStorageTimestamp(imported.receivedAt);
  const importedSent = toStorageTimestamp(imported.sentAt);
  if (imported.receivedTimePrecise && importedReceived && (!existing.receivedTimePrecise || !sameTimestamp(importedReceived, existing.receivedAt))) changes.push("data/hora de entrada");
  if (imported.sentTimePrecise && importedSent && (!existing.sentTimePrecise || !sameTimestamp(importedSent, existing.sentAt))) changes.push("data/hora de envio");
  if (normal(imported.actionType) && normal(imported.actionType) !== normal(existing.actionType)) changes.push("providência");
  if (normal(imported.deadlineAt) && localDatePart(imported.deadlineAt) !== localDatePart(existing.deadlineAt)) changes.push("prazo");
  if (imported.workflowStatus !== existing.workflowStatus) changes.push("status");
  if (normal(imported.subject) && normal(imported.subject) !== normal(existing.subject)) changes.push("assunto");
  return changes;
}

export function buildImportPreview(records: ImportRecord[], currentRecords: ProcessMovement[], rules: IntelligentImportRules): ImportPreview {
  const cases = new Set(currentRecords.map((record) => normal(record.judicialNumber)).filter(Boolean));
  const movementMap = new Map(currentRecords.map((record) => [existingKey(record), record]));
  const sourceKeys = new Map<string, number>();
  records.forEach((record) => sourceKeys.set(recordKey(record), (sourceKeys.get(recordKey(record)) ?? 0) + 1));
  const seen = new Set<string>();

  const items = records.map((record, index): ImportPreviewItem => {
    const key = recordKey(record);
    const invalid = invalidReasons(record);
    if (invalid.length) return { key: `${key}|${index}`, record, kind: "invalid", label: "Inválido", details: invalid, accepted: false };
    if ((sourceKeys.get(key) ?? 0) > 1 && seen.has(key)) return { key: `${key}|${index}`, record, kind: "duplicate", label: "Duplicidade na planilha", details: ["Outra linha possui o mesmo processo, data de entrada e status."], accepted: rules.duplicatePolicy === "first" ? false : false };
    seen.add(key);
    const existing = movementMap.get(key);
    if (!cases.has(normal(record.judicialNumber))) return { key: `${key}|${index}`, record, kind: "new_case", label: "Novo processo", details: ["Processo e movimentação serão cadastrados."], accepted: true };
    if (!existing) return { key: `${key}|${index}`, record, kind: "new_movement", label: "Nova movimentação", details: ["O processo já existe, mas esta movimentação é nova."], accepted: true };

    const changes = potentialChanges(record, existing);
    const preciseConflict = Boolean(
      (record.receivedTimePrecise && existing.receivedTimePrecise && !sameTimestamp(toStorageTimestamp(record.receivedAt), existing.receivedAt))
      || (record.sentTimePrecise && existing.sentTimePrecise && !sameTimestamp(toStorageTimestamp(record.sentAt), existing.sentAt))
    );
    if (preciseConflict && rules.timestampConflictPolicy === "keep_existing") {
      return { key: `${key}|${index}`, record, kind: "conflict", label: "Conflito de horário", details: ["A planilha e o cadastro possuem horários confirmados diferentes.", ...changes], accepted: rules.existingPolicy === "update_different" ? false : false };
    }
    if (!changes.length || rules.existingPolicy === "skip") return { key: `${key}|${index}`, record, kind: "unchanged", label: rules.existingPolicy === "skip" ? "Registro existente — ignorar" : "Sem alteração", details: changes.length ? changes : ["Os dados relevantes já estão cadastrados."], accepted: false };
    return { key: `${key}|${index}`, record, kind: "update", label: "Atualizar", details: changes, accepted: true };
  });

  const count = (kind: ImportPreviewKind) => items.filter((item) => item.kind === kind).length;
  const strictBlocked = rules.validationMode === "strict" && items.some((item) => item.kind === "invalid" || item.kind === "duplicate" || item.kind === "conflict");
  if (strictBlocked) items.forEach((item) => { item.accepted = false; });

  return {
    items,
    total: items.length,
    accepted: items.filter((item) => item.accepted).length,
    newCases: count("new_case"),
    newMovements: count("new_movement"),
    updates: count("update"),
    unchanged: count("unchanged"),
    duplicates: count("duplicate"),
    conflicts: count("conflict"),
    invalid: count("invalid"),
    preciseReceived: records.filter((record) => record.receivedTimePrecise).length,
    preciseSent: records.filter((record) => record.sentTimePrecise).length,
  };
}

function batchCode(id: number, startedAt = new Date()): string {
  const date = startedAt.toISOString().slice(0, 10).replaceAll("-", "");
  return `IMP-${date}-${String(id).padStart(3, "0")}`;
}

async function snapshotEntity(batchId: number, entityType: "case" | "movement", entityId: number, beforeData: Record<string, unknown> | null): Promise<void> {
  const { client, workspaceId } = await context();
  const { error } = await client.from("import_batch_snapshots").upsert({
    workspace_id: workspaceId,
    batch_id: batchId,
    entity_type: entityType,
    entity_id: entityId,
    before_data: beforeData,
  }, { onConflict: "batch_id,entity_type,entity_id", ignoreDuplicates: true });
  if (error) throw error;
}

async function markSnapshotAfter(batchId: number, entityType: "case" | "movement", entityId: number, updatedAt: string): Promise<void> {
  const { client, workspaceId } = await context();
  const { error } = await client.from("import_batch_snapshots").update({ after_updated_at: updatedAt })
    .eq("workspace_id", workspaceId).eq("batch_id", batchId).eq("entity_type", entityType).eq("entity_id", entityId);
  if (error) throw error;
}

function caseImportValues(record: ImportRecord, batchId: number, fileName: string, userId: string, workspaceId: string) {
  return {
    workspace_id: workspaceId,
    mp_number: record.mpNumber,
    judicial_number: record.judicialNumber,
    class_name: record.className,
    subject: record.subject,
    socially_relevant: record.sociallyRelevant,
    extremely_complex: record.extremelyComplex,
    social_theme: record.socialTheme,
    relevance_reason: record.relevanceReason,
    fundamental_right: record.fundamentalRight,
    affected_group: record.affectedGroup,
    reach: record.reach,
    territorial_scope: record.territorialScope,
    impact_type: record.impactType,
    social_result: record.socialResult,
    sdgs: record.sdgs,
    complexity_reason: record.complexityReason,
    data_origin: "imported",
    source_batch_id: batchId,
    source_file_name: fileName,
    imported_at: new Date().toISOString(),
    created_by: userId,
    updated_by: userId,
  };
}

export async function executeIntelligentImport(
  fileName: string,
  templateName: string,
  preview: ImportPreview,
  rules: IntelligentImportRules,
  onProgress?: (message: string) => void,
): Promise<ImportResult & { batchId: number; batchCode: string }> {
  const { client, userId, workspaceId } = await context();
  if (rules.validationMode === "strict" && (preview.invalid || preview.duplicates || preview.conflicts)) throw new Error("A validação rigorosa bloqueou a importação. Corrija os itens críticos antes de continuar.");
  const accepted = preview.items.filter((item) => item.accepted).map((item) => item.record);
  if (!accepted.length) throw new Error("Nenhum registro está apto para importação.");

  const sourceRecords = accepted.map((record) => ({ judicialNumber: record.judicialNumber, mpNumber: record.mpNumber, receivedDate: localDatePart(record.receivedAt), status: record.workflowStatus }));
  const { data: batchRow, error: batchError } = await client.from("import_batches").insert({
    workspace_id: workspaceId,
    user_id: userId,
    file_name: fileName,
    template_name: templateName,
    status: "processing",
    rules,
    preview: {
      total: preview.total, accepted: preview.accepted, newCases: preview.newCases, newMovements: preview.newMovements,
      updates: preview.updates, unchanged: preview.unchanged, duplicates: preview.duplicates, conflicts: preview.conflicts, invalid: preview.invalid,
    },
    source_records: sourceRecords,
  }).select("id,started_at").single();
  if (batchError) throw batchError;
  const batchId = Number(batchRow.id);
  const code = batchCode(batchId, new Date(batchRow.started_at));
  await client.from("import_batches").update({ batch_code: code }).eq("id", batchId).eq("workspace_id", workspaceId);

  let casesCreated = 0;
  let movementsCreated = 0;
  let movementsUpdated = 0;
  let ignoredRows = preview.total - accepted.length;
  const caseByNumber = new Map<string, Record<string, any>>();

  try {
    onProgress?.("Verificando processos existentes...");
    const judicialNumbers = [...new Set(accepted.map((record) => record.judicialNumber))];
    for (let start = 0; start < judicialNumbers.length; start += 100) {
      const group = judicialNumbers.slice(start, start + 100);
      const { data, error } = await client.from("cases").select("*").eq("workspace_id", workspaceId).in("judicial_number", group);
      if (error) throw error;
      (data ?? []).forEach((item: Record<string, any>) => caseByNumber.set(String(item.judicial_number), item));
    }

    const existingCaseIds = [...caseByNumber.values()].map((item) => Number(item.id));
    const movements: Record<string, any>[] = [];
    for (let start = 0; start < existingCaseIds.length; start += 100) {
      const ids = existingCaseIds.slice(start, start + 100);
      const { data, error } = await client.from("movements").select("*").eq("workspace_id", workspaceId).in("case_id", ids).is("deleted_at", null);
      if (error) throw error;
      movements.push(...(data ?? []));
    }
    const movementByKey = new Map<string, Record<string, any>>();
    const judicialByCase = new Map([...caseByNumber.entries()].map(([number, item]) => [Number(item.id), number]));
    movements.forEach((item) => movementByKey.set(`${judicialByCase.get(Number(item.case_id))}|${localDatePart(item.received_at)}`, item));

    for (let index = 0; index < accepted.length; index += 1) {
      const record = accepted[index];
      onProgress?.(`Importando ${index + 1} de ${accepted.length}...`);
      let caseRow = caseByNumber.get(record.judicialNumber);
      if (!caseRow) {
        const { data, error } = await client.from("cases").insert(caseImportValues(record, batchId, fileName, userId, workspaceId)).select("*").single();
        if (error) throw error;
        caseRow = data;
        caseByNumber.set(record.judicialNumber, caseRow!);
        casesCreated += 1;
        await snapshotEntity(batchId, "case", Number(caseRow!.id), null);
        await markSnapshotAfter(batchId, "case", Number(caseRow!.id), String(caseRow!.updated_at));
      } else if (rules.existingPolicy === "update_different") {
        await snapshotEntity(batchId, "case", Number(caseRow.id), caseRow);
        const caseUpdate: Record<string, unknown> = {
          mp_number: record.mpNumber || caseRow.mp_number,
          class_name: record.className || caseRow.class_name,
          subject: record.subject || caseRow.subject,
          updated_by: userId,
          updated_at: new Date().toISOString(),
          data_origin: "imported",
          source_batch_id: batchId,
          source_file_name: fileName,
          imported_at: new Date().toISOString(),
        };
        const { data, error } = await client.from("cases").update(caseUpdate).eq("workspace_id", workspaceId).eq("id", caseRow.id).select("*").single();
        if (error) throw error;
        caseRow = data;
        caseByNumber.set(record.judicialNumber, caseRow!);
        await markSnapshotAfter(batchId, "case", Number(caseRow!.id), String(caseRow!.updated_at));
      }

      const key = `${record.judicialNumber}|${localDatePart(record.receivedAt)}`;
      const existing = movementByKey.get(key);
      const receivedAt = toStorageTimestamp(record.receivedAt);
      if (!receivedAt) throw new Error(`Entrada inválida no processo ${record.judicialNumber}.`);
      const informedSentAt = toStorageTimestamp(record.sentAt);
      const estimatedSentAt = record.workflowStatus === "Enviado" && !informedSentAt && rules.estimateMissingSentAt
        ? new Date(new Date(receivedAt).getTime() + 10 * 86_400_000).toISOString()
        : informedSentAt;
      const assignedTo = record.assignedTo || (rules.useCurrentUserWhenAssigneeMissing ? userId : null);
      if (!assignedTo) throw new Error(`Responsável ausente no processo ${record.judicialNumber}.`);

      if (!existing) {
        const { data, error } = await client.from("movements").insert({
          workspace_id: workspaceId,
          case_id: Number(caseRow!.id),
          received_at: receivedAt,
          received_time_precise: Boolean(record.receivedTimePrecise),
          received_origin: record.receivedTimePrecise ? "imported_confirmed" : "imported_date_only",
          deadline_at: record.deadlineAt || null,
          draft_status: record.draftStatus,
          workflow_status: record.workflowStatus,
          sent_at: estimatedSentAt,
          sent_time_precise: Boolean(informedSentAt && record.sentTimePrecise),
          sent_origin: informedSentAt && record.sentTimePrecise ? "imported_confirmed" : estimatedSentAt ? "system_estimated" : "not_informed",
          action_type: record.actionType,
          notes: record.notes,
          priority: record.priority,
          document_path: record.documentPath,
          elapsed_hours: usefulElapsedHours(receivedAt, estimatedSentAt),
          assigned_to: assignedTo,
          data_origin: "imported",
          source_batch_id: batchId,
          source_file_name: fileName,
          imported_at: new Date().toISOString(),
          created_by: userId,
          updated_by: userId,
        }).select("*").single();
        if (error) throw error;
        movementsCreated += 1;
        movementByKey.set(key, data!);
        await snapshotEntity(batchId, "movement", Number(data!.id), null);
        await markSnapshotAfter(batchId, "movement", Number(data!.id), String(data!.updated_at));
        continue;
      }

      if (rules.existingPolicy === "skip") {
        ignoredRows += 1;
        continue;
      }

      const update: Record<string, unknown> = {};
      const canReplaceReceived = !existing.received_time_precise || rules.existingPolicy === "update_different" && rules.timestampConflictPolicy === "use_imported";
      const canReplaceSent = !existing.sent_time_precise || rules.existingPolicy === "update_different" && rules.timestampConflictPolicy === "use_imported";
      if (record.receivedTimePrecise && canReplaceReceived) {
        update.received_at = receivedAt;
        update.received_time_precise = true;
        update.received_origin = "imported_confirmed";
      }
      if (informedSentAt && record.sentTimePrecise && canReplaceSent) {
        update.sent_at = informedSentAt;
        update.sent_time_precise = true;
        update.sent_origin = "imported_confirmed";
      }
      if (rules.existingPolicy === "update_different") {
        update.deadline_at = record.deadlineAt || null;
        update.draft_status = record.draftStatus;
        update.workflow_status = record.workflowStatus;
        update.action_type = record.actionType;
        update.priority = record.priority;
        if (record.notes) update.notes = record.notes;
        if (record.documentPath) update.document_path = record.documentPath;
        update.assigned_to = assignedTo;
      } else {
        if (!normal(existing.action_type) && normal(record.actionType)) update.action_type = record.actionType;
        if (!existing.deadline_at && record.deadlineAt) update.deadline_at = record.deadlineAt;
        if (!normal(existing.notes) && normal(record.notes)) update.notes = record.notes;
      }

      if (!Object.keys(update).length) {
        ignoredRows += 1;
        continue;
      }
      await snapshotEntity(batchId, "movement", Number(existing.id), existing);
      const finalReceived = String(update.received_at ?? existing.received_at);
      const finalSent = (update.sent_at ?? existing.sent_at) as string | null;
      update.elapsed_hours = usefulElapsedHours(finalReceived, finalSent);
      update.updated_by = userId;
      update.updated_at = new Date().toISOString();
      update.data_origin = "imported";
      update.source_batch_id = batchId;
      update.source_file_name = fileName;
      update.imported_at = new Date().toISOString();
      const { data, error } = await client.from("movements").update(update).eq("workspace_id", workspaceId).eq("id", existing.id).select("*").single();
      if (error) throw error;
      movementsUpdated += 1;
      movementByKey.set(key, data!);
      await markSnapshotAfter(batchId, "movement", Number(data!.id), String(data!.updated_at));
    }

    const result: ImportResult = {
      casesCreated,
      movementsCreated,
      movementsUpdated,
      duplicatesLinked: accepted.length - casesCreated,
      ignoredRows,
    };
    const { error: finishError } = await client.from("import_batches").update({ status: "completed", completed_at: new Date().toISOString(), result }).eq("workspace_id", workspaceId).eq("id", batchId);
    if (finishError) throw finishError;
    await client.rpc("record_admin_audit", { audit_event: "import_batch_completed", audit_details: { batch_id: batchId, batch_code: code, file_name: fileName, ...result } });
    onProgress?.("Importação concluída.");
    return { ...result, batchId, batchCode: code };
  } catch (error) {
    await client.from("import_batches").update({ status: "failed", completed_at: new Date().toISOString(), error_message: String(error) }).eq("workspace_id", workspaceId).eq("id", batchId);
    throw error;
  }
}

export async function listImportBatches(limit = 50): Promise<ImportBatchEntry[]> {
  const { client, workspaceId } = await context();
  const { data, error } = await client.from("import_batches").select("id,batch_code,file_name,template_name,status,started_at,completed_at,reverted_at,result,preview,error_message,actor:profiles!import_batches_user_id_fkey(full_name)")
    .eq("workspace_id", workspaceId).order("started_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []).map((item: Record<string, any>) => {
    const actor = Array.isArray(item.actor) ? item.actor[0] : item.actor;
    return {
      id: Number(item.id), batchCode: String(item.batch_code ?? `IMP-${item.id}`), fileName: String(item.file_name ?? ""), templateName: String(item.template_name ?? ""),
      status: item.status, startedAt: String(item.started_at), completedAt: item.completed_at ? String(item.completed_at) : null,
      revertedAt: item.reverted_at ? String(item.reverted_at) : null, actorName: String(actor?.full_name ?? ""),
      result: item.result ?? {}, preview: item.preview ?? {}, errorMessage: String(item.error_message ?? ""),
    };
  });
}

export async function revertImportBatch(batchId: number): Promise<ImportRevertResult> {
  const { client } = await context();
  const { data, error } = await client.rpc("revert_import_batch_v0102", { target_batch_id: batchId });
  if (error) throw error;
  const value = (data ?? {}) as Record<string, unknown>;
  return {
    restoredMovements: Number(value.restored_movements ?? 0),
    deletedMovements: Number(value.deleted_movements ?? 0),
    restoredCases: Number(value.restored_cases ?? 0),
    deletedCases: Number(value.deleted_cases ?? 0),
    skipped: Number(value.skipped ?? 0),
  };
}

export async function getMovementProvenance(movementId: number): Promise<MovementProvenance | null> {
  const { client, workspaceId } = await context();
  const { data, error } = await client.from("movements").select("data_origin,source_file_name,imported_at,received_origin,sent_origin,source_batch_id,import_batches!movements_source_batch_id_fkey(batch_code)")
    .eq("workspace_id", workspaceId).eq("id", movementId).maybeSingle();
  if (error) return null;
  if (!data) return null;
  const batch = Array.isArray((data as any).import_batches) ? (data as any).import_batches[0] : (data as any).import_batches;
  return {
    dataOrigin: String((data as any).data_origin ?? "manual"),
    sourceFileName: String((data as any).source_file_name ?? ""),
    importedAt: (data as any).imported_at ? String((data as any).imported_at) : null,
    receivedOrigin: String((data as any).received_origin ?? "manual"),
    sentOrigin: String((data as any).sent_origin ?? "manual"),
    batchCode: String(batch?.batch_code ?? ""),
  };
}
