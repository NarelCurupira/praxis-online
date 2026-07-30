import { toStorageTimestamp } from "./date";
import type { AccessScope, ClosedPeriod, ProcessEditData, TeamMember, WorkspaceSettings } from "./types";
import { workspaceContext } from "./workspaceContext";

function fail(error: { message: string } | null): void { if (error) throw new Error(error.message); }
const context = workspaceContext;

export const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettings = {
  workdayHours: 6,
  workdayStart: "08:00",
  workdayEnd: "14:00",
  defaultDeadlineBusinessDays: 30,
  countFromNextBusinessDay: true,
  afterHoursPolicy: "next_business_day",
  unitName: "",
  leadProsecutor: "",
  reportFooter: "",
  defaultReportMode: "executive",
  defaultReportPeriod: "year",
  allowNamedComparisons: false,
  requireActionOnSend: true,
  requireAssigneeOnProgress: true,
  detectDuplicates: true,
  requireDateChangeReason: true,
  blockClosedPeriods: true,
};

function settingsFromRow(row: Record<string, unknown> | null): WorkspaceSettings {
  if (!row) return DEFAULT_WORKSPACE_SETTINGS;
  return {
    workdayHours: Number(row.workday_hours ?? 6),
    workdayStart: String(row.workday_start ?? "08:00").slice(0, 5),
    workdayEnd: String(row.workday_end ?? "14:00").slice(0, 5),
    defaultDeadlineBusinessDays: Number(row.default_deadline_business_days ?? 30),
    countFromNextBusinessDay: Boolean(row.count_from_next_business_day ?? true),
    afterHoursPolicy: row.after_hours_policy === "keep" ? "keep" : "next_business_day",
    unitName: String(row.unit_name ?? ""),
    leadProsecutor: String(row.lead_prosecutor ?? ""),
    reportFooter: String(row.report_footer ?? ""),
    defaultReportMode: (row.default_report_mode as WorkspaceSettings["defaultReportMode"]) ?? "executive",
    defaultReportPeriod: (row.default_report_period as WorkspaceSettings["defaultReportPeriod"]) ?? "year",
    allowNamedComparisons: Boolean(row.allow_named_comparisons),
    requireActionOnSend: Boolean(row.require_action_on_send ?? true),
    requireAssigneeOnProgress: Boolean(row.require_assignee_on_progress ?? true),
    detectDuplicates: Boolean(row.detect_duplicates ?? true),
    requireDateChangeReason: Boolean(row.require_date_change_reason ?? true),
    blockClosedPeriods: Boolean(row.block_closed_periods ?? true),
  };
}

function suggestedDisplayName(fullName: string, email: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return email.split("@")[0] || "Usuário";
  if (words.length === 1) return words[0];
  return `${words[0]} ${words.at(-1)}`;
}

function mapGovernanceMember(item: Record<string, unknown>): TeamMember {
  const fullName = String(item.full_name ?? "");
  const email = String(item.email ?? "");
  return {
    userId: String(item.user_id), fullName,
    displayName: String(item.display_name ?? "").trim() || suggestedDisplayName(fullName, email),
    email, role: item.role as TeamMember["role"], active: Boolean(item.active),
    mfaRequired: Boolean(item.mfa_required),
    historicalCoverageSince: item.historico_disponivel_desde ? String(item.historico_disponivel_desde) : null,
    efficiencyAccess: item.efficiency_access as AccessScope,
    reportsAccess: item.reports_access as AccessScope,
  };
}

export async function listGovernanceMembers(): Promise<TeamMember[]> {
  const { client, user, workspaceId } = await context();

  const current = await client.rpc("list_current_workspace_members_v091");
  let members: TeamMember[];

  if (!current.error) {
    members = (current.data ?? []).map((item: Record<string, unknown>) => mapGovernanceMember(item));
  } else {
    const legacy = await client.rpc("list_current_workspace_members_v09");
    fail(legacy.error);
    members = (legacy.data ?? []).map((item: Record<string, unknown>) => mapGovernanceMember(item));
  }

  // Um usuário pode possuir mais de um workspace ativo. A RPC histórica retorna
  // membros de todos eles; por isso, o papel do usuário autenticado deve ser
  // confirmado especificamente no current_workspace_id.
  const { data: ownMembership, error: membershipError } = await client
    .from("workspace_members")
    .select("role, active, mfa_required, historico_disponivel_desde, efficiency_access, reports_access")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .eq("active", true)
    .maybeSingle();
  fail(membershipError);

  if (ownMembership) {
    members = members.map((member) => member.userId !== user.id ? member : {
      ...member,
      role: ownMembership.role as TeamMember["role"],
      active: Boolean(ownMembership.active),
      mfaRequired: Boolean(ownMembership.mfa_required),
      historicalCoverageSince: ownMembership.historico_disponivel_desde
        ? String(ownMembership.historico_disponivel_desde)
        : null,
      efficiencyAccess: ownMembership.efficiency_access as AccessScope,
      reportsAccess: ownMembership.reports_access as AccessScope,
    });
  }

  // Evita que associações duplicadas do mesmo usuário em workspaces distintos
  // produzam múltiplas entradas e façam a primeira função prevalecer.
  return [...new Map(members.map((member) => [member.userId, member])).values()];
}

