"use client";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { ArrowUp, LogOut, Menu, Moon, PanelLeftClose, PanelLeftOpen, Plus, RefreshCw, Sun, WifiOff } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { archiveMovements, clearDatabase, createBackup, createMovement, deleteCalendarExclusion, deleteClassSetting, deleteMovement, deleteMovements, importRecords, restoreBackup, saveCalendarExclusion, saveClassSetting, saveExport, savePdf, updateMovementAction, updateMovementActions, updateMovementAssignment, updateMovementAssignments, updateMovementStatus } from "./api";
import { closePeriod, getWorkspaceSettings, listClosedPeriods, listGovernanceMembers, reopenPeriod, saveMemberAccess, saveWorkspaceSettings, updateMovementGoverned } from "./governanceApi";
import { resolveAccess } from "./access";
import { sessionUsesPasskey } from "./authenticationMethod";
const AboutPage = lazy(() => import("./components/AboutPage").then((module) => ({ default: module.AboutPage })));
const AdminAuditPage = lazy(() => import("./components/AdminAuditPage").then((module) => ({ default: module.AdminAuditPage })));
import { AuthPage } from "./components/AuthPage";
const Dashboard = lazy(() => import("./components/Dashboard").then((module) => ({ default: module.Dashboard })));
const DataQualityPage = lazy(() => import("./components/DataQualityPage").then((module) => ({ default: module.DataQualityPage })));
import { EditProcessModal } from "./components/EditProcessModal";
const EfficiencyPage = lazy(() => import("./components/EfficiencyPage").then((module) => ({ default: module.EfficiencyPage })));
const ImportPage = lazy(() => import("./components/ImportPage").then((module) => ({ default: module.ImportPage })));
import { MfaGate } from "./components/MfaGate";
import { ProcessModal } from "./components/ProcessModal";
const PersonalSettingsPage = lazy(() => import("./components/PersonalSettingsPage").then((module) => ({ default: module.PersonalSettingsPage })));
import { ProcessTable } from "./components/ProcessTable";
import { ProcessTransferDialog } from "./components/ProcessTransferDialog";
import { OfflineQueuePanel } from "./components/OfflineQueuePanel";
const ReportsPage = lazy(() => import("./components/ReportsPage").then((module) => ({ default: module.ReportsPage })));
import { ResetPasswordPage } from "./components/ResetPasswordPage";
const SettingsPage = lazy(() => import("./components/SettingsPage").then((module) => ({ default: module.SettingsPage })));
import { SetupPage } from "./components/SetupPage";
import { Sidebar } from "./components/Sidebar";
import { WorkspaceSwitcher } from "./components/WorkspaceSwitcher";
const TeamPage = lazy(() => import("./components/TeamPage").then((module) => ({ default: module.TeamPage })));
const TrashPage = lazy(() => import("./components/TrashPage").then((module) => ({ default: module.TrashPage })));
import { supabase, supabaseConfigured } from "./supabase";
import type { CalendarExclusion, ClassSetting, ClosedPeriod, Page, ProcessEditData, ProcessFormData, ProcessListPreset, ProcessMovement, TeamMember, WorkflowStatus, WorkspaceSettings } from "./types";
import { useIdleSession } from "./useIdleSession";
import { configureWorkdaySchedule, usefulElapsedHours } from "./date";
import { measureAsync } from "./performanceMonitoring";
import { SplashScreen } from "./components/SplashScreen";
import { clearFastMovementCache, getMovementDetailsBatchFast, getMovementDetailsFast, hydrateQualityReasonsFast, listArchivedMovementsFast, listCalendarExclusionsFast, listClassSettingsFast, listDetailedMovementsFast, listMovementsFast, listReportMovementsFast, type MovementLoadReason } from "./fastApi";
import { hapticFeedback, useMobileNavigation } from "./mobileInteractions";
import { listAvailableWorkspaces, switchWorkspace, transferMovement, type AvailableWorkspace } from "./workspaceApi";
import { allocateOfflineMovementId, clearOfflineUserData, discardOfflineOperationTree, enqueueOfflineOperation, enqueueOfflineOperations, listOfflineOperations, listOfflineWorkspaces, loadOfflineSnapshot, markOfflineWorkspaceCurrent, offlineRetentionHours, saveOfflineSnapshot, type OfflineOperation, type OfflineOperationInput, type OfflineWorkspaceSnapshot } from "./offlineStore";
import { projectOfflineOperations, syncOfflineOperationsForWorkspace } from "./offlineSync";

const LoadingScreen = SplashScreen;

function storedBoolean(key: string): boolean {
  try { return localStorage.getItem(key) === "true"; }
  catch { return false; }
}

type UiFontSize = "small" | "normal" | "large";

function storedFontSize(): UiFontSize {
  try {
    const value = localStorage.getItem("praxis-ui-font-size");
    return value === "small" || value === "large" ? value : "normal";
  } catch {
    return "normal";
  }
}

