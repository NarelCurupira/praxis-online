import { requireSupabase } from "./supabase";
import type { BackupInfo, BackupStatus, CalendarExclusion, CalendarExclusionRange, ChangeHistory, ClassSetting, ImportRecord, ImportResult, MovementQuery, PagedMovements, PraxisRole, ProcessEditData, ProcessFormData, ProcessMovement, StorageDirectoryKind, StorageSettings, TeamComparison, TeamMember, WorkflowStatus } from "./types";

let workspacePromise: Promise<string> | null = null;

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
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

function movementFromRow(row: Record<string, any>): ProcessMovement {
  const item = caseRow(row);
  const assigneeValue = row.assignee;
  const assignee = Array.isArray(assigneeValue) ? (assigneeValue[0] ?? {}) : (assigneeValue ?? {});
  return {
    movementId: Number(row.id), caseId: Number(row.case_id),
    mpNumber: item.mp_number ?? "", judicialNumber: item.judicial_number ?? "",
    className: item.class_name ?? "", subject: item.subject ?? "",
    receivedAt: row.received_at, deadlineAt: row.deadline_at,
    draftStatus: row.draft_status ?? "Pendente", workflowStatus: row.workflow_status,
    sentAt: row.sent_at, actionType: row.action_type ?? "", notes: row.notes ?? "",
    priority: row.priority ?? "Normal", documentPath: row.document_path ?? "",
    elapsedHours: row.elapsed_hours === null ? null : Number(row.elapsed_hours),
    sociallyRelevant: Boolean(item.socially_relevant), extremelyComplex: Boolean(item.extremely_complex),
    socialTheme: item.social_theme ?? "", relevanceReason: item.relevance_reason ?? "",
    fundamentalRight: item.fundamental_right ?? "", affectedGroup: item.affected_group ?? "",
    reach: item.reach ?? "", territorialScope: item.territorial_scope ?? "",
    impactType: item.impact_type ?? "", socialResult: item.social_result ?? "",
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
    impact_type: data.impactType, social_result: data.socialResult,
    complexity_reason: data.complexityReason,
  };
}

const SELECT_MOVEMENT = "*, cases(*), assignee:profiles!movements_assigned_to_fkey(id, full_name)";

export async function listMovements(): Promise<ProcessMovement[]> {
  const { client, workspaceId } = await context();
  const { data, error } = await client.from("movements").select(SELECT_MOVEMENT).eq("workspace_id", workspaceId).is("deleted_at", null).order("received_at", { ascending: false });
  fail(error);
  return (data ?? []).map((row) => movementFromRow(row));
}

