import { usefulElapsedHours } from "./date";
import { measureAsync, measureAsyncResult, measureSync } from "./performanceMonitoring";
import { requireSupabase } from "./supabase";
import type { CalendarExclusion, ClassSetting, ProcessMovement } from "./types";
import { workspaceContext } from "./workspaceContext";

const PAGE_SIZE = 1000;
const CACHE_TTL_MS = 30_000;

// A abertura do Práxis precisa apenas dos campos usados nas filas, painel e
// eficiência. Observações, documentos e classificações analíticas textuais são
// carregados somente quando uma tela realmente precisa deles.
const SELECT_MOVEMENT_CORE = [
  "id", "case_id", "received_at", "received_time_precise", "deadline_at", "draft_status", "workflow_status",
  "sent_at", "sent_time_precise", "action_type", "priority", "procedural_priority", "deleted_at", "archived_at", "assigned_to",
  "cases!inner(mp_number,judicial_number,class_name,subject,socially_relevant,extremely_complex)",
  "assignee:profiles!movements_assigned_to_fkey(id,full_name)",
].join(",");

const SELECT_MOVEMENT_DETAIL = [
  "id", "case_id", "received_at", "received_time_precise", "deadline_at", "draft_status", "workflow_status",
  "sent_at", "sent_time_precise", "action_type", "notes", "priority", "procedural_priority", "document_path", "deleted_at", "archived_at", "assigned_to",
  "cases!inner(mp_number,judicial_number,class_name,subject,socially_relevant,extremely_complex,social_theme,relevance_reason,fundamental_right,affected_group,reach,territorial_scope,impact_type,social_result,sdgs,complexity_reason)",
  "assignee:profiles!movements_assigned_to_fkey(id,full_name)",
].join(",");

type MovementDataset = "active" | "archived" | "all";
type MovementShape = "core" | "detail";

let cacheContextKey = "";
let activeInFlight: Promise<ProcessMovement[]> | null = null;
let archivedInFlight: Promise<ProcessMovement[]> | null = null;
let cachedActiveAt = 0;
let cachedArchivedAt = 0;
let cachedActiveRecords: ProcessMovement[] | null = null;
let cachedArchivedRecords: ProcessMovement[] | null = null;
let exclusionsPromise: Promise<CalendarExclusion[]> | null = null;

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

async function fastContext() {
  const context = await workspaceContext();
  const nextKey = `${context.user.id}:${context.workspaceId}`;

  // O cache pertence ao par usuário + Procuradoria. Isso impede que uma futura
  // troca de workspace reaproveite registros da unidade anteriormente ativa.
  if (cacheContextKey !== nextKey) {
    cacheContextKey = nextKey;
    clearFastMovementCache();
  }

  return context;
}

async function loadCalendarExclusions(client: ReturnType<typeof requireSupabase>, workspaceId: string): Promise<CalendarExclusion[]> {
  if (!exclusionsPromise) {
    exclusionsPromise = (async () => {
      try {
        const { data, error } = await client
          .from("calendar_exclusions")
          .select("date, label")
          .eq("workspace_id", workspaceId)
          .order("date");
        fail(error);
        return (data ?? []) as CalendarExclusion[];
      } catch (error) {
        exclusionsPromise = null;
        throw error;
      }
    })();
  }
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

function mapMovement(row: Record<string, unknown>, excludedDates: ReadonlySet<string>, detailed: boolean): ProcessMovement {
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
    sentAt, sentTimePrecise: Boolean(row.sent_time_precise), actionType: String(row.action_type ?? ""), notes: detailed ? String(row.notes ?? "") : "",
    priority: String(row.priority ?? "Normal") as ProcessMovement["priority"], proceduralPriority: String(row.procedural_priority ?? "Nenhuma") as ProcessMovement["proceduralPriority"],
    documentPath: detailed ? String(row.document_path ?? "") : "",
    elapsedHours: usefulElapsedHours(receivedAt, sentAt, excludedDates),
    sociallyRelevant: Boolean(item.socially_relevant), extremelyComplex: Boolean(item.extremely_complex),
    socialTheme: detailed ? String(item.social_theme ?? "") : "", relevanceReason: detailed ? String(item.relevance_reason ?? "") : "",
    fundamentalRight: detailed ? String(item.fundamental_right ?? "") : "", affectedGroup: detailed ? String(item.affected_group ?? "") : "",
    reach: detailed ? String(item.reach ?? "") : "", territorialScope: detailed ? String(item.territorial_scope ?? "") : "",
    impactType: detailed ? String(item.impact_type ?? "") : "", socialResult: detailed ? String(item.social_result ?? "") : "",
    sdgs: detailed && Array.isArray(item.sdgs) ? item.sdgs.map(String) : [],
    complexityReason: detailed ? String(item.complexity_reason ?? "") : "", deletedAt: row.deleted_at ? String(row.deleted_at) : null,
    archivedAt: row.archived_at ? String(row.archived_at) : null,
    assignedTo: String(row.assigned_to ?? ""), assignedName: String(assignee.full_name ?? ""),
    detailsLoaded: detailed,
  };
}