function PraxisApp({ session, theme, fontSize, onToggleTheme, onFontSizeChange }: {
  session: Session;
  theme: "light" | "dark";
  fontSize: UiFontSize;
  onToggleTheme: () => void;
  onFontSizeChange: (value: UiFontSize) => void;
}) {
  useIdleSession();
  const [page, setPage] = useState<Page>("dashboard");
  const [records, setRecords] = useState<ProcessMovement[]>([]);
  const [classes, setClasses] = useState<ClassSetting[]>([]);
  const [exclusions, setExclusions] = useState<CalendarExclusion[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [settings, setSettings] = useState<WorkspaceSettings | null>(null);
  const [closed, setClosed] = useState<ClosedPeriod[]>([]);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<ProcessMovement | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => storedBoolean("praxis-sidebar-collapsed"));
  const [tableFocusMode, setTableFocusMode] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [processPreset, setProcessPreset] = useState<ProcessListPreset | null>(null);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [archivedLoaded, setArchivedLoaded] = useState(false);
  const [allDetailsLoaded, setAllDetailsLoaded] = useState(false);
  const [pagePreparing, setPagePreparing] = useState(false);
  const [pagePreparationError, setPagePreparationError] = useState("");
  const [workspaces, setWorkspaces] = useState<AvailableWorkspace[]>([]);
  const [switchingWorkspace, setSwitchingWorkspace] = useState(false);
  const [transferRecord, setTransferRecord] = useState<ProcessMovement | null>(null);
  const [workspaceError, setWorkspaceError] = useState("");
  const [workspaceDataLoading, setWorkspaceDataLoading] = useState(false);
  const [contingencyMode, setContingencyMode] = useState(false);
  const [offlineSavedAt, setOfflineSavedAt] = useState<string | null>(null);
  const [recoveringOnline, setRecoveringOnline] = useState(false);
  const [recoveryRetry, setRecoveryRetry] = useState(0);
  const [startupError, setStartupError] = useState("");
  const [offlineOperations, setOfflineOperations] = useState<OfflineOperation[]>([]);
  const [offlineQueueOpen, setOfflineQueueOpen] = useState(false);
  const [syncingOffline, setSyncingOffline] = useState(false);

  function applyOfflineSnapshot(snapshot: OfflineWorkspaceSnapshot, cachedWorkspaces: AvailableWorkspace[], pending: OfflineOperation[]) {
    configureWorkdaySchedule(snapshot.settings);
    setSettings(snapshot.settings);
    setRecords(projectOfflineOperations(snapshot.records, pending.filter((operation) => operation.workspaceId === snapshot.workspaceId), snapshot.members));
    setClasses(snapshot.classes);
    setExclusions(snapshot.exclusions);
    setMembers(snapshot.members);
    setClosed(snapshot.closedPeriods);
    setWorkspaces(cachedWorkspaces.map((workspace) => ({ ...workspace, current: workspace.workspaceId === snapshot.workspaceId })));
    setArchivedLoaded(snapshot.records.some((record) => Boolean(record.archivedAt)));
    setAllDetailsLoaded(false);
    setOfflineSavedAt(snapshot.savedAt);
    setContingencyMode(true);
    setDataVersion((value) => value + 1);
  }

  function cacheSnapshot(
    data: { settings: WorkspaceSettings; records: ProcessMovement[]; classes: ClassSetting[]; exclusions: CalendarExclusion[]; members: TeamMember[]; closed: ClosedPeriod[] },
    workspaceList: AvailableWorkspace[],
  ) {
    const current = workspaceList.find((workspace) => workspace.current) ?? workspaceList[0];
    if (!current) return;
    void saveOfflineSnapshot({
      userId: session.user.id,
      workspaceId: current.workspaceId,
      workspaceName: current.name,
      workspaceRole: current.role,
      records: data.records,
      classes: data.classes,
      exclusions: data.exclusions,
      members: data.members,
      settings: data.settings,
      closedPeriods: data.closed,
    }).then((snapshot) => setOfflineSavedAt(snapshot.savedAt)).catch(() => { /* Cache é contingência; falha não interrompe o uso on-line. */ });
  }

  async function enterContingency(workspaceId?: string): Promise<boolean> {
    const [snapshot, cachedWorkspaces, pending] = await Promise.all([
      loadOfflineSnapshot(session.user.id, workspaceId),
      listOfflineWorkspaces(session.user.id),
      listOfflineOperations(session.user.id),
    ]);
    if (!snapshot) return false;
    setOfflineOperations(pending);
    applyOfflineSnapshot(snapshot, cachedWorkspaces, pending);
    await markOfflineWorkspaceCurrent(session.user.id, snapshot.workspaceId);
    return true;
  }

  async function refreshOfflineOperations(): Promise<OfflineOperation[]> {
    const pending = await listOfflineOperations(session.user.id);
    setOfflineOperations(pending);
    return pending;
  }

  function currentWorkspaceInfo() {
    return workspaces.find((workspace) => workspace.current) ?? workspaces[0];
  }

  function offlineOperationBase(recordLabel = ""): Pick<OfflineOperationInput, "userId" | "workspaceId" | "workspaceName" | "processLabel"> {
    const workspace = currentWorkspaceInfo();
    if (!workspace) throw new Error("Não foi possível identificar a Procuradoria ativa para registrar a alteração local.");
    return { userId: session.user.id, workspaceId: workspace.workspaceId, workspaceName: workspace.name, processLabel: recordLabel };
  }

  async function synchronizeCurrentOfflineQueue(options: { reloadAfter?: boolean } = {}): Promise<void> {
    const workspace = currentWorkspaceInfo();
    if (!workspace || !navigator.onLine || syncingOffline) return;
    setSyncingOffline(true);
    try {
      await switchWorkspace(workspace.workspaceId);
      clearFastMovementCache();
      const result = await measureAsync("contingency.sync.current", () => syncOfflineOperationsForWorkspace(session.user.id, workspace.workspaceId));
      await refreshOfflineOperations();
      if (result.error) setWorkspaceError(`Sincronização parcial: ${result.error}`);
      else if (result.synced) setWorkspaceError("");
      if (options.reloadAfter && !contingencyMode) await reload("refresh");
    } finally {
      setSyncingOffline(false);
    }
  }

  async function discardOfflineOperation(operationId: string): Promise<void> {
    await discardOfflineOperationTree(session.user.id, operationId);
    await refreshOfflineOperations();
    const workspace = currentWorkspaceInfo();
    if (contingencyMode) await enterContingency(workspace?.workspaceId);
    else if (navigator.onLine) await reload("refresh");
  }

  async function refreshWorkspaces(): Promise<AvailableWorkspace[]> {
    const next = await listAvailableWorkspaces();
    setWorkspaces(next);
    return next;
  }

  async function changeWorkspace(workspaceId: string) {
    const current = workspaces.find((workspace) => workspace.current);
    if (!workspaceId || workspaceId === current?.workspaceId || switchingWorkspace) return;
    if (contingencyMode || !navigator.onLine) {
      setSwitchingWorkspace(true);
      setWorkspaceError("");
      try {
        const loaded = await enterContingency(workspaceId);
        if (!loaded) throw new Error("Esta Procuradoria ainda não possui dados válidos de contingência neste dispositivo.");
        hapticFeedback("success");
      } catch (error) {
        setWorkspaceError(error instanceof Error ? error.message : String(error));
      } finally {
        setSwitchingWorkspace(false);
      }
      return;
    }
    let switched = false;
    setSwitchingWorkspace(true);
    setWorkspaceDataLoading(false);
    setWorkspaceError("");
    setTransferRecord(null);
    setEditing(null);
    setModal(false);
    setPage("dashboard");
    setProcessPreset(null);
    try {
      await switchWorkspace(workspaceId);
      switched = true;
      clearFastMovementCache();
      const queuedForTarget = await listOfflineOperations(session.user.id, workspaceId);
      if (queuedForTarget.length) {
        setSyncingOffline(true);
        const syncResult = await measureAsync("contingency.sync.workspaceSwitch", () => syncOfflineOperationsForWorkspace(session.user.id, workspaceId));
        setSyncingOffline(false);
        await refreshOfflineOperations();
        if (syncResult.error) setWorkspaceError(`Há alteração local pendente nesta Procuradoria: ${syncResult.error}`);
      }

      // Fase 1: troca o contexto visual apenas após carregar os dados de referência.
      // A tela antiga continua utilizável até este ponto, evitando o splash global.
      const [nextSettings, nextClasses, nextExclusions, nextMembers, nextClosed, nextWorkspaces] = await Promise.all([
        getWorkspaceSettings(), listClassSettingsFast(), listCalendarExclusionsFast({ force: true }),
        listGovernanceMembers(), listClosedPeriods(), listAvailableWorkspaces(),
      ]);
      configureWorkdaySchedule(nextSettings);
      setSettings(nextSettings);
      setClasses(nextClasses);
      setExclusions(nextExclusions);
      setMembers(nextMembers);
      setClosed(nextClosed);
      setWorkspaces(nextWorkspaces);
      setRecords([]);
      setArchivedLoaded(false);
      setAllDetailsLoaded(false);
      setDataVersion((value) => value + 1);
      setWorkspaceDataLoading(true);

      // Fase 2: os processos chegam em segundo plano; somente a área de dados sinaliza carga.
      const nextRecords = await listMovementsFast({
        force: true, reason: "initial", prepareTransform: () => configureWorkdaySchedule(nextSettings),
      });
      setRecords(nextRecords);
      setDataVersion((value) => value + 1);
      cacheSnapshot({ settings: nextSettings, records: nextRecords, classes: nextClasses, exclusions: nextExclusions, members: nextMembers, closed: nextClosed }, nextWorkspaces);
      setContingencyMode(false);
      setOfflineSavedAt(new Date().toISOString());
      hapticFeedback("success");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (switched && current?.workspaceId) {
        try {
          await switchWorkspace(current.workspaceId);
          clearFastMovementCache();
          await Promise.all([reloadAll("initial"), refreshWorkspaces()]);
        } catch { /* Se a reversão falhar, o alerta abaixo permanece visível. */ }
      }
      setWorkspaceError(message);
    } finally {
      setWorkspaceDataLoading(false);
      setSwitchingWorkspace(false);
      setSyncingOffline(false);
    }
  }

  async function reload(reason: MovementLoadReason = "refresh") {
    if (contingencyMode || !navigator.onLine) {
      setWorkspaceError("Modo contingência ativo: a atualização do servidor aguarda reconexão; alterações operacionais serão registradas na fila local.");
      return;
    }
    const detailPage = page === "import";
    const qualityPage = page === "quality";
    let nextRecords: ProcessMovement[];
    try {
      nextRecords = await measureAsync(`movements.reload.${reason}`, async () => {
        if (detailPage) {
          return listDetailedMovementsFast({ includeArchived: true, reason });
        }
        if (qualityPage) {
          const [active, archived] = await Promise.all([
            listMovementsFast({ force: true, reason }),
            listArchivedMovementsFast({ force: true, reason: "archive" }),
          ]);
          return hydrateQualityReasonsFast([...active, ...archived]);
        }
        const [active, archived] = await Promise.all([
          listMovementsFast({ force: true, reason }),
          archivedLoaded ? listArchivedMovementsFast({ force: true, reason: "archive" }) : Promise.resolve([]),
        ]);
        return [...active, ...archived];
      });
    } catch (error) {
      const current = workspaces.find((workspace) => workspace.current);
      const loaded = await enterContingency(current?.workspaceId).catch(() => false);
      if (loaded) {
        setWorkspaceError("Servidor indisponível. O Práxis mudou para o modo contingência com a última cópia local válida.");
        return;
      }
      throw error;
    }
    setRecords(nextRecords);
    if (detailPage) {
      setArchivedLoaded(true);
      setAllDetailsLoaded(true);
    } else if (qualityPage) {
      setArchivedLoaded(true);
      setAllDetailsLoaded(false);
    } else {
      setAllDetailsLoaded(false);
    }
    setDataVersion((value) => value + 1);
  }

  async function reloadAll(reason: MovementLoadReason = "other") {
    const settingsPromise = getWorkspaceSettings();
    const [nextSettings, nextRecords, nextClasses, nextExclusions, nextMembers, nextClosed] = await measureAsync(`app.reloadAll.${reason}`, () => Promise.all([
      settingsPromise,
      listMovementsFast({
        force: true,
        reason,
        prepareTransform: async () => configureWorkdaySchedule(await settingsPromise),
      }),
      listClassSettingsFast(), listCalendarExclusionsFast(), listGovernanceMembers(), listClosedPeriods(),
    ]));
    configureWorkdaySchedule(nextSettings);
    setRecords(nextRecords);
    setArchivedLoaded(false);
    setAllDetailsLoaded(false);
    setClasses(nextClasses);
    setExclusions(nextExclusions);
    setMembers(nextMembers);
    setSettings(nextSettings);
    setClosed(nextClosed);

    if (reason !== "initial" && page === "import") {
      const detailed = await listDetailedMovementsFast({ includeArchived: true, reason: "detail" });
      setRecords(detailed);
      setArchivedLoaded(true);
      setAllDetailsLoaded(true);
    }

    setDataVersion((value) => value + 1);
    return { settings: nextSettings, records: nextRecords, classes: nextClasses, exclusions: nextExclusions, members: nextMembers, closed: nextClosed };
  }


  function mergeRecords(current: ProcessMovement[], incoming: ProcessMovement[]): ProcessMovement[] {
    const byId = new Map(current.map((record) => [record.movementId, record]));
    incoming.forEach((record) => byId.set(record.movementId, record));
    return [...byId.values()].sort((left, right) => {
      const date = right.receivedAt.localeCompare(left.receivedAt);
      return date || right.movementId - left.movementId;
    });
  }

  async function ensureArchivedRecords(): Promise<ProcessMovement[]> {
    if (archivedLoaded) return records.filter((record) => Boolean(record.archivedAt));
    const archived = await measureAsync("movements.archive.lazy", () => listArchivedMovementsFast({ reason: "archive" }));
    setRecords((current) => mergeRecords(current, archived));
    setArchivedLoaded(true);
    return archived;
  }

  async function ensureAllDetailedRecords(reason: MovementLoadReason = "detail"): Promise<ProcessMovement[]> {
    if (allDetailsLoaded) return records;
    const detailed = await measureAsync(`movements.details.${reason}`, () => listDetailedMovementsFast({ includeArchived: true, reason }));
    setRecords(detailed);
    setArchivedLoaded(true);
    setAllDetailsLoaded(true);
    setDataVersion((value) => value + 1);
    return detailed;
  }

  async function ensureQualityRecords(): Promise<ProcessMovement[]> {
    const archived = archivedLoaded ? records.filter((record) => Boolean(record.archivedAt)) : await listArchivedMovementsFast({ reason: "archive" });
    const combined = mergeRecords(records, archived);
    const hydrated = await measureAsync("quality.prepare.reasons", () => hydrateQualityReasonsFast(combined));
    setRecords(hydrated);
    setArchivedLoaded(true);
    setAllDetailsLoaded(false);
    setDataVersion((value) => value + 1);
    return hydrated;
  }

  async function prepareExportRecords(items: ProcessMovement[]): Promise<ProcessMovement[]> {
    if (!items.length || items.every((record) => record.detailsLoaded)) return items;
    const ids = new Set(items.map((record) => record.movementId));
    if (items.length > 100) {
      const detailed = await ensureAllDetailedRecords("export");
      return detailed.filter((record) => ids.has(record.movementId));
    }
    const detailed = await measureAsync("movements.details.export.batch", () => getMovementDetailsBatchFast([...ids]));
    setRecords((current) => mergeRecords(current, detailed));
    const byId = new Map(detailed.map((record) => [record.movementId, record]));
    return items.map((record) => byId.get(record.movementId) ?? record);
  }

  async function openEdit(record: ProcessMovement) {
    if (contingencyMode && !record.detailsLoaded && record.movementId >= 0) {
      setWorkspaceError("A edição completa deste processo não está disponível na cópia local segura. Alterações de status, providência e responsável continuam disponíveis; para editar os demais campos, abra o registro on-line antes da queda de conexão.");
      return;
    }
    if (record.detailsLoaded) {
      setEditing(record);
      return;
    }
    const detailed = await measureAsync("movements.details.edit", () => getMovementDetailsFast(record.movementId));
    setRecords((current) => mergeRecords(current, [detailed]));
    setEditing(detailed);
  }

  async function reloadReferenceData() {
    const [nextSettings, nextClasses, nextExclusions, nextMembers, nextClosed] = await measureAsync("app.reloadReferenceData", () => Promise.all([
      getWorkspaceSettings(), listClassSettingsFast(), listCalendarExclusionsFast({ force: true }), listGovernanceMembers(), listClosedPeriods(),
    ]));
    configureWorkdaySchedule(nextSettings);
    const excludedDates = new Set(nextExclusions.map((item) => item.date));
    const memberNames = new Map(nextMembers.map((member) => [member.userId, member.fullName]));
    setRecords((current) => current.map((record) => ({
      ...record,
      elapsedHours: usefulElapsedHours(record.receivedAt, record.sentAt, excludedDates),
      assignedName: memberNames.get(record.assignedTo) || record.assignedName,
    })));
    setClasses(nextClasses);
    setExclusions(nextExclusions);
    setMembers(nextMembers);
    setSettings(nextSettings);
    setClosed(nextClosed);
    setDataVersion((value) => value + 1);
  }

  useEffect(() => {
    let cancelled = false;
    const bootstrap = async () => {
      setStartupError("");
      try {
        if (!navigator.onLine) throw new Error("Sem conexão de rede.");
        const [data, nextWorkspaces] = await Promise.all([reloadAll("initial"), listAvailableWorkspaces()]);
        if (cancelled) return;
        setWorkspaces(nextWorkspaces);
        cacheSnapshot(data, nextWorkspaces);
        await refreshOfflineOperations();
        setContingencyMode(false);
      } catch (error) {
        try {
          const loaded = await enterContingency();
          if (!loaded && !cancelled) {
            const message = error instanceof Error ? error.message : String(error);
            setStartupError(`Não foi possível acessar o Supabase e não há contingência válida neste dispositivo. ${message}`);
          }
        } catch (offlineError) {
          if (!cancelled) setStartupError(offlineError instanceof Error ? offlineError.message : String(offlineError));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void bootstrap();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const markOnline = () => setOnline(true);
    const markOffline = () => {
      setOnline(false);
      setContingencyMode(true);
      void listOfflineWorkspaces(session.user.id).then((cached) => { if (cached.length) setWorkspaces(cached); }).catch(() => undefined);
      void refreshOfflineOperations().catch(() => undefined);
    };
    window.addEventListener("online", markOnline);
    window.addEventListener("offline", markOffline);
    return () => { window.removeEventListener("online", markOnline); window.removeEventListener("offline", markOffline); };
  }, []);

  useEffect(() => {
    if (!online || contingencyMode || workspaceDataLoading || switchingWorkspace || !settings || !workspaces.length) return;
    const timer = window.setTimeout(() => {
      cacheSnapshot({ settings, records, classes, exclusions, members, closed }, workspaces);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [online, contingencyMode, workspaceDataLoading, switchingWorkspace, settings, records, classes, exclusions, members, closed, workspaces]);

  useEffect(() => {
    if (!online || !contingencyMode || recoveringOnline) return;
    let cancelled = false;
    let retryTimer: number | null = null;
    const recover = async () => {
      setRecoveringOnline(true);
      try {
        const selected = workspaces.find((workspace) => workspace.current);
        if (selected?.workspaceId) {
          await switchWorkspace(selected.workspaceId);
          clearFastMovementCache();
          setSyncingOffline(true);
          const syncResult = await measureAsync("contingency.sync.reconnect", () => syncOfflineOperationsForWorkspace(session.user.id, selected.workspaceId));
          setSyncingOffline(false);
          await refreshOfflineOperations();
          if (syncResult.error) setWorkspaceError(`Algumas alterações locais ainda precisam de revisão: ${syncResult.error}`);
        }
        const [data, nextWorkspaces] = await Promise.all([reloadAll("refresh"), listAvailableWorkspaces()]);
        if (cancelled) return;
        setWorkspaces(nextWorkspaces);
        cacheSnapshot(data, nextWorkspaces);
        setContingencyMode(false);
        const pendingAfterRecovery = await refreshOfflineOperations();
        if (!pendingAfterRecovery.some((operation) => operation.lastError)) setWorkspaceError("");
        hapticFeedback("success");
      } catch {
        // O navegador pode declarar rede disponível antes de o backend responder.
        // Enquanto a rede continuar ativa, tenta novamente sem bloquear a leitura local.
        if (!cancelled && navigator.onLine) retryTimer = window.setTimeout(() => setRecoveryRetry((value) => value + 1), 15000);
      } finally {
        if (!cancelled) {
          setRecoveringOnline(false);
          setSyncingOffline(false);
        }
      }
    };
    void recover();
    return () => { cancelled = true; if (retryTimer != null) window.clearTimeout(retryTimer); };
  }, [online, contingencyMode, recoveryRetry]);

  useEffect(() => {
    const update = () => setShowBackToTop(window.scrollY > 560);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  const mobileNavigation = useMobileNavigation({
    sidebarOpen,
    onOpenSidebar: () => setSidebarOpen(true),
    onCloseSidebar: () => setSidebarOpen(false),
    onRefresh: () => contingencyMode ? Promise.resolve() : reload("pull"),
  });

  const currentMember = members.find((member) => member.userId === session.user.id);
  const baseAccess = useMemo(() => resolveAccess(currentMember), [currentMember]);
  const access = useMemo(() => {
    if (!contingencyMode) return baseAccess;
    const visiblePages = new Set<Page>(["dashboard", "queue", "processes"]);
    return {
      ...baseAccess,
      efficiencyScope: "none" as const, reportsScope: "none" as const, visiblePages,
      // A segunda fase preserva somente as escritas operacionais que podem ser
      // reenviadas pelas mesmas APIs/RLS. Administração e ações destrutivas continuam on-line.
      canDelete: false, canExport: false, canTransferProcess: false, canManageTrash: false, canManageTeam: false,
      canManageSettings: false, canImport: false, canViewQuality: false, canViewAudit: false, canViewTeamDashboard: false,
    };
  }, [baseAccess, contingencyMode]);

  useEffect(() => {
    if (!access.visiblePages.has(page)) setPage("dashboard");
  }, [access, page]);

  useEffect(() => {
    if (page !== "queue" && page !== "processes") setTableFocusMode(false);
  }, [page]);

  useEffect(() => {
    let cancelled = false;
    const prepare = async () => {
      const needsDetails = page === "import";
      const needsQuality = page === "quality";
      const needsArchive = page === "efficiency";
      if (!needsDetails && !needsQuality && !needsArchive) {
        setPagePreparing(false);
        setPagePreparationError("");
        return;
      }
      setPagePreparing(true);
      setPagePreparationError("");
      try {
        if (needsDetails) await ensureAllDetailedRecords("detail");
        else if (needsQuality) await ensureQualityRecords();
        else await ensureArchivedRecords();
      } catch (error) {
        if (!cancelled) setPagePreparationError(error instanceof Error ? error.message : String(error));
      } finally {
        if (!cancelled) setPagePreparing(false);
      }
    };
    void prepare();
    return () => { cancelled = true; };
  }, [page]);

  function toggleSidebar() {
    setSidebarCollapsed((current) => {
      const next = !current;
      try { localStorage.setItem("praxis-sidebar-collapsed", String(next)); } catch { /* Preferência não persistente. */ }
      return next;
    });
  }

  function asIso(value: string | null): string | null {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toISOString();
  }

  function isTransientWriteFailure(error: unknown): boolean {
    if (!navigator.onLine) return true;
    const message = (error instanceof Error ? error.message : String(error)).toLocaleLowerCase("pt-BR");
    return /failed to fetch|fetch failed|network|load failed|timeout|timed out|connection|gateway|\b502\b|\b503\b|\b504\b/.test(message);
  }

  function activateWriteContingency(error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    setContingencyMode(true);
    setWorkspaceError(`Servidor temporariamente indisponível. A alteração foi preservada na fila local de contingência.${detail ? ` (${detail})` : ""}`);
  }

  async function save(data: ProcessFormData) {
    let queueLocally = contingencyMode || !navigator.onLine;
    if (!queueLocally) {
      try {
        const created = await measureAsync("movements.create", () => createMovement(data));
        setRecords((current) => [{ ...created, detailsLoaded: true }, ...current.filter((item) => item.movementId !== created.movementId)]);
        setDataVersion((value) => value + 1);
        setModal(false);
        hapticFeedback("success");
        return;
      } catch (error) {
        if (!isTransientWriteFailure(error)) throw error;
        queueLocally = true;
        activateWriteContingency(error);
      }
    }
    if (queueLocally) {
      const temporaryId = allocateOfflineMovementId();
      const base = offlineOperationBase(data.judicialNumber);
      const operation = await enqueueOfflineOperation({
        ...base,
        movementId: temporaryId,
        tempMovementId: temporaryId,
        payload: { kind: "create", data },
      });
      setRecords((current) => projectOfflineOperations(current, [operation], members));
      await refreshOfflineOperations();
      setDataVersion((value) => value + 1);
      setModal(false);
      hapticFeedback("success");
    }
  }

  async function edit(id: number, data: ProcessEditData) {
    let queueLocally = contingencyMode || !navigator.onLine;
    if (!queueLocally) {
      try {
        await measureAsync("movements.update", () => updateMovementGoverned(id, data));
        const receivedAt = asIso(data.receivedAt) ?? data.receivedAt;
        const sentAt = asIso(data.sentAt);
        const excludedDates = new Set<string>(exclusions.map((item) => item.date));
        setRecords((current) => current.map((record) => record.movementId !== id ? record : {
          ...record,
          ...data,
          receivedAt,
          sentAt,
          receivedTimePrecise: Boolean(data.receivedTimePrecise),
          sentTimePrecise: Boolean(data.sentTimePrecise),
          elapsedHours: usefulElapsedHours(receivedAt, sentAt, excludedDates),
          assignedName: members.find((member) => member.userId === data.assignedTo)?.fullName || record.assignedName,
          detailsLoaded: true,
        }));
        setDataVersion((value) => value + 1);
        setEditing(null);
        hapticFeedback("success");
        return;
      } catch (error) {
        if (!isTransientWriteFailure(error)) throw error;
        queueLocally = true;
        activateWriteContingency(error);
      }
    }
    if (queueLocally) {
      const record = records.find((item) => item.movementId === id);
      const base = offlineOperationBase(record?.judicialNumber || "Processo local");
      const operation = await enqueueOfflineOperation({
        ...base,
        movementId: id,
        tempMovementId: id < 0 ? id : null,
        payload: { kind: "edit", data },
      });
      setRecords((current) => projectOfflineOperations(current, [operation], members));
      await refreshOfflineOperations();
      setDataVersion((value) => value + 1);
      setEditing(null);
      hapticFeedback("success");
    }
  }

  async function status(id: number, value: WorkflowStatus, actionType?: string) {
    let queueLocally = contingencyMode || !navigator.onLine;
    if (!queueLocally) {
      const sentAt = value === "Enviado" ? new Date().toISOString() : null;
      try {
        await measureAsync("movements.status", () => updateMovementStatus(id, value, actionType, sentAt ?? undefined));
        const excludedDates = new Set<string>(exclusions.map((item) => item.date));
        setRecords((current) => current.map((record) => record.movementId !== id ? record : {
          ...record,
          workflowStatus: value,
          actionType: actionType ?? record.actionType,
          draftStatus: value === "Minutado" || value === "Enviado" ? "Minutado" : record.draftStatus,
          sentAt,
          sentTimePrecise: value === "Enviado",
          elapsedHours: value === "Enviado" ? usefulElapsedHours(record.receivedAt, sentAt, excludedDates) : null,
        }));
        setDataVersion((version) => version + 1);
        hapticFeedback("success");
        return;
      } catch (error) {
        if (!isTransientWriteFailure(error)) throw error;
        queueLocally = true;
        activateWriteContingency(error);
      }
    }
    if (queueLocally) {
      const record = records.find((item) => item.movementId === id);
      const base = offlineOperationBase(record?.judicialNumber || "Processo local");
      const operation = await enqueueOfflineOperation({
        ...base,
        movementId: id,
        tempMovementId: id < 0 ? id : null,
        payload: { kind: "status", status: value, actionType },
      });
      setRecords((current) => projectOfflineOperations(current, [operation], members));
      await refreshOfflineOperations();
      setDataVersion((version) => version + 1);
      hapticFeedback("success");
    }
  }

  async function action(id: number, actionType: string) {
    let queueLocally = contingencyMode || !navigator.onLine;
    if (!queueLocally) {
      try {
        await measureAsync("movements.action", () => updateMovementAction(id, actionType));
        setRecords((current) => current.map((record) => record.movementId === id ? { ...record, actionType } : record));
        hapticFeedback("success");
        return;
      } catch (error) {
        if (!isTransientWriteFailure(error)) throw error;
        queueLocally = true;
        activateWriteContingency(error);
      }
    }
    if (queueLocally) {
      const record = records.find((item) => item.movementId === id);
      const base = offlineOperationBase(record?.judicialNumber || "Processo local");
      const operation = await enqueueOfflineOperation({
        ...base,
        movementId: id,
        tempMovementId: id < 0 ? id : null,
        payload: { kind: "action", actionType },
      });
      setRecords((current) => projectOfflineOperations(current, [operation], members));
      await refreshOfflineOperations();
      hapticFeedback("success");
    }
  }

  async function assignment(id: number, userId: string) {
    let queueLocally = contingencyMode || !navigator.onLine;
    if (!queueLocally) {
      try {
        await measureAsync("movements.assignment", () => updateMovementAssignment(id, userId));
        const assignedName = members.find((member) => member.userId === userId)?.fullName || "";
        setRecords((current) => current.map((record) => record.movementId === id ? { ...record, assignedTo: userId, assignedName } : record));
        hapticFeedback("success");
        return;
      } catch (error) {
        if (!isTransientWriteFailure(error)) throw error;
        queueLocally = true;
        activateWriteContingency(error);
      }
    }
    if (queueLocally) {
      const record = records.find((item) => item.movementId === id);
      const base = offlineOperationBase(record?.judicialNumber || "Processo local");
      const operation = await enqueueOfflineOperation({
        ...base,
        movementId: id,
        tempMovementId: id < 0 ? id : null,
        payload: { kind: "assignment", assignedTo: userId },
      });
      setRecords((current) => projectOfflineOperations(current, [operation], members));
      await refreshOfflineOperations();
      hapticFeedback("success");
    }
  }

  async function bulk(ids: number[], userId: string) {
    let queueLocally = contingencyMode || !navigator.onLine;
    if (!queueLocally) {
      try {
        await measureAsync("movements.bulkAssignment", () => updateMovementAssignments(ids, userId));
        const selected = new Set(ids);
        const assignedName = members.find((member) => member.userId === userId)?.fullName || "";
        setRecords((current) => current.map((record) => selected.has(record.movementId) ? { ...record, assignedTo: userId, assignedName } : record));
        return;
      } catch (error) {
        if (!isTransientWriteFailure(error)) throw error;
        queueLocally = true;
        activateWriteContingency(error);
      }
    }
    if (queueLocally) {
      const operations = await enqueueOfflineOperations(ids.map((id) => {
        const record = records.find((item) => item.movementId === id);
        return {
          ...offlineOperationBase(record?.judicialNumber || "Processo local"),
          movementId: id,
          tempMovementId: id < 0 ? id : null,
          payload: { kind: "assignment", assignedTo: userId } as const,
        };
      }));
      setRecords((current) => projectOfflineOperations(current, operations, members));
      await refreshOfflineOperations();
      setDataVersion((value) => value + 1);
    }
  }

  async function bulkAction(ids: number[], actionType: string) {
    let queueLocally = contingencyMode || !navigator.onLine;
    if (!queueLocally) {
      try {
        await measureAsync("movements.bulkAction", () => updateMovementActions(ids, actionType));
        const selected = new Set(ids);
        setRecords((current) => current.map((record) => selected.has(record.movementId) ? { ...record, actionType } : record));
        return;
      } catch (error) {
        if (!isTransientWriteFailure(error)) throw error;
        queueLocally = true;
        activateWriteContingency(error);
      }
    }
    if (queueLocally) {
      const operations = await enqueueOfflineOperations(ids.map((id) => {
        const record = records.find((item) => item.movementId === id);
        return {
          ...offlineOperationBase(record?.judicialNumber || "Processo local"),
          movementId: id,
          tempMovementId: id < 0 ? id : null,
          payload: { kind: "action", actionType } as const,
        };
      }));
      setRecords((current) => projectOfflineOperations(current, operations, members));
      await refreshOfflineOperations();
      setDataVersion((value) => value + 1);
    }
  }

  async function bulkArchive(ids: number[]) {
    await measureAsync("movements.bulkArchive", () => archiveMovements(ids));
    const selected = new Set(ids);
    const archivedAt = new Date().toISOString();
    setRecords((current) => current.map((record) => selected.has(record.movementId) ? { ...record, archivedAt } : record));
    setDataVersion((value) => value + 1);
  }

  async function bulkDelete(ids: number[]) {
    await measureAsync("movements.bulkDelete", () => deleteMovements(ids));
    const selected = new Set(ids);
    setRecords((current) => current.filter((record) => !selected.has(record.movementId)));
    setDataVersion((value) => value + 1);
  }

  async function remove(id: number) {
    await measureAsync("movements.delete", () => deleteMovement(id));
    setRecords((current) => current.filter((record) => record.movementId !== id));
    setDataVersion((value) => value + 1);
    hapticFeedback("success");
  }

  async function transfer(targetWorkspaceId: string, targetAssigneeId: string, reason: string) {
    if (!transferRecord) return;
    const movementId = transferRecord.movementId;
    await measureAsync("movements.transfer", () => transferMovement({
      movementId,
      targetWorkspaceId,
      targetAssigneeId,
      reason,
    }));
    setRecords((current) => current.filter((record) => record.movementId !== movementId));
    setTransferRecord(null);
    setDataVersion((value) => value + 1);
    hapticFeedback("success");
  }

  if (loading) return <LoadingScreen message="Preparando seus processos..." />;
  if (!settings) return <div className="offline-startup-error"><WifiOff size={34} /><h1>Práxis indisponível</h1><p>{startupError || "Não há dados de contingência disponíveis neste dispositivo."}</p><small>Conecte-se ao servidor ao menos uma vez para preparar a contingência desta Procuradoria.</small></div>;

  const currentWorkspace = workspaces.find((workspace) => workspace.current) ?? workspaces[0];
  const currentWorkspaceOfflineOperations = offlineOperations.filter((operation) => operation.workspaceId === currentWorkspace?.workspaceId);
  const failedOfflineOperations = offlineOperations.filter((operation) => operation.lastError);
  const transferTargets = workspaces.filter((workspace) => !workspace.current && workspace.role === "admin");

  const appClassName = [
    "app",
    sidebarOpen ? "sidebar-visible" : "",
    sidebarCollapsed ? "sidebar-collapsed" : "",
    tableFocusMode ? "table-focus-mode" : "",
  ].filter(Boolean).join(" ");

  const shell = <div className={appClassName}>
    <Sidebar page={page} access={access} onChange={(nextPage) => { hapticFeedback(); setPage(nextPage); setProcessPreset(null); setSidebarOpen(false); setTableFocusMode(false); }} />
    {sidebarOpen && <button type="button" className="sidebar-backdrop" aria-label="Fechar menu lateral" onClick={() => setSidebarOpen(false)} />}
    <main>
      <header className="topbar">
        <button className="mobile-menu icon-button" aria-label="Abrir menu" onClick={() => { hapticFeedback(); setSidebarOpen(!sidebarOpen); }}><Menu /></button>
        <button className="icon-button desktop-sidebar-toggle" title={sidebarCollapsed ? "Expandir menu lateral" : "Recolher menu lateral"} onClick={toggleSidebar}>{sidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}</button>
        {contingencyMode && <div className="online-indicator offline" role="status"><WifiOff size={17} /><span>Contingência</span></div>}
        <WorkspaceSwitcher workspaces={workspaces} currentWorkspaceId={currentWorkspace?.workspaceId} busy={switchingWorkspace} onSwitch={changeWorkspace} />
        <div className="topbar-spacer" />
        <span className="current-user">{currentMember?.fullName || session.user.email}</span>
        <div className="global-font-control" role="group" aria-label="Tamanho da letra do Práxis">
          <button type="button" className={fontSize === "small" ? "active" : ""} aria-label="Letra pequena" title="Letra pequena" onClick={() => onFontSizeChange("small")}>A−</button>
          <button type="button" className={fontSize === "normal" ? "active" : ""} aria-label="Letra padrão" title="Letra padrão" onClick={() => onFontSizeChange("normal")}>A</button>
          <button type="button" className={fontSize === "large" ? "active" : ""} aria-label="Letra grande" title="Letra grande" onClick={() => onFontSizeChange("large")}>A+</button>
        </div>
        <button className="icon-button" title={theme === "dark" ? "Usar modo claro" : "Usar modo noturno"} onClick={onToggleTheme}>{theme === "dark" ? <Sun /> : <Moon />}</button>
        <button className="icon-button" onClick={() => { void (async () => { if (offlineOperations.length && !window.confirm(`Há ${offlineOperations.length} alteração${offlineOperations.length === 1 ? "" : "ões"} ainda não sincronizada${offlineOperations.length === 1 ? "" : "s"}. Sair agora apagará essa fila deste dispositivo. Deseja continuar?`)) return; try { sessionStorage.removeItem("praxis-authenticated-with-passkey"); } catch { /* Sem armazenamento. */ } await clearOfflineUserData(session.user.id).catch(() => undefined); await supabase?.auth.signOut({ scope: "local" }); })(); }} title="Sair"><LogOut /></button>
        {access.canCreateProcess && <button className="button primary new-process-button" aria-label="Novo processo" onClick={() => { hapticFeedback(); setModal(true); }}><Plus /><span>Novo processo</span></button>}
      </header>
      {contingencyMode && <div className="contingency-banner contingency-write-banner" role="status"><WifiOff size={19} /><div><strong>Modo contingência · gravação local</strong><span>Base local sincronizada {offlineSavedAt ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(offlineSavedAt)) : "anteriormente"}. {offlineOperations.length ? `${offlineOperations.length} alteração${offlineOperations.length === 1 ? "" : "ões"} aguardando sincronização.` : "Nenhuma alteração pendente."} Retenção: {offlineRetentionHours()} horas.{recoveringOnline || syncingOffline ? " Sincronizando com o servidor…" : ""}</span></div>{offlineOperations.length > 0 && <button type="button" className="button secondary compact" onClick={() => setOfflineQueueOpen(true)}>Ver fila ({offlineOperations.length})</button>}</div>}
      {!contingencyMode && offlineOperations.length > 0 && <div className={`sync-queue-banner ${failedOfflineOperations.length ? "has-error" : ""}`} role="status"><div><strong>{failedOfflineOperations.length ? "Sincronização requer atenção" : "Alterações locais pendentes"}</strong><span>{currentWorkspaceOfflineOperations.length} nesta Procuradoria · {offlineOperations.length} no dispositivo.</span></div><div className="sync-queue-actions"><button type="button" className="button secondary compact" onClick={() => setOfflineQueueOpen(true)}>Ver fila</button><button type="button" className="button primary compact" disabled={syncingOffline || !currentWorkspaceOfflineOperations.length} onClick={() => void synchronizeCurrentOfflineQueue({ reloadAfter: true })}>{syncingOffline ? "Sincronizando..." : "Sincronizar agora"}</button></div></div>}
      {workspaceError && <div className="info-box workspace-switch-error" role="alert">{workspaceError}</div>}
      {(mobileNavigation.pullDistance >= 72 || mobileNavigation.refreshing) && <div className={`pull-refresh-indicator ${mobileNavigation.refreshing ? "refreshing" : ""}`} aria-live="polite"><RefreshCw size={19} /><span>{mobileNavigation.refreshing ? "Atualizando…" : "Solte para atualizar"}</span></div>}
      <div className={page === "queue" || page === "processes" ? "content content-wide" : "content"}>{workspaceDataLoading && <div className="workspace-data-loading" role="status"><span className="splash-spinner" /><span>Carregando processos da Procuradoria em segundo plano...</span></div>}<Suspense fallback={<div className="page-loading" role="status"><span className="splash-spinner" /><span>Carregando página...</span></div>}>
        {pagePreparing && <div className="page-loading" role="status"><span className="splash-spinner" /><span>Preparando dados desta área...</span></div>}
        {!pagePreparing && pagePreparationError && <div className="info-box">Não foi possível preparar os dados desta área: {pagePreparationError}</div>}
        {!pagePreparing && page === "dashboard" && <Dashboard records={records} currentUserId={session.user.id} currentUserName={currentMember?.fullName || "Meus dados"} onOpenProcesses={(preset) => { setProcessPreset(preset); setPage("processes"); }} onOpenQuality={() => setPage("quality")} canOpenQuality={access.canViewQuality} />}
        {!pagePreparing && page === "queue" && <div className="page-stack wide-data-page"><div className="page-heading"><div><h1>Minha fila</h1><p>Processos pendentes atribuídos a você.</p></div></div><ProcessTable records={records} queueOnly currentUserId={session.user.id} members={members} permissions={access} focusMode={tableFocusMode} onToggleFocusMode={() => setTableFocusMode((value) => !value)} onStatus={status} onAction={action} onAssignment={assignment} onBulkAssignment={bulk} onBulkAction={bulkAction} onBulkArchive={bulkArchive} onBulkDelete={bulkDelete} onDelete={remove} onEdit={openEdit} onExport={saveExport} onPrepareExportRecords={prepareExportRecords} onTransfer={transferTargets.length ? setTransferRecord : undefined} /></div>}
        {!pagePreparing && page === "processes" && <div className="page-stack wide-data-page"><div className="page-heading"><div><h1>Processos</h1><p>Todos os processos da unidade, com filtros e leitura compacta.</p></div></div><ProcessTable records={records} currentUserId={session.user.id} members={members} permissions={access} preset={processPreset} onClearPreset={() => setProcessPreset(null)} focusMode={tableFocusMode} onToggleFocusMode={() => setTableFocusMode((value) => !value)} onStatus={status} onAction={action} onAssignment={assignment} onBulkAssignment={bulk} onBulkAction={bulkAction} onBulkArchive={bulkArchive} onBulkDelete={bulkDelete} onDelete={remove} onEdit={openEdit} onExport={saveExport} onPrepareExportRecords={prepareExportRecords} onArchivedRequested={contingencyMode ? undefined : async () => { await ensureArchivedRecords(); }} onTransfer={transferTargets.length ? setTransferRecord : undefined} /></div>}
        {!pagePreparing && !pagePreparationError && page === "efficiency" && access.efficiencyScope !== "none" && <EfficiencyPage records={records} members={members} currentUserId={session.user.id} accessScope={access.efficiencyScope} />}
        {!pagePreparing && !pagePreparationError && page === "reports" && access.reportsScope !== "none" && <ReportsPage records={records} members={members} currentUserId={session.user.id} onSave={savePdf} onLoadRecords={listReportMovementsFast} accessScope={access.reportsScope} settings={settings} />}
        {!pagePreparing && !pagePreparationError && page === "quality" && access.canViewQuality && <DataQualityPage records={records} members={members} isAdmin onEdit={(record) => void openEdit(record)} onBulkAssignment={bulk} />}
        {!pagePreparing && !pagePreparationError && page === "import" && access.canImport && <ImportPage isAdmin onImport={importRecords} onBackup={createBackup} onChanged={async () => { await reloadAll("import"); }} records={records} classes={classes} exclusions={exclusions} onExport={saveExport} onClear={clearDatabase} onRestoreBackup={restoreBackup} />}
        {!pagePreparing && page === "trash" && <TrashPage refreshKey={dataVersion} onChanged={() => reload("trash")} canManage={access.canManageTrash} />}
        {!pagePreparing && page === "team" && access.canManageTeam && <TeamPage onChanged={reloadReferenceData} />}
        {!pagePreparing && page === "settings" && (access.canManageSettings ? <SettingsPage classes={classes} exclusions={exclusions} members={members} settings={settings} closedPeriods={closed} onSaveClass={async (value) => { await saveClassSetting(value); await reloadReferenceData(); }} onDeleteClass={async (name) => { await deleteClassSetting(name); await reloadReferenceData(); }} onSaveExclusion={async (value) => { await saveCalendarExclusion(value); await reloadReferenceData(); }} onDeleteExclusion={async (date) => { await deleteCalendarExclusion(date); await reloadReferenceData(); }} onSaveMemberAccess={async (id, efficiency, reports) => { await saveMemberAccess(id, efficiency, reports); await reloadReferenceData(); }} onSaveSettings={async (value) => {
          await saveWorkspaceSettings(value);
          configureWorkdaySchedule(value);
          setSettings(value);
          const excludedDates = new Set(exclusions.map((item) => item.date));
          setRecords((current) => current.map((record) => ({
            ...record,
            elapsedHours: usefulElapsedHours(record.receivedAt, record.sentAt, excludedDates),
          })));
          setDataVersion((current) => current + 1);
        }} onClosePeriod={async (year, month, reason) => { await closePeriod(year, month, reason); setClosed(await listClosedPeriods()); }} onReopenPeriod={async (id, reason) => { await reopenPeriod(id, reason); setClosed(await listClosedPeriods()); }} currentWorkspaceId={currentWorkspace?.workspaceId ?? ""} onWorkspacesChanged={async () => { await Promise.all([refreshWorkspaces(), reloadReferenceData()]); }} /> : <PersonalSettingsPage />)}
        {!pagePreparing && page === "audit" && access.canViewAudit && <AdminAuditPage />}
        {!pagePreparing && page === "about" && <AboutPage />}
      </Suspense></div>
    </main>
    {offlineQueueOpen && <OfflineQueuePanel operations={offlineOperations} currentWorkspaceId={currentWorkspace?.workspaceId} syncing={syncingOffline} onClose={() => setOfflineQueueOpen(false)} onRetry={() => synchronizeCurrentOfflineQueue({ reloadAfter: !contingencyMode })} onDiscard={discardOfflineOperation} />}
    {modal && <ProcessModal classes={classes} exclusions={exclusions} members={members} currentUserId={session.user.id} isAdmin={access.canChangeAssignment} offlineMode={contingencyMode} onClose={() => setModal(false)} onSave={save} />}
    {editing && (access.canEditFull || access.canEditNotes) && <EditProcessModal record={editing} classes={classes} members={members} permissions={access} onClose={() => setEditing(null)} onSave={edit} />}
    {transferRecord && currentWorkspace && <ProcessTransferDialog record={transferRecord} currentWorkspaceId={currentWorkspace.workspaceId} workspaces={workspaces} onClose={() => setTransferRecord(null)} onTransfer={transfer} />}
    {showBackToTop && <button type="button" className="back-to-top" aria-label="Voltar ao topo" onClick={() => { hapticFeedback(); window.scrollTo({ top: 0, behavior: "smooth" }); }}><ArrowUp size={20} /><span>Voltar ao topo</span></button>}
  </div>;

  let passkeyAuthenticated = sessionUsesPasskey(session);
  if (!passkeyAuthenticated) {
    try { passkeyAuthenticated = sessionStorage.getItem("praxis-authenticated-with-passkey") === "true"; }
    catch { /* O JWT continua sendo a fonte principal. */ }
  }
  const requiresTotp = Boolean(currentMember?.mfaRequired) && !passkeyAuthenticated;
  return requiresTotp ? <MfaGate>{shell}</MfaGate> : shell;
}

export default function App() {
  const [theme, setTheme] = useState<"light" | "dark">(() => localStorage.getItem("praxis-theme") as "light" | "dark" || "dark");
  const [fontSize, setFontSize] = useState<UiFontSize>(storedFontSize);
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [recovery, setRecovery] = useState(() => location.hash.includes("type=recovery") || location.hash.includes("type=invite"));

  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem("praxis-theme", theme); }, [theme]);
  useEffect(() => {
    document.documentElement.dataset.fontSize = fontSize;
    try { localStorage.setItem("praxis-ui-font-size", fontSize); } catch { /* Preferência não persistente. */ }
  }, [fontSize]);
  useEffect(() => {
    if (!supabase) { setChecking(false); return; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setChecking(false); });
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      setSession(nextSession); setChecking(false);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  if (!supabaseConfigured) return <SetupPage />;
  if (checking) return <LoadingScreen message="Verificando acesso seguro..." />;
  if (recovery && session) return <ResetPasswordPage onDone={async () => { await supabase?.auth.signOut({ scope: "local" }); setRecovery(false); }} />;
  if (!session) return <AuthPage />;
  return <PraxisApp
    session={session}
    theme={theme}
    fontSize={fontSize}
    onFontSizeChange={setFontSize}
    onToggleTheme={() => setTheme((value) => value === "dark" ? "light" : "dark")}
  />;
}
