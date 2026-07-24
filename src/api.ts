import { requireSupabase } from "./supabase";
import { localDatePart, toStorageTimestamp, usefulElapsedHours } from "./date";
import type { AdminAuditEntry, BackupInfo, BackupStatus, CalendarExclusion, CalendarExclusionRange, ChangeHistory, ClassSetting, ImportRecord, ImportResult, MovementQuery, PagedMovements, PraxisRole, ProcessEditData, ProcessFormData, ProcessMovement, StorageDirectoryKind, StorageSettings, TeamComparison, TeamMember, WorkflowStatus } from "./types";

let workspacePromise: Promise<string> | null = null;

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

function requiredTimestamp(value: string, fieldName: string): string {
  const timestamp = toStorageTimestamp(value);
  if (!timestamp) throw new Error(`${fieldName} possui data ou horário inválido.`);
  return timestamp;
}

async function context() {
  const client = requireSupabase();
  const { data: userData, error: userError } = await client.auth.getUser();
  fail(userError);
  if (!userData.user) throw new Error("Sessão expirada. Entre novamente.");
  if (!workspacePromise) workspacePromise = (async () => {
    const { data: profile, error: profileError } = await client.from("profiles").select("current_workspace_id").eq("id", userData.user!.id).single();
    fail(profileError);
    if (profile?.current_workspace_id) return profile.current_workspace_id as string;
    const { data, error } = await client.from("workspace_members").select("workspace_id").eq("user_id", userData.user!.id).eq("active", true).limit(1).single();
    fail(error);
    if (!data?.workspace_id) throw new Error("Sua conta ainda não possui um espaço de trabalho.");
    return data.workspace_id as string;
  })();
  return { client, user: userData.user, workspaceId: await workspacePromise };
}

function caseRow(row: Record<string, any>): Record<string, any> {
  const value = row.cases;
  return Array.isArray(value) ? (value[0] ?? {}) : (value ?? {});
}

function movementFromRow(row: Record<string, any>, excludedDates: ReadonlySet<string> = new Set()): ProcessMovement {
  const item = caseRow(row);
  const assigneeValue = row.assignee;
  const assignee = Array.isArray(assigneeValue) ? (assigneeValue[0] ?? {}) : (assigneeValue ?? {});
  return {
    movementId: Number(row.id), caseId: Number(row.case_id),
    mpNumber: item.mp_number ?? "", judicialNumber: item.judicial_number ?? "",
    className: item.class_name ?? "", subject: item.subject ?? "",
    receivedAt: row.received_at, receivedTimePrecise: Boolean(row.received_time_precise), deadlineAt: row.deadline_at ?? "",
    draftStatus: row.draft_status ?? "Pendente", workflowStatus: row.workflow_status,
    sentAt: row.sent_at, sentTimePrecise: Boolean(row.sent_time_precise), actionType: row.action_type ?? "", notes: row.notes ?? "",
    priority: row.priority ?? "Normal", documentPath: row.document_path ?? "",
    elapsedHours: usefulElapsedHours(row.received_at, row.sent_at, excludedDates),
    sociallyRelevant: Boolean(item.socially_relevant), extremelyComplex: Boolean(item.extremely_complex),
    socialTheme: item.social_theme ?? "", relevanceReason: item.relevance_reason ?? "",
    fundamentalRight: item.fundamental_right ?? "", affectedGroup: item.affected_group ?? "",
    reach: item.reach ?? "", territorialScope: item.territorial_scope ?? "",
    impactType: item.impact_type ?? "", socialResult: item.social_result ?? "", sdgs: Array.isArray(item.sdgs) ? item.sdgs : [],
    complexityReason: item.complexity_reason ?? "", deletedAt: row.deleted_at,
    assignedTo: row.assigned_to ?? "", assignedName: assignee.full_name ?? "",
  };
}

function caseValues(data: ProcessFormData | ProcessEditData) {
  return {
    class_name: data.className, subject: data.subject,
    socially_relevant: data.sociallyRelevant, extremely_complex: data.extremelyComplex,
    social_theme: data.socialTheme, relevance_reason: data.relevanceReason,
    fundamental_right: data.fundamentalRight, affected_group: data.affectedGroup,
    reach: data.reach, territorial_scope: data.territorialScope,
    impact_type: data.impactType, social_result: data.socialResult, sdgs: data.sdgs,
    complexity_reason: data.complexityReason,
  };
}