export type MovementLoadReason = "initial" | "pull" | "refresh" | "import" | "restore" | "trash" | "archive" | "detail" | "export" | "other";

async function fetchMovements(
  context: Awaited<ReturnType<typeof fastContext>>,
  reason: MovementLoadReason,
  dataset: MovementDataset,
  shape: MovementShape,
  prepareTransform?: () => Promise<void> | void,
): Promise<ProcessMovement[]> {
  const { client, workspaceId } = context;
  const select = shape === "detail" ? SELECT_MOVEMENT_DETAIL : SELECT_MOVEMENT_CORE;
  const base = () => {
    let query = client.from("movements").select(select)
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null);
    if (dataset === "active") query = query.is("archived_at", null);
    if (dataset === "archived") query = query.not("archived_at", "is", null);
    return query.order("received_at", { ascending: false }).order("id", { ascending: false });
  };

  const loadPage = (pageNumber: number, start: number) => measureAsyncResult(
    async () => await base().range(start, start + PAGE_SIZE - 1),
    (result) => `movements.page.${reason}.${dataset}.${shape}.${pageNumber}.rows${result.data?.length ?? 0}`,
  );

  const { rows, exclusionsResult, pageCount } = await measureAsyncResult(
    async () => {
      const [first, exclusions] = await Promise.all([
        loadPage(1, 0),
        loadCalendarExclusions(client, workspaceId),
      ]);
      fail(first.error);

      const loadedRows = [...(first.data ?? [])] as unknown as Record<string, unknown>[];
      let loaded = first.data?.length ?? 0;
      let start = PAGE_SIZE;
      let pages = 1;

      while (loaded === PAGE_SIZE) {
        pages += 1;
        const page = await loadPage(pages, start);
        fail(page.error);
        const pageRows = (page.data ?? []) as unknown as Record<string, unknown>[];
        loadedRows.push(...pageRows);
        loaded = pageRows.length;
        start += PAGE_SIZE;
      }

      return { rows: loadedRows, exclusionsResult: exclusions, pageCount: pages };
    },
    (result) => `movements.fetch.${reason}.${dataset}.${shape}.pages${result.pageCount}.rows${result.rows.length}`,
  );

  await prepareTransform?.();
  const excludedDates = new Set(exclusionsResult.map((item) => item.date));
  return measureSync(
    `movements.transform.${reason}.${dataset}.${shape}.pages${pageCount}.rows${rows.length}`,
    () => rows.map((row) => mapMovement(row, excludedDates, shape === "detail")),
  );
}

export function clearFastMovementCache(): void {
  cachedActiveAt = 0;
  cachedArchivedAt = 0;
  cachedActiveRecords = null;
  cachedArchivedRecords = null;
  activeInFlight = null;
  archivedInFlight = null;
  exclusionsPromise = null;
}

