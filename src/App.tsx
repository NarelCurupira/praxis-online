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
const ReportsPage = lazy(() => import("./components/ReportsPage").then((module) => ({ default: module.ReportsPage })));
import { ResetPasswordPage } from "./components/ResetPasswordPage";
const SettingsPage = lazy(() => import("./components/SettingsPage").then((module) => ({ default: module.SettingsPage })));
import { SetupPage } from "./components/SetupPage";
import { Sidebar } from "./components/Sidebar";
const TeamPage = lazy(() => import("./components/TeamPage").then((module) => ({ default: module.TeamPage })));
const TrashPage = lazy(() => import("./components/TrashPage").then((module) => ({ default: module.TrashPage })));
import { supabase, supabaseConfigured } from "./supabase";
import type { CalendarExclusion, ClassSetting, ClosedPeriod, Page, ProcessEditData, ProcessFormData, ProcessListPreset, ProcessMovement, TeamMember, WorkflowStatus, WorkspaceSettings } from "./types";
import { useIdleSession } from "./useIdleSession";
import { configureWorkdaySchedule, usefulElapsedHours } from "./date";
import { measureAsync } from "./performanceMonitoring";
import { SplashScreen } from "./components/SplashScreen";
import { getMovementDetailsBatchFast, getMovementDetailsFast, listArchivedMovementsFast, listCalendarExclusionsFast, listClassSettingsFast, listDetailedMovementsFast, listMovementsFast, type MovementLoadReason } from "./fastApi";
import { hapticFeedback, useMobileNavigation } from "./mobileInteractions";

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

  async function reload(reason: MovementLoadReason = "refresh") {
    const detailPage = page === "reports" || page === "quality" || page === "import";
    const nextRecords = await measureAsync(`movements.reload.${reason}`, async () => {
      if (detailPage) {
        return listDetailedMovementsFast({ includeArchived: true, reason });
      }
      const [active, archived] = await Promise.all([
        listMovementsFast({ force: true, reason }),
        archivedLoaded ? listArchivedMovementsFast({ force: true, reason: "archive" }) : Promise.resolve([]),
      ]);
      return [...active, ...archived];
    });
    setRecords(nextRecords);
    if (detailPage) {
      setArchivedLoaded(true);
      setAllDetailsLoaded(true);
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

    if (page === "reports" || page === "quality" || page === "import") {
      const detailed = await listDetailedMovementsFast({ includeArchived: true, reason: "detail" });
      setRecords(detailed);
      setArchivedLoaded(true);
      setAllDetailsLoaded(true);
    }

    setDataVersion((value) => value + 1);
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

  useEffect(() => { reloadAll("initial").finally(() => setLoading(false)); }, []);

  useEffect(() => {
    const markOnline = () => setOnline(true);
    const markOffline = () => setOnline(false);
    window.addEventListener("online", markOnline);
    window.addEventListener("offline", markOffline);
    return () => { window.removeEventListener("online", markOnline); window.removeEventListener("offline", markOffline); };
  }, []);

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
    onRefresh: () => reload("pull"),
  });

  const currentMember = members.find((member) => member.userId === session.user.id);
  const access = useMemo(() => resolveAccess(currentMember), [currentMember]);

  useEffect(() => {
    if (!access.visiblePages.has(page)) setPage("dashboard");
  }, [access, page]);

  useEffect(() => {
    if (page !== "queue" && page !== "processes") setTableFocusMode(false);
  }, [page]);

  useEffect(() => {
    let cancelled = false;
    const prepare = async () => {
      const needsDetails = page === "reports" || page === "quality" || page === "import";
      const needsArchive = page === "efficiency";
      if (!needsDetails && !needsArchive) {
        setPagePreparing(false);
        setPagePreparationError("");
        return;
      }
      setPagePreparing(true);
      setPagePreparationError("");
      try {
        if (needsDetails) await ensureAllDetailedRecords("detail");
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

  async function save(data: ProcessFormData) {
    const created = await measureAsync("movements.create", () => createMovement(data));
    setRecords((current) => [{ ...created, detailsLoaded: true }, ...current.filter((item) => item.movementId !== created.movementId)]);
    setDataVersion((value) => value + 1);
    setModal(false);
    hapticFeedback("success");
  }

  async function edit(id: number, data: ProcessEditData) {
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
  }

  async function status(id: number, value: WorkflowStatus, actionType?: string) {
    const sentAt = value === "Enviado" ? new Date().toISOString() : null;
    await measureAsync("movements.status", () => updateMovementStatus(id, value, actionType));
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
    setDataVersion((value) => value + 1);
    hapticFeedback("success");
  }

  async function action(id: number, actionType: string) {
    await measureAsync("movements.action", () => updateMovementAction(id, actionType));
    setRecords((current) => current.map((record) => record.movementId === id ? { ...record, actionType } : record));
    hapticFeedback("success");
  }

  async function assignment(id: number, userId: string) {
    await measureAsync("movements.assignment", () => updateMovementAssignment(id, userId));
    const assignedName = members.find((member) => member.userId === userId)?.fullName || "";
    setRecords((current) => current.map((record) => record.movementId === id ? { ...record, assignedTo: userId, assignedName } : record));
    hapticFeedback("success");
  }

  async function bulk(ids: number[], userId: string) {
    await measureAsync("movements.bulkAssignment", () => updateMovementAssignments(ids, userId));
    const selected = new Set(ids);
    const assignedName = members.find((member) => member.userId === userId)?.fullName || "";
    setRecords((current) => current.map((record) => selected.has(record.movementId) ? { ...record, assignedTo: userId, assignedName } : record));
  }

  async function bulkAction(ids: number[], actionType: string) {
    await measureAsync("movements.bulkAction", () => updateMovementActions(ids, actionType));
    const selected = new Set(ids);
    setRecords((current) => current.map((record) => selected.has(record.movementId) ? { ...record, actionType } : record));
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

  if (loading || !settings) return <LoadingScreen message="Preparando seus processos..." />;

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
        {!online && <div className="online-indicator offline" role="status"><WifiOff size={17} /><span>Sem conexão</span></div>}
        <div className="topbar-spacer" />
        <span className="current-user">{currentMember?.fullName || session.user.email}</span>
        <div className="global-font-control" role="group" aria-label="Tamanho da letra do Práxis">
          <button type="button" className={fontSize === "small" ? "active" : ""} aria-label="Letra pequena" title="Letra pequena" onClick={() => onFontSizeChange("small")}>A−</button>
          <button type="button" className={fontSize === "normal" ? "active" : ""} aria-label="Letra padrão" title="Letra padrão" onClick={() => onFontSizeChange("normal")}>A</button>
          <button type="button" className={fontSize === "large" ? "active" : ""} aria-label="Letra grande" title="Letra grande" onClick={() => onFontSizeChange("large")}>A+</button>
        </div>
        <button className="icon-button" title={theme === "dark" ? "Usar modo claro" : "Usar modo noturno"} onClick={onToggleTheme}>{theme === "dark" ? <Sun /> : <Moon />}</button>
        <button className="icon-button" onClick={() => { try { sessionStorage.removeItem("praxis-authenticated-with-passkey"); } catch { /* Sem armazenamento. */ } void supabase?.auth.signOut(); }}><LogOut /></button>
        {access.canCreateProcess && <button className="button primary new-process-button" aria-label="Novo processo" onClick={() => { hapticFeedback(); setModal(true); }}><Plus /><span>Novo processo</span></button>}
      </header>
      {(mobileNavigation.pullDistance >= 72 || mobileNavigation.refreshing) && <div className={`pull-refresh-indicator ${mobileNavigation.refreshing ? "refreshing" : ""}`} aria-live="polite"><RefreshCw size={19} /><span>{mobileNavigation.refreshing ? "Atualizando…" : "Solte para atualizar"}</span></div>}
      <div className={page === "queue" || page === "processes" ? "content content-wide" : "content"}><Suspense fallback={<div className="page-loading" role="status"><span className="splash-spinner" /><span>Carregando página...</span></div>}>
        {pagePreparing && <div className="page-loading" role="status"><span className="splash-spinner" /><span>Preparando dados desta área...</span></div>}
        {!pagePreparing && pagePreparationError && <div className="info-box">Não foi possível preparar os dados desta área: {pagePreparationError}</div>}
        {!pagePreparing && page === "dashboard" && <Dashboard records={records} currentUserId={session.user.id} currentUserName={currentMember?.fullName || "Meus dados"} onOpenProcesses={(preset) => { setProcessPreset(preset); setPage("processes"); }} onOpenQuality={() => setPage("quality")} canOpenQuality={access.canViewQuality} />}
        {!pagePreparing && page === "queue" && <div className="page-stack wide-data-page"><div className="page-heading"><div><h1>Minha fila</h1><p>Processos pendentes atribuídos a você.</p></div></div><ProcessTable records={records} queueOnly currentUserId={session.user.id} members={members} permissions={access} focusMode={tableFocusMode} onToggleFocusMode={() => setTableFocusMode((value) => !value)} onStatus={status} onAction={action} onAssignment={assignment} onBulkAssignment={bulk} onBulkAction={bulkAction} onBulkArchive={bulkArchive} onBulkDelete={bulkDelete} onDelete={remove} onEdit={openEdit} onExport={saveExport} onPrepareExportRecords={prepareExportRecords} /></div>}
        {!pagePreparing && page === "processes" && <div className="page-stack wide-data-page"><div className="page-heading"><div><h1>Processos</h1><p>Todos os processos da unidade, com filtros e leitura compacta.</p></div></div><ProcessTable records={records} currentUserId={session.user.id} members={members} permissions={access} preset={processPreset} onClearPreset={() => setProcessPreset(null)} focusMode={tableFocusMode} onToggleFocusMode={() => setTableFocusMode((value) => !value)} onStatus={status} onAction={action} onAssignment={assignment} onBulkAssignment={bulk} onBulkAction={bulkAction} onBulkArchive={bulkArchive} onBulkDelete={bulkDelete} onDelete={remove} onEdit={openEdit} onExport={saveExport} onPrepareExportRecords={prepareExportRecords} onArchivedRequested={ensureArchivedRecords} /></div>}
        {!pagePreparing && !pagePreparationError && page === "efficiency" && access.efficiencyScope !== "none" && <EfficiencyPage records={records} members={members} currentUserId={session.user.id} accessScope={access.efficiencyScope} />}
        {!pagePreparing && !pagePreparationError && page === "reports" && access.reportsScope !== "none" && <ReportsPage records={records} members={members} currentUserId={session.user.id} onSave={savePdf} accessScope={access.reportsScope} settings={settings} />}
        {!pagePreparing && !pagePreparationError && page === "quality" && access.canViewQuality && <DataQualityPage records={records} members={members} isAdmin onEdit={(record) => void openEdit(record)} onBulkAssignment={bulk} />}
        {!pagePreparing && !pagePreparationError && page === "import" && access.canImport && <ImportPage isAdmin onImport={importRecords} onBackup={createBackup} onChanged={() => reloadAll("import")} records={records} classes={classes} exclusions={exclusions} onExport={saveExport} onClear={clearDatabase} onRestoreBackup={restoreBackup} />}
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
        }} onClosePeriod={async (year, month, reason) => { await closePeriod(year, month, reason); setClosed(await listClosedPeriods()); }} onReopenPeriod={async (id, reason) => { await reopenPeriod(id, reason); setClosed(await listClosedPeriods()); }} /> : <PersonalSettingsPage />)}
        {!pagePreparing && page === "audit" && access.canViewAudit && <AdminAuditPage />}
        {!pagePreparing && page === "about" && <AboutPage />}
      </Suspense></div>
    </main>
    {modal && <ProcessModal classes={classes} exclusions={exclusions} members={members} currentUserId={session.user.id} isAdmin={access.canChangeAssignment} onClose={() => setModal(false)} onSave={save} />}
    {editing && (access.canEditFull || access.canEditNotes) && <EditProcessModal record={editing} classes={classes} members={members} permissions={access} onClose={() => setEditing(null)} onSave={edit} />}
    {showBackToTop && <button type="button" className="back-to-top" aria-label="Voltar ao topo" onClick={() => { hapticFeedback(); window.scrollTo({ top: 0, behavior: "smooth" }); }}><ArrowUp size={20} /><span>Voltar ao topo</span></button>}
  </div>;

  let passkeyAuthenticated = sessionUsesPasskey(session);
  if (!passkeyAuthenticated) {
    try { passkeyAuthenticated = sessionStorage.getItem("praxis-authenticated-with-passkey") === "true"; }
    catch { /* O JWT continua sendo a fonte principal. */ }
  }
  const requiresTotp = access.role === "admin" && !passkeyAuthenticated;
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