const SELECT_MOVEMENT = "*, cases(*), assignee:profiles!movements_assigned_to_fkey(id, full_name)";

export async function listMovements(): Promise<ProcessMovement[]> {
  const { client, workspaceId } = await context();
  const { data: exclusions, error: exclusionsError } = await client.from("calendar_exclusions").select("date").eq("workspace_id", workspaceId);
  fail(exclusionsError);
  const excludedDates = new Set<string>((exclusions ?? []).map((item: { date: string }) => item.date));
  const rows: Record<string, any>[] = [];
  const pageSize = 1000;
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await client.from("movements").select(SELECT_MOVEMENT)
      .eq("workspace_id", workspaceId).is("deleted_at", null)
      .order("received_at", { ascending: false }).order("id", { ascending: false })
      .range(start, start + pageSize - 1);
    fail(error);
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < pageSize) break;
  }
  return rows.map((row) => movementFromRow(row, excludedDates));
}

function filterRecords(records: ProcessMovement[], filters: MovementQuery, currentUserId = ""): ProcessMovement[] {
  return records.filter((record) => {
    if (record.deletedAt) return false;
    if (filters.queueOnly && (record.workflowStatus === "Enviado" || record.assignedTo !== currentUserId)) return false;
    if (filters.status !== "Todos" && record.workflowStatus !== filters.status) return false;
    if (filters.year !== "Todos" && Number(localDatePart(record.receivedAt).slice(0, 4)) !== Number(filters.year)) return false;
    if (filters.classification === "Relevância social" && !record.sociallyRelevant) return false;
    if (filters.classification === "Alta complexidade" && !record.extremelyComplex) return false;
    if (filters.classification === "Ambos" && !(record.sociallyRelevant && record.extremelyComplex)) return false;
    if (filters.assignedTo === "Sem responsável" && record.assignedTo) return false;
    if (filters.assignedTo && filters.assignedTo !== "Todos" && filters.assignedTo !== "Sem responsável" && record.assignedTo !== filters.assignedTo) return false;
    const query = filters.query.trim().toLocaleLowerCase("pt-BR");
    return !query || `${record.mpNumber} ${record.judicialNumber} ${record.className} ${record.subject} ${record.actionType}`.toLocaleLowerCase("pt-BR").includes(query);
  }).sort((a, b) => {
    const field = filters.sortField;
    const comparison = field === "receivedAt" || field === "deadlineAt"
      ? new Date(a[field]).getTime() - new Date(b[field]).getTime()
      : String(a[field]).localeCompare(String(b[field]), "pt-BR", { numeric: true, sensitivity: "base" });
    return filters.sortDirection === "asc" ? comparison : -comparison;
  });
}

export async function listMovementPage(filters: MovementQuery): Promise<PagedMovements> {
  const { user } = await context();
  const all = await listMovements();
  const filtered = filterRecords(all, filters, user.id);
  const start = (filters.page - 1) * filters.pageSize;
  const years = [...new Set(all.map((record) => Number(localDatePart(record.receivedAt).slice(0, 4))).filter(Number.isFinite))].sort((a, b) => b - a);
  return { records: filtered.slice(start, start + filters.pageSize), total: filtered.length, years };
}

export async function listFilteredMovements(filters: MovementQuery): Promise<ProcessMovement[]> {
  const { user } = await context();
  return filterRecords(await listMovements(), filters, user.id);
}

async function findOrCreateCase(data: ProcessFormData | ImportRecord): Promise<{ id: number; created: boolean }> {
  const { client, user, workspaceId } = await context();
  const { data: existing, error: findError } = await client.from("cases").select("id").eq("workspace_id", workspaceId).eq("judicial_number", data.judicialNumber).maybeSingle();
  fail(findError);
  if (existing) return { id: Number(existing.id), created: false };
  const { data: created, error } = await client.from("cases").insert({
    workspace_id: workspaceId, mp_number: data.mpNumber, judicial_number: data.judicialNumber,
    ...caseValues(data), created_by: user.id, updated_by: user.id,
  }).select("id").single();
  fail(error);
  return { id: Number(created!.id), created: true };
}

