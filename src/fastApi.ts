import { usefulElapsedHours } from "./date";
import { requireSupabase } from "./supabase";
import type { CalendarExclusion, ClassSetting, ProcessMovement } from "./types";

const PAGE_SIZE = 1000;
const CACHE_TTL_MS = 1500;
const SELECT_MOVEMENT = [
  "id", "case_id", "received_at", "received_time_precise", "deadline_at", "draft_status", "workflow_status",
  "sent_at", "sent_time_precise", "action_type", "notes", "priority", "document_path", "deleted_at", "assigned_to",
  "cases!inner(mp_number,judicial_number,class_name,subject,socially_relevant,extremely_complex,social_theme,relevance_reason,fundamental_right,affected_group,reach,territorial_scope,impact_type,social_result,sdgs,complexity_reason)",
  "assignee:profiles!movements_assigned_to_fkey(id,full_name)",
].join(",");

let workspaceOwner = "";
let workspacePromise: Promise<string> | null = null;
let inFlight: Promise<ProcessMovement[]> | null = null;
let cachedAt = 0;
let cachedRecords: ProcessMovement[] | null = null;
let exclusionsPromise: Promise<CalendarExclusion[]> | null = null;

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

async function fastContext() {
  const client = requireSupabase();
  const { data, error } = await client.auth.getSession();
  fail(error);
  const user = data.session?.user;
  if (!user) throw new Error("Sessão expirada. Entre novamente.");

  if (workspaceOwner !== user.id) {
    workspaceOwner = user.id;
    workspacePromise = null;
    cachedRecords = null;
    inFlight = null;
    exclusionsPromise = null;
  }

  if (!workspacePromise) workspacePromise = (async () => {
    const { data: profile, error: profileError } = await client.from("profiles").select("current_workspace_id").eq("id", user.id).single();
    fail(profileError);
    if (profile?.current_workspace_id) return String(profile.current_workspace_id);
    const { data: member, error: memberError } = await client.from("workspace_members").select("workspace_id").eq("user_id", user.id).eq("active", true).limit(1).single();
    fail(memberError);
    if (!member?.workspace_id) throw new Error("Sua conta ainda não possui um espaço de trabalho.");
    return String(member.workspace_id);
  })();

  return { client, workspaceId: await workspacePromise };
}


async function loadCalendarExclusions(client: ReturnType<typeof requireSupabase>, workspaceId: string): Promise<CalendarExclusion[]> {
  if (!exclusionsPromise) exclusionsPromise = client.from("calendar_exclusions").select("date, label").eq("workspace_id", workspaceId).order("date").then(({ data, error }) => {
    fail(error);
    return (data ?? []) as CalendarExclusion[];
  }).catch((error) => { exclusionsPromise = null; throw error; });
  return exclusionsPromise;
}

export async function listCalendarExclusionsFast(options: { force?: boolean } = {}): Promise<CalendarExclusion[]> {
  const { client, workspaceId } = await fastContext();
  if (options.force) exclusionsPromise = null;
  return loadCalendarExclusions(client, workspaceId);
}


export async function listClassSettingsFast(): Promise<ClassSetting[]> {
  const { client, workspaceId } = await fastContext();
  const { data, error } = await client.from("class_settings").select("name, business_days").eq("workspace_id", workspaceId).order("name");
  fail(error);
  return (data ?? []).map((item: { name: string; business_days: number }) => ({ name: item.name, businessDays: Number(item.business_days) }));
}

function nested(row: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = row[key];
  if (Array.isArray(value)) return (value[0] ?? {}) as Record<string, unknown>;
  return (value ?? {}) as Record<string, unknown>;
}