export async function listMovementsFast(options: { force?: boolean; reason?: MovementLoadReason; prepareTransform?: () => Promise<void> | void } = {}): Promise<ProcessMovement[]> {
  const context = await fastContext();

  if (activeInFlight) {
    return measureAsync(
      (records) => `movements.inFlightReuse.${options.reason ?? "other"}.active.core.rows${records.length}`,
      () => activeInFlight as Promise<ProcessMovement[]>,
    );
  }

  if (options.force) {
    cachedActiveAt = 0;
    cachedActiveRecords = null;
  }

  const now = Date.now();
  if (!options.force && cachedActiveRecords && now - cachedActiveAt < CACHE_TTL_MS) return cachedActiveRecords;

  const requestKey = cacheContextKey;
  const request = fetchMovements(context, options.reason ?? "other", "active", "core", options.prepareTransform).then((records) => {
    if (cacheContextKey === requestKey) {
      cachedActiveRecords = records;
      cachedActiveAt = Date.now();
    }
    return records;
  }).finally(() => {
    if (activeInFlight === request) activeInFlight = null;
  });
  activeInFlight = request;
  return request;
}

export async function listArchivedMovementsFast(options: { force?: boolean; reason?: MovementLoadReason } = {}): Promise<ProcessMovement[]> {
  const context = await fastContext();

  if (archivedInFlight) {
    return measureAsync(
      (records) => `movements.inFlightReuse.${options.reason ?? "archive"}.archived.core.rows${records.length}`,
      () => archivedInFlight as Promise<ProcessMovement[]>,
    );
  }

  if (options.force) {
    cachedArchivedAt = 0;
    cachedArchivedRecords = null;
  }

  const now = Date.now();
  if (!options.force && cachedArchivedRecords && now - cachedArchivedAt < CACHE_TTL_MS) return cachedArchivedRecords;

  const requestKey = cacheContextKey;
  const request = fetchMovements(context, options.reason ?? "archive", "archived", "core").then((records) => {
    if (cacheContextKey === requestKey) {
      cachedArchivedRecords = records;
      cachedArchivedAt = Date.now();
    }
    return records;
  }).finally(() => {
    if (archivedInFlight === request) archivedInFlight = null;
  });
  archivedInFlight = request;
  return request;
}

export async function listDetailedMovementsFast(options: { includeArchived?: boolean; reason?: MovementLoadReason } = {}): Promise<ProcessMovement[]> {
  const context = await fastContext();
  if (!options.includeArchived) return fetchMovements(context, options.reason ?? "detail", "active", "detail");
  const [active, archived] = await Promise.all([
    fetchMovements(context, options.reason ?? "detail", "active", "detail"),
    fetchMovements(context, options.reason ?? "detail", "archived", "detail"),
  ]);
  return [...active, ...archived];
}

export async function getMovementDetailsFast(movementId: number): Promise<ProcessMovement> {
  const { client, workspaceId } = await fastContext();
  const exclusions = await loadCalendarExclusions(client, workspaceId);
  const { data, error } = await client.from("movements")
    .select(SELECT_MOVEMENT_DETAIL)
    .eq("workspace_id", workspaceId)
    .eq("id", movementId)
    .single();
  fail(error);
  return mapMovement(data as unknown as Record<string, unknown>, new Set(exclusions.map((item) => item.date)), true);
}

export async function getMovementDetailsBatchFast(movementIds: number[]): Promise<ProcessMovement[]> {
  const ids = [...new Set(movementIds)].filter(Number.isFinite);
  if (!ids.length) return [];
  const { client, workspaceId } = await fastContext();
  const exclusions = await loadCalendarExclusions(client, workspaceId);
  const { data, error } = await client.from("movements")
    .select(SELECT_MOVEMENT_DETAIL)
    .eq("workspace_id", workspaceId)
    .in("id", ids)
    .order("received_at", { ascending: false })
    .order("id", { ascending: false });
  fail(error);
  const excludedDates = new Set(exclusions.map((item) => item.date));
  return (data ?? []).map((row) => mapMovement(row as unknown as Record<string, unknown>, excludedDates, true));
}