export async function createMovement(data: ProcessFormData): Promise<ProcessMovement> {
  const { client, user, workspaceId } = await context();
  const found = await findOrCreateCase(data);
  const receivedAt = requiredTimestamp(data.receivedAt, "A entrada");
  const { data: row, error } = await client.from("movements").insert({
    workspace_id: workspaceId, case_id: found.id, received_at: receivedAt, received_time_precise: data.receivedTimePrecise ?? true,
    deadline_at: data.deadlineAt || null, action_type: data.actionType, notes: data.notes,
    priority: data.priority, document_path: data.documentPath,
    assigned_to: data.assignedTo || user.id,
    created_by: user.id, updated_by: user.id,
  }).select(SELECT_MOVEMENT).single();
  fail(error);
  return movementFromRow(row!);
}

export async function updateMovementStatus(movementId: number, status: WorkflowStatus, actionType?: string): Promise<void> {
  const { client, user, workspaceId } = await context();
  const { data: old, error: oldError } = await client.from("movements").select("workflow_status, action_type, received_at").eq("workspace_id", workspaceId).eq("id", movementId).single();
  fail(oldError);
  const sentAt = status === "Enviado" ? new Date().toISOString() : null;
  const elapsed = usefulElapsedHours(old!.received_at, sentAt);
  const values: Record<string, any> = { workflow_status: status, updated_by: user.id, updated_at: new Date().toISOString(), row_version: undefined };
  delete values.row_version;
  if (actionType !== undefined) values.action_type = actionType;
  if (status === "Minutado" || status === "Enviado") values.draft_status = "Minutado";
  if (status === "Enviado") { values.sent_at = sentAt; values.sent_time_precise = true; values.elapsed_hours = elapsed; }
  else { values.sent_at = null; values.sent_time_precise = false; values.elapsed_hours = null; }
  const { error } = await client.from("movements").update(values).eq("workspace_id", workspaceId).eq("id", movementId);
  fail(error);
  await client.from("change_history").insert({ workspace_id: workspaceId, movement_id: movementId, changed_by: user.id, field_name: "Status", old_value: old!.workflow_status, new_value: status });
}

export async function updateMovementAction(movementId: number, actionType: string): Promise<void> {
  const { client, user, workspaceId } = await context();
  const { data: old } = await client.from("movements").select("action_type").eq("workspace_id", workspaceId).eq("id", movementId).single();
  const { error } = await client.from("movements").update({ action_type: actionType, updated_by: user.id, updated_at: new Date().toISOString() }).eq("workspace_id", workspaceId).eq("id", movementId);
  fail(error);
  await client.from("change_history").insert({ workspace_id: workspaceId, movement_id: movementId, changed_by: user.id, field_name: "Providência", old_value: old?.action_type ?? "", new_value: actionType });
}

export async function updateMovementAssignment(movementId: number, assignedTo: string): Promise<void> {
  await updateMovementAssignments([movementId], assignedTo);
}

export async function updateMovementAssignments(movementIds: number[], assignedTo: string): Promise<void> {
  if (!movementIds.length) return;
  const { client, user, workspaceId } = await context();
  const { data: current, error: currentError } = await client.from("movements").select("id, assigned_to").eq("workspace_id", workspaceId).in("id", movementIds);
  fail(currentError);
  const { error } = await client.from("movements").update({ assigned_to: assignedTo, updated_by: user.id, updated_at: new Date().toISOString() }).eq("workspace_id", workspaceId).in("id", movementIds);
  fail(error);
  const names = new Map((current ?? []).map((item: Record<string, any>) => [Number(item.id), item.assigned_to ?? ""]));
  const history = movementIds.filter((id) => names.get(id) !== assignedTo).map((id) => ({
    workspace_id: workspaceId, movement_id: id, changed_by: user.id, field_name: "Responsável",
    old_value: names.get(id) ?? "", new_value: assignedTo,
  }));
  if (history.length) await client.from("change_history").insert(history);
}

export async function deleteMovement(movementId: number): Promise<void> {
  const { client, user, workspaceId } = await context();
  const { error } = await client.from("movements").update({ deleted_at: new Date().toISOString(), updated_by: user.id }).eq("workspace_id", workspaceId).eq("id", movementId);
  fail(error);
}