export async function saveMemberAccess(userId: string, efficiencyAccess: AccessScope, reportsAccess: AccessScope, displayName?: string | null): Promise<void> {
  const { client } = await context();
  const current = await client.rpc("update_workspace_member_presentation_v091", {
    target_user: userId,
    new_display_name: displayName == null ? null : displayName.trim(),
    new_efficiency_access: efficiencyAccess,
    new_reports_access: reportsAccess,
  });
  if (!current.error) return;
  if (displayName !== undefined) throw new Error(`Não foi possível salvar o nome de exibição. Execute a migração da versão 0.9.1. ${current.error.message}`);
  const legacy = await client.rpc("update_workspace_member_access_v09", { target_user: userId, new_efficiency_access: efficiencyAccess, new_reports_access: reportsAccess });
  fail(legacy.error);
}

export async function getWorkspaceSettings(): Promise<WorkspaceSettings> {
  const { client, workspaceId } = await context();
  const { data, error } = await client.from("workspace_settings").select("*").eq("workspace_id", workspaceId).maybeSingle();
  fail(error);
  return settingsFromRow(data as Record<string, unknown> | null);
}

export async function saveWorkspaceSettings(settings: WorkspaceSettings): Promise<void> {
  const { client, workspaceId } = await context();
  const { error } = await client.from("workspace_settings").upsert({
    workspace_id: workspaceId, workday_hours: settings.workdayHours, workday_start: settings.workdayStart,
    workday_end: settings.workdayEnd, default_deadline_business_days: settings.defaultDeadlineBusinessDays,
    count_from_next_business_day: settings.countFromNextBusinessDay, after_hours_policy: settings.afterHoursPolicy,
    unit_name: settings.unitName, lead_prosecutor: settings.leadProsecutor, report_footer: settings.reportFooter,
    default_report_mode: settings.defaultReportMode, default_report_period: settings.defaultReportPeriod,
    allow_named_comparisons: settings.allowNamedComparisons, require_action_on_send: settings.requireActionOnSend,
    require_assignee_on_progress: settings.requireAssigneeOnProgress, detect_duplicates: settings.detectDuplicates,
    require_date_change_reason: settings.requireDateChangeReason, block_closed_periods: settings.blockClosedPeriods,
    updated_at: new Date().toISOString(),
  });
  fail(error);
}

export async function listClosedPeriods(): Promise<ClosedPeriod[]> {
  const { client, workspaceId } = await context();
  const { data, error } = await client.from("closed_periods").select("*, closed_by_profile:profiles!closed_periods_closed_by_fkey(full_name), reopened_by_profile:profiles!closed_periods_reopened_by_fkey(full_name)")
    .eq("workspace_id", workspaceId).order("year", { ascending: false }).order("month", { ascending: false });
  fail(error);
  return (data ?? []).map((row: Record<string, any>) => ({
    id: Number(row.id), year: Number(row.year), month: Number(row.month), closedAt: row.closed_at,
    closedByName: row.closed_by_profile?.full_name ?? "", reason: row.reason ?? "",
    reopenedAt: row.reopened_at, reopenedByName: row.reopened_by_profile?.full_name ?? "", reopenReason: row.reopen_reason ?? "",
  }));
}

export async function closePeriod(year: number, month: number, reason: string): Promise<void> {
  const { client, workspaceId, user } = await context();
  const { error } = await client.from("closed_periods").upsert({
    workspace_id: workspaceId, year, month, closed_at: new Date().toISOString(), closed_by: user.id,
    reason: reason.trim(), reopened_at: null, reopened_by: null, reopen_reason: "",
  }, { onConflict: "workspace_id,year,month" });
  fail(error);
}

export async function reopenPeriod(id: number, reason: string): Promise<void> {
  const { client, workspaceId, user } = await context();
  const { error } = await client.from("closed_periods").update({
    reopened_at: new Date().toISOString(), reopened_by: user.id, reopen_reason: reason.trim(),
  }).eq("workspace_id", workspaceId).eq("id", id);
  fail(error);
}

export async function updateMovementGoverned(movementId: number, data: ProcessEditData): Promise<void> {
  const { client } = await context();
  const payload = { ...data, receivedAt: toStorageTimestamp(data.receivedAt), sentAt: toStorageTimestamp(data.sentAt) };
  const current = await client.rpc("update_movement_v0107", { target_movement: movementId, payload, change_reason: data.sensitiveChangeReason?.trim() || null });
  if (!current.error) return;
  const missingCurrent = current.error.code === "PGRST202"
    || current.error.code === "42883"
    || /update_movement_v0107|schema cache/i.test(current.error.message);
  if (!missingCurrent) fail(current.error);
  const legacy = await client.rpc("update_movement_v09", { target_movement: movementId, payload, change_reason: data.sensitiveChangeReason?.trim() || null });
  fail(legacy.error);
}