function mapMovement(row: Record<string, unknown>, excludedDates: ReadonlySet<string>): ProcessMovement {
  const item = nested(row, "cases");
  const assignee = nested(row, "assignee");
  const receivedAt = String(row.received_at ?? "");
  const sentAt = row.sent_at ? String(row.sent_at) : null;
  return {
    movementId: Number(row.id), caseId: Number(row.case_id),
    mpNumber: String(item.mp_number ?? ""), judicialNumber: String(item.judicial_number ?? ""),
    className: String(item.class_name ?? ""), subject: String(item.subject ?? ""),
    receivedAt, receivedTimePrecise: Boolean(row.received_time_precise), deadlineAt: String(row.deadline_at ?? ""),
    draftStatus: String(row.draft_status ?? "Pendente"), workflowStatus: String(row.workflow_status ?? "Recebido") as ProcessMovement["workflowStatus"],
    sentAt, sentTimePrecise: Boolean(row.sent_time_precise), actionType: String(row.action_type ?? ""), notes: String(row.notes ?? ""),
    priority: String(row.priority ?? "Normal") as ProcessMovement["priority"], documentPath: String(row.document_path ?? ""),
    elapsedHours: usefulElapsedHours(receivedAt, sentAt, excludedDates),
    sociallyRelevant: Boolean(item.socially_relevant), extremelyComplex: Boolean(item.extremely_complex),
    socialTheme: String(item.social_theme ?? ""), relevanceReason: String(item.relevance_reason ?? ""),
    fundamentalRight: String(item.fundamental_right ?? ""), affectedGroup: String(item.affected_group ?? ""),
    reach: String(item.reach ?? ""), territorialScope: String(item.territorial_scope ?? ""), impactType: String(item.impact_type ?? ""),
    socialResult: String(item.social_result ?? ""), sdgs: Array.isArray(item.sdgs) ? item.sdgs.map(String) : [],
    complexityReason: String(item.complexity_reason ?? ""), deletedAt: row.deleted_at ? String(row.deleted_at) : null,
    assignedTo: String(row.assigned_to ?? ""), assignedName: String(assignee.full_name ?? ""),
  };
}

async function fetchAllMovements(): Promise<ProcessMovement[]> {
  const { client, workspaceId } = await fastContext();
  const base = (withCount = false) => client.from("movements").select(SELECT_MOVEMENT, withCount ? { count: "exact" } : undefined)
    .eq("workspace_id", workspaceId).is("deleted_at", null)
    .order("received_at", { ascending: false }).order("id", { ascending: false });

  const [first, exclusionsResult] = await Promise.all([
    base(true).range(0, PAGE_SIZE - 1),
    loadCalendarExclusions(client, workspaceId),
  ]);
  fail(first.error);

  const total = first.count ?? first.data?.length ?? 0;
  const pageCount = Math.ceil(total / PAGE_SIZE);
  const remaining = pageCount > 1
    ? await Promise.all(Array.from({ length: pageCount - 1 }, (_, index) => {
        const start = (index + 1) * PAGE_SIZE;
        return base(false).range(start, start + PAGE_SIZE - 1);
      }))
    : [];

  const rows: Record<string, unknown>[] = [...(first.data ?? [])] as Record<string, unknown>[];
  for (const page of remaining) {
    fail(page.error);
    rows.push(...((page.data ?? []) as Record<string, unknown>[]));
  }

  const excludedDates = new Set(exclusionsResult.map((item) => item.date));
  return rows.map((row) => mapMovement(row, excludedDates));
}

export function clearFastMovementCache(): void {
  cachedAt = 0;
  cachedRecords = null;
  inFlight = null;
  exclusionsPromise = null;
}

export async function listMovementsFast(options: { force?: boolean } = {}): Promise<ProcessMovement[]> {
  if (options.force) { cachedAt = 0; cachedRecords = null; inFlight = null; exclusionsPromise = null; }
  const now = Date.now();
  if (!options.force && cachedRecords && now - cachedAt < CACHE_TTL_MS) return cachedRecords;
  if (!options.force && inFlight) return inFlight;

  inFlight = fetchAllMovements().then((records) => {
    cachedRecords = records;
    cachedAt = Date.now();
    return records;
  }).finally(() => { inFlight = null; });
  return inFlight;
}