export async function listDeletedMovements(): Promise<ProcessMovement[]> {
  const { client, workspaceId } = await context();
  const { data, error } = await client.from("movements").select(SELECT_MOVEMENT).eq("workspace_id", workspaceId).not("deleted_at", "is", null).order("deleted_at", { ascending: false });
  fail(error);
  return (data ?? []).map((row: Record<string, any>) => movementFromRow(row));
}

export async function restoreDeletedMovement(movementId: number): Promise<void> {
  const { client, user, workspaceId } = await context();
  const { error } = await client.from("movements").update({ deleted_at: null, updated_by: user.id }).eq("workspace_id", workspaceId).eq("id", movementId);
  fail(error);
}

export async function permanentlyDeleteMovement(movementId: number): Promise<void> {
  const { client, workspaceId } = await context();
  const { error } = await client.from("movements").delete().eq("workspace_id", workspaceId).eq("id", movementId);
  fail(error);
}

export async function updateMovement(movementId: number, data: ProcessEditData): Promise<void> {
  const { client, user, workspaceId } = await context();
  const { data: current, error: currentError } = await client.from("movements").select(SELECT_MOVEMENT).eq("workspace_id", workspaceId).eq("id", movementId).single();
  fail(currentError);
  const old = movementFromRow(current!);
  const { error: caseError } = await client.from("cases").update({ ...caseValues(data), updated_by: user.id, updated_at: new Date().toISOString() }).eq("workspace_id", workspaceId).eq("id", old.caseId);
  fail(caseError);
  const receivedAt = requiredTimestamp(data.receivedAt, "A entrada");
  const sentAt = toStorageTimestamp(data.sentAt);
  const elapsedHours = usefulElapsedHours(receivedAt, sentAt);
  const movementValues: Record<string, unknown> = {
    received_at: receivedAt,
    received_time_precise: Boolean(data.receivedTimePrecise),
    deadline_at: data.deadlineAt || null,
    sent_at: sentAt,
    sent_time_precise: Boolean(sentAt && data.sentTimePrecise),
    elapsed_hours: elapsedHours,
    action_type: data.actionType,
    notes: data.notes,
    priority: data.priority,
    document_path: data.documentPath,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  };
  if (data.assignedTo && data.assignedTo !== old.assignedTo) movementValues.assigned_to = data.assignedTo;
  const { error } = await client.from("movements").update(movementValues).eq("workspace_id", workspaceId).eq("id", movementId);
  fail(error);
  const changes: Array<[string, unknown, unknown]> = [
    ["Classe", old.className, data.className], ["Assunto", old.subject, data.subject],
    ["Entrada", old.receivedAt, receivedAt], ["Prazo", old.deadlineAt, data.deadlineAt], ["Providência", old.actionType, data.actionType],
    ["Data de envio", old.sentAt, sentAt],
    ["Observações", old.notes, data.notes], ["Prioridade", old.priority, data.priority],
    ["Responsável", old.assignedTo, data.assignedTo],
    ["Relevância social", old.sociallyRelevant, data.sociallyRelevant],
    ["Impacto social esperado", old.socialResult, data.socialResult],
    ["ODS da ONU", old.sdgs.join("; "), data.sdgs.join("; ")],
    ["Alta complexidade", old.extremelyComplex, data.extremelyComplex],
  ];
  const rows = changes.filter(([, before, after]) => String(before) !== String(after)).map(([field, before, after]) => ({ workspace_id: workspaceId, movement_id: movementId, changed_by: user.id, field_name: field, old_value: String(before ?? ""), new_value: String(after ?? "") }));
  if (rows.length) await client.from("change_history").insert(rows);
}

export async function clearDatabase(): Promise<string> {
  const { client, workspaceId } = await context();
  await createBackup();
  const { error } = await client.from("cases").delete().eq("workspace_id", workspaceId).gte("id", 0);
  fail(error);
  await recordAdminAudit("database_cleared", { source: "interface" });
  return "Todos os processos do espaço de trabalho foram removidos.";
}

export async function listClassSettings(): Promise<ClassSetting[]> {
  const { client, workspaceId } = await context();
  const { data, error } = await client.from("class_settings").select("name, business_days").eq("workspace_id", workspaceId).order("name");
  fail(error);
  return (data ?? []).map((item: Record<string, any>) => ({ name: item.name, businessDays: item.business_days }));
}