function filterRecords(records: ProcessMovement[], filters: MovementQuery, currentUserId = ""): ProcessMovement[] {
  return records.filter((record) => {
    if (record.deletedAt) return false;
    if (filters.queueOnly && (record.workflowStatus === "Enviado" || record.assignedTo !== currentUserId)) return false;
    if (filters.status !== "Todos" && record.workflowStatus !== filters.status) return false;
    if (filters.year !== "Todos" && new Date(record.receivedAt).getFullYear() !== Number(filters.year)) return false;
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
  const years = [...new Set(all.map((record) => new Date(record.receivedAt).getFullYear()).filter(Number.isFinite))].sort((a, b) => b - a);
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
  const { data: row, error } = await client.from("movements").insert({
    workspace_id: workspaceId, case_id: found.id, received_at: data.receivedAt,
    deadline_at: data.deadlineAt, action_type: data.actionType, notes: data.notes,
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
  const elapsed = sentAt ? Math.max(0, (Date.now() - new Date(`${old!.received_at}T00:00:00`).getTime()) / 3_600_000) : null;
  const values: Record<string, any> = { workflow_status: status, updated_by: user.id, updated_at: new Date().toISOString(), row_version: undefined };
  delete values.row_version;
  if (actionType !== undefined) values.action_type = actionType;
  if (status === "Minutado" || status === "Enviado") values.draft_status = "Minutado";
  if (status === "Enviado") { values.sent_at = sentAt; values.elapsed_hours = elapsed; }
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
  const names = new Map((current ?? []).map((item) => [Number(item.id), item.assigned_to ?? ""]));
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
  return (data ?? []).map((row) => movementFromRow(row));
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
  const sentAt = data.sentAt || null;
  const elapsedHours = sentAt ? Math.max(0, (new Date(sentAt).getTime() - new Date(old.receivedAt).getTime()) / 3_600_000) : null;
  const movementValues: Record<string, unknown> = { deadline_at: data.deadlineAt, sent_at: sentAt, elapsed_hours: elapsedHours, action_type: data.actionType, notes: data.notes, priority: data.priority, document_path: data.documentPath, updated_by: user.id, updated_at: new Date().toISOString() };
  if (data.assignedTo && data.assignedTo !== old.assignedTo) movementValues.assigned_to = data.assignedTo;
  const { error } = await client.from("movements").update(movementValues).eq("workspace_id", workspaceId).eq("id", movementId);
  fail(error);
  const changes: Array<[string, unknown, unknown]> = [
    ["Classe", old.className, data.className], ["Assunto", old.subject, data.subject],
    ["Prazo", old.deadlineAt, data.deadlineAt], ["Providência", old.actionType, data.actionType],
    ["Data de envio", old.sentAt, data.sentAt],
    ["Observações", old.notes, data.notes], ["Prioridade", old.priority, data.priority],
    ["Responsável", old.assignedTo, data.assignedTo],
    ["Relevância social", old.sociallyRelevant, data.sociallyRelevant], ["Alta complexidade", old.extremelyComplex, data.extremelyComplex],
  ];
  const rows = changes.filter(([, before, after]) => String(before) !== String(after)).map(([field, before, after]) => ({ workspace_id: workspaceId, movement_id: movementId, changed_by: user.id, field_name: field, old_value: String(before ?? ""), new_value: String(after ?? "") }));
  if (rows.length) await client.from("change_history").insert(rows);
}

export async function clearDatabase(): Promise<string> {
  const { client, workspaceId } = await context();
  await createBackup();
  const { error } = await client.from("cases").delete().eq("workspace_id", workspaceId).gte("id", 0);
  fail(error);
  return "Todos os processos do espaço de trabalho foram removidos.";
}

export async function listClassSettings(): Promise<ClassSetting[]> {
  const { client, workspaceId } = await context();
  const { data, error } = await client.from("class_settings").select("name, business_days").eq("workspace_id", workspaceId).order("name");
  fail(error);
  return (data ?? []).map((item) => ({ name: item.name, businessDays: item.business_days }));
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

export async function importRecords(records: ImportRecord[]): Promise<ImportResult> {
  const { client, user, workspaceId } = await context();
  let casesCreated = 0, movementsCreated = 0, duplicatesLinked = 0, ignoredRows = 0;
  for (const record of records) {
    const found = await findOrCreateCase(record);
    if (found.created) casesCreated += 1; else duplicatesLinked += 1;
    const { data: duplicate } = await client.from("movements").select("id").eq("workspace_id", workspaceId).eq("case_id", found.id).eq("received_at", record.receivedAt).eq("workflow_status", record.workflowStatus).maybeSingle();
    if (duplicate) { ignoredRows += 1; continue; }
    const received = new Date(record.receivedAt).getTime();
    const automaticSentAt = record.workflowStatus === "Enviado" && !record.sentAt
      ? new Date(new Date(record.receivedAt).getTime() + 10 * 86_400_000).toISOString()
      : record.sentAt;
    const sent = automaticSentAt ? new Date(automaticSentAt).getTime() : null;
    const { error } = await client.from("movements").insert({
      workspace_id: workspaceId, case_id: found.id, received_at: record.receivedAt,
      deadline_at: record.deadlineAt, draft_status: record.draftStatus,
      workflow_status: record.workflowStatus, sent_at: automaticSentAt,
      action_type: record.actionType, notes: record.notes, priority: record.priority,
      document_path: record.documentPath, elapsed_hours: sent ? Math.max(0, (sent - received) / 3_600_000) : null,
      assigned_to: record.assignedTo || user.id,
      created_by: user.id, updated_by: user.id,
    });
    if (error) throw new Error(error.message);
    movementsCreated += 1;
  }
  return { casesCreated, movementsCreated, duplicatesLinked, ignoredRows };
}

function download(bytes: BlobPart, type: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = fileName; anchor.click(); URL.revokeObjectURL(url);
}

export async function createBackup(): Promise<string> {
  const records = await listMovements();
  download(JSON.stringify({ createdAt: new Date().toISOString(), records }, null, 2), "application/json", `praxis-online-backup-${new Date().toISOString().slice(0, 10)}.json`);
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

export async function savePdf(bytes: number[]): Promise<string> {
  download(new Uint8Array(bytes), "application/pdf", `relatorio-acompanhamento-${new Date().toISOString().slice(0, 10)}.pdf`);
  return "Relatório PDF baixado pelo navegador.";
}

export async function listBackups(): Promise<BackupInfo[]> { return []; }
export async function restoreBackup(_fileName: string): Promise<string> { throw new Error("A restauração online será habilitada após a validação do formato de backup."); }

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
  return (data ?? []).map((item) => ({ id: Number(item.id), movementId: Number(item.movement_id), changedAt: item.changed_at, fieldName: item.field_name, oldValue: item.old_value, newValue: item.new_value }));
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
  return (data ?? []).map((item: Record<string, any>) => ({ userId: item.user_id, fullName: item.full_name, email: item.email, role: item.role, active: item.active }));
}

export async function createTeamInvite(email: string, role: PraxisRole): Promise<string> {
  const { client } = await context();
  const { data, error } = await client.rpc("create_workspace_invite", { invited_email: email, invited_role: role });
  fail(error);
  return String(data);
}

export async function acceptTeamInvite(token: string): Promise<void> {
  const { client } = await context();
  const { error } = await client.rpc("accept_workspace_invite", { invite_token: token });
  fail(error);
  workspacePromise = null;
  window.location.reload();
}

export async function updateTeamMember(userId: string, role: PraxisRole, active: boolean): Promise<void> {
  const { client } = await context();
  const { error } = await client.rpc("update_workspace_member", { target_user: userId, new_role: role, new_active: active });
  fail(error);
}

export async function teamComparativeReport(startDate: string, endDate: string): Promise<TeamComparison[]> {
  const { client } = await context();
  const { data, error } = await client.rpc("team_comparative_report", { period_start: startDate, period_end: endDate });
  fail(error);
  return (data ?? []).map((item: Record<string, any>) => ({
    userId: item.user_id, fullName: item.full_name, email: item.email, role: item.role,
    received: Number(item.received_count), sent: Number(item.sent_count), pending: Number(item.pending_count),
    onTime: Number(item.on_time_count), averageHours: item.average_hours == null ? null : Number(item.average_hours),
  }));
}