export async function saveClassSetting(setting: ClassSetting): Promise<void> {
  const { client, workspaceId } = await context();
  const { error } = await client.from("class_settings").upsert({ workspace_id: workspaceId, name: setting.name, business_days: setting.businessDays });
  fail(error);
}

export async function deleteClassSetting(name: string): Promise<void> {
  const { client, workspaceId } = await context();
  const { error } = await client.from("class_settings").delete().eq("workspace_id", workspaceId).eq("name", name);
  fail(error);
}

function batches<T>(items: T[], size = 100): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

export async function importRecords(records: ImportRecord[], onProgress?: (message: string) => void): Promise<ImportResult> {
  const { client, user, workspaceId } = await context();
  let casesCreated = 0, movementsCreated = 0, movementsUpdated = 0, ignoredRows = 0;
  const uniqueCases = new Map<string, ImportRecord>();
  for (const record of records) if (!uniqueCases.has(record.judicialNumber)) uniqueCases.set(record.judicialNumber, record);

  onProgress?.("Verificando processos já cadastrados...");
  const caseIds = new Map<string, number>();
  for (const numbers of batches([...uniqueCases.keys()])) {
    const { data, error } = await client.from("cases").select("id, judicial_number")
      .eq("workspace_id", workspaceId).in("judicial_number", numbers);
    fail(error);
    for (const item of data ?? []) caseIds.set(item.judicial_number, Number(item.id));
  }

  const missingCases = [...uniqueCases.entries()].filter(([number]) => !caseIds.has(number));
  for (const group of batches(missingCases)) {
    onProgress?.(`Cadastrando processos (${Math.min(casesCreated + group.length, missingCases.length)} de ${missingCases.length})...`);
    const rows = group.map(([, record]) => ({
      workspace_id: workspaceId, mp_number: record.mpNumber, judicial_number: record.judicialNumber,
      ...caseValues(record), created_by: user.id, updated_by: user.id,
    }));
    const { data, error } = await client.from("cases").insert(rows).select("id, judicial_number");
    fail(error);
    for (const item of data ?? []) caseIds.set(item.judicial_number, Number(item.id));
    casesCreated += data?.length ?? 0;
  }

  type ExistingMovement = {
    id: number; case_id: number; received_at: string; sent_at: string | null; workflow_status: WorkflowStatus;
    received_time_precise: boolean | null; sent_time_precise: boolean | null;
  };
  const existingMovements = new Map<string, ExistingMovement>();
  const relevantCaseIds = [...new Set(caseIds.values())];
  onProgress?.("Verificando movimentações e horários já cadastrados...");
  for (const ids of batches(relevantCaseIds)) {
    const { data, error } = await client.from("movements")
      .select("id, case_id, received_at, sent_at, workflow_status, received_time_precise, sent_time_precise")
      .eq("workspace_id", workspaceId).in("case_id", ids).limit(10000);
    fail(error);
    for (const item of (data ?? []) as ExistingMovement[]) {
      const key = `${item.case_id}|${localDatePart(item.received_at)}|${item.workflow_status}`;
      if (!existingMovements.has(key)) existingMovements.set(key, item);
    }
  }

  const movementRows: Record<string, unknown>[] = [];
  for (const record of records) {
    const caseId = caseIds.get(record.judicialNumber);
    if (!caseId) throw new Error(`Não foi possível localizar o processo ${record.judicialNumber}.`);

    const receivedAt = requiredTimestamp(record.receivedAt, `A entrada do processo ${record.judicialNumber}`);
    const informedSentAt = toStorageTimestamp(record.sentAt);
    const duplicateKey = `${caseId}|${localDatePart(receivedAt)}|${record.workflowStatus}`;
    const existing = existingMovements.get(duplicateKey);

    if (existing) {
      const values: Record<string, unknown> = {};
      if (record.receivedTimePrecise && !existing.received_time_precise) {
        values.received_at = receivedAt;
        values.received_time_precise = true;
      }
      if (record.sentTimePrecise && informedSentAt && !existing.sent_time_precise) {
        values.sent_at = informedSentAt;
        values.sent_time_precise = true;
      }
      if (Object.keys(values).length) {
        const finalReceived = String(values.received_at ?? existing.received_at);
        const finalSent = (values.sent_at ?? existing.sent_at) as string | null;
        values.elapsed_hours = usefulElapsedHours(finalReceived, finalSent);
        values.updated_by = user.id;
        values.updated_at = new Date().toISOString();
        const { error } = await client.from("movements").update(values)
          .eq("workspace_id", workspaceId).eq("id", existing.id);
        fail(error);
        movementsUpdated += 1;
      } else {
        ignoredRows += 1;
      }
      continue;
    }

    const automaticSentAt = record.workflowStatus === "Enviado" && !informedSentAt
      ? new Date(new Date(receivedAt).getTime() + 10 * 86_400_000).toISOString()
      : informedSentAt;
    movementRows.push({
      workspace_id: workspaceId, case_id: caseId,
      received_at: receivedAt, received_time_precise: Boolean(record.receivedTimePrecise),
      deadline_at: record.deadlineAt || null, draft_status: record.draftStatus,
      workflow_status: record.workflowStatus, sent_at: automaticSentAt,
      sent_time_precise: Boolean(informedSentAt && record.sentTimePrecise),
      action_type: record.actionType, notes: record.notes, priority: record.priority,
      document_path: record.documentPath, elapsed_hours: usefulElapsedHours(receivedAt, automaticSentAt),
      assigned_to: record.assignedTo || user.id,
      created_by: user.id, updated_by: user.id,
    });
    existingMovements.set(duplicateKey, {
      id: -1, case_id: caseId, received_at: receivedAt, sent_at: automaticSentAt,
      workflow_status: record.workflowStatus, received_time_precise: Boolean(record.receivedTimePrecise),
      sent_time_precise: Boolean(informedSentAt && record.sentTimePrecise),
    });
  }

  for (const group of batches(movementRows)) {
    const { error } = await client.from("movements").insert(group);
    fail(error);
    movementsCreated += group.length;
    onProgress?.(`Gravando movimentações (${movementsCreated} de ${movementRows.length})...`);
  }
  const duplicatesLinked = records.length - casesCreated;
  onProgress?.("Importação concluída.");
  return { casesCreated, movementsCreated, movementsUpdated, duplicatesLinked, ignoredRows };
}

function download(bytes: BlobPart, type: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = fileName; anchor.click(); URL.revokeObjectURL(url);
}

export async function createBackup(): Promise<string> {
  const records = await listMovements();
  download(JSON.stringify({ createdAt: new Date().toISOString(), records }, null, 2), "application/json", `praxis-online-backup-${new Date().toISOString().slice(0, 10)}.json`);
  await recordAdminAudit("backup_created", { records: records.length });
  return "Cópia JSON baixada para este computador.";
}

export async function getBackupStatus(): Promise<BackupStatus> {
  return { hasValidBackup: false, lastValidAt: null, backupType: null, path: null, sizeBytes: null, integrityResult: null, lastAttemptAt: null, lastAttemptOk: null, message: "O plano gratuito exige cópias manuais externas." };
}

export async function databaseInfo(): Promise<string> { return "Práxis Online · PostgreSQL no Supabase · acesso protegido por usuário e RLS"; }

export async function saveExport(bytes: number[]): Promise<string> {
  download(new Uint8Array(bytes), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", `processos-exportados-${new Date().toISOString().slice(0, 10)}.xlsx`);
  return "Planilha baixada pelo navegador.";
}

export async function savePdf(bytes: number[], fileName: string): Promise<string> {
  download(new Uint8Array(bytes), "application/pdf", fileName);
  return `Relatório PDF baixado: ${fileName}`;
}

export async function listBackups(): Promise<BackupInfo[]> { return []; }
export async function restoreBackup(file: File): Promise<string> {
  const parsed = JSON.parse(await file.text()) as { records?: ProcessMovement[] };
  if (!Array.isArray(parsed.records) || !parsed.records.length) throw new Error("O arquivo não contém um backup válido do Práxis.");
  const invalid = parsed.records.find((item) => !item.judicialNumber || !item.receivedAt);
  if (invalid) throw new Error("O backup possui registros incompletos e não pode ser restaurado com segurança.");
  const activeMemberIds = new Set((await listTeamMembers()).filter((item) => item.active).map((item) => item.userId));
  const records: ImportRecord[] = parsed.records.map((item) => ({
    assignedTo: activeMemberIds.has(item.assignedTo) ? item.assignedTo : undefined, mpNumber: item.mpNumber, judicialNumber: item.judicialNumber,
    className: item.className, subject: item.subject, receivedAt: item.receivedAt, receivedTimePrecise: item.receivedTimePrecise, deadlineAt: item.deadlineAt?.slice(0, 10) ?? "",
    draftStatus: item.draftStatus, workflowStatus: item.workflowStatus, sentAt: item.sentAt, sentTimePrecise: item.sentTimePrecise,
    actionType: item.actionType, notes: item.notes, priority: item.priority, documentPath: item.documentPath,
    sociallyRelevant: item.sociallyRelevant, extremelyComplex: item.extremelyComplex, socialTheme: item.socialTheme,
    relevanceReason: item.relevanceReason, fundamentalRight: item.fundamentalRight, affectedGroup: item.affectedGroup,
    reach: item.reach, territorialScope: item.territorialScope, impactType: item.impactType, socialResult: item.socialResult,
    sdgs: Array.isArray(item.sdgs) ? item.sdgs : [],
    complexityReason: item.complexityReason,
  }));
  await createBackup();
  const { client, workspaceId } = await context();
  const { error } = await client.from("cases").delete().eq("workspace_id", workspaceId).gte("id", 0); fail(error);
  const result = await importRecords(records);
  await recordAdminAudit("backup_restored", { file: file.name, records: result.movementsCreated });
  return `Backup restaurado: ${result.movementsCreated} movimentação(ões) recuperada(s).`;
}

export async function listCalendarExclusions(): Promise<CalendarExclusion[]> {
  const { client, workspaceId } = await context();
  const { data, error } = await client.from("calendar_exclusions").select("date, label").eq("workspace_id", workspaceId).order("date");
  fail(error); return data ?? [];
}

export async function saveCalendarExclusion(data: CalendarExclusionRange): Promise<void> {
  const { client, workspaceId } = await context();
  const current = new Date(`${data.startDate}T12:00:00`), end = new Date(`${data.endDate}T12:00:00`);
  const rows = [];
  while (current <= end) {
    rows.push({ workspace_id: workspaceId, date: `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}-${String(current.getDate()).padStart(2, "0")}`, label: data.label });
    current.setDate(current.getDate() + 1);
  }
  const { error } = await client.from("calendar_exclusions").upsert(rows); fail(error);
}

export async function deleteCalendarExclusion(date: string): Promise<void> {
  const { client, workspaceId } = await context();
  const { error } = await client.from("calendar_exclusions").delete().eq("workspace_id", workspaceId).eq("date", date); fail(error);
}

export async function listChangeHistory(movementId: number): Promise<ChangeHistory[]> {
  const { client, workspaceId } = await context();
  const { data, error } = await client.from("change_history").select("id, movement_id, changed_at, field_name, old_value, new_value").eq("workspace_id", workspaceId).eq("movement_id", movementId).order("changed_at", { ascending: false });
  fail(error);
  return (data ?? []).map((item: Record<string, any>) => ({ id: Number(item.id), movementId: Number(item.movement_id), changedAt: item.changed_at, fieldName: item.field_name, oldValue: item.old_value, newValue: item.new_value }));
}

export async function getStorageSettings(): Promise<StorageSettings> {
  return { backupDirectory: "Downloads do navegador", exportDirectory: "Downloads do navegador", reportDirectory: "Downloads do navegador", backupCustom: false, exportCustom: false, reportCustom: false };
}
export async function saveStorageDirectory(_kind: StorageDirectoryKind, _path: string | null): Promise<void> { throw new Error("No navegador, a pasta é definida nas configurações de download."); }
export async function chooseStorageDirectory(_currentPath?: string): Promise<string | null> { return null; }

export async function listTeamMembers(): Promise<TeamMember[]> {
  const { client } = await context();
  const { data, error } = await client.rpc("list_current_workspace_members");
  fail(error);
  return (data ?? []).map((item: Record<string, any>) => ({
    userId: item.user_id,
    fullName: item.full_name,
    email: item.email,
    role: item.role,
    active: item.active,
    mfaRequired: Boolean(item.mfa_required),
    historicalCoverageSince: item.historico_disponivel_desde ?? null,
  }));
}

export async function createManagedTeamMember(values: {
  fullName: string;
  email: string;
  role: PraxisRole;
  historicalCoverageSince: string | null;
  delivery: "email" | "link";
}): Promise<{ link: string | null; emailSent: boolean }> {
  const { client } = await context();
  const { data, error } = await client.functions.invoke("admin-manage-user", {
    body: {
      action: "create_member",
      fullName: values.fullName.trim(),
      email: values.email.trim(),
      role: values.role,
      historicalCoverageSince: values.historicalCoverageSince || null,
      delivery: values.delivery,
      redirectTo: window.location.origin,
    },
  });
  if (error) throw new Error(`Não foi possível cadastrar o usuário. ${error.message}`);
  if (data?.error) throw new Error(String(data.error));
  workspacePromise = null;
  return { link: data?.link ?? null, emailSent: Boolean(data?.emailSent) };
}

export async function recordAdminAudit(eventType: string, details: Record<string, unknown> = {}): Promise<void> {
  const { client } = await context();
  const { error } = await client.rpc("record_admin_audit", { audit_event: eventType, audit_details: details });
  fail(error);
}

export async function listAdminAudit(): Promise<AdminAuditEntry[]> {
  const { client } = await context();
  const { data, error } = await client.rpc("list_admin_audit"); fail(error);
  return (data ?? []).map((item: Record<string, any>) => ({ id: Number(item.id), createdAt: item.created_at, eventType: item.event_type, actorName: item.actor_name ?? "", actorEmail: item.actor_email ?? "", details: item.details ?? {} }));
}

export async function updateTeamMember(userId: string, role: PraxisRole, active: boolean): Promise<void> {
  const { client } = await context();
  const { error } = await client.rpc("update_workspace_member", { target_user: userId, new_role: role, new_active: active });
  fail(error);
}

export async function updateTeamMemberProfile(member: TeamMember, values: { fullName: string; email: string; role: PraxisRole; active: boolean; mfaRequired: boolean; historicalCoverageSince: string | null }): Promise<void> {
  const { client } = await context();
  if (values.email.trim().toLocaleLowerCase("pt-BR") !== member.email.trim().toLocaleLowerCase("pt-BR")) {
    const { error: functionError } = await client.functions.invoke("admin-manage-user", {
      body: { action: "update_email", targetUserId: member.userId, email: values.email.trim() },
    });
    if (functionError) throw new Error(`Não foi possível alterar o e-mail. Verifique se a função admin-manage-user foi implantada no Supabase. ${functionError.message}`);
  }
  const { error } = await client.rpc("update_workspace_member_profile", {
    target_user: member.userId,
    new_full_name: values.fullName,
    new_role: values.role,
    new_active: values.active,
    new_mfa_required: values.mfaRequired,
    new_historico_disponivel_desde: values.historicalCoverageSince || null,
  });
  fail(error);
}

export async function sendMemberPasswordReset(member: TeamMember): Promise<void> {
  const { client } = await context();
  const { error } = await client.auth.resetPasswordForEmail(member.email, { redirectTo: window.location.origin });
  fail(error);
  await recordAdminAudit("member_password_reset_requested", { target_user: member.userId });
}

export async function teamComparativeReport(startDate: string, endDate: string): Promise<TeamComparison[]> {
  const [members, records] = await Promise.all([listTeamMembers(), listMovements()]);
  return members.filter((member) => member.active).map((member) => {
    const items = records.filter((record) => record.assignedTo === member.userId && localDatePart(record.receivedAt) >= startDate && localDatePart(record.receivedAt) <= endDate);
    const sent = items.filter((record) => record.workflowStatus === "Enviado");
    const elapsed = sent.map((record) => record.elapsedHours).filter((value): value is number => value !== null);
    return {
      userId: member.userId, fullName: member.fullName, email: member.email, role: member.role,
      received: items.length, sent: sent.length, pending: items.length - sent.length,
      onTime: sent.filter((record) => record.sentAt && new Date(record.sentAt).getTime() <= new Date(record.deadlineAt).getTime()).length,
      averageHours: elapsed.length ? elapsed.reduce((sum, value) => sum + value, 0) / elapsed.length : null,
    };
  });
}
