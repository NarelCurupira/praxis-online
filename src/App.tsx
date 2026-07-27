"use client";
import { useEffect, useMemo, useState } from "react";
import { Cloud, LogOut, Menu, Moon, PanelLeftClose, PanelLeftOpen, Plus, Sun } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { clearDatabase, createBackup, createMovement, deleteCalendarExclusion, deleteClassSetting, deleteMovement, importRecords, restoreBackup, saveCalendarExclusion, saveClassSetting, saveExport, savePdf, updateMovementAction, updateMovementAssignment, updateMovementAssignments, updateMovementStatus } from "./api";
import { closePeriod, getWorkspaceSettings, listClosedPeriods, listGovernanceMembers, reopenPeriod, saveMemberAccess, saveWorkspaceSettings, updateMovementGoverned } from "./governanceApi";
import { resolveAccess } from "./access";
import { AboutPage } from "./components/AboutPage";
import { AdminAuditPage } from "./components/AdminAuditPage";
import { AuthPage } from "./components/AuthPage";
import { Dashboard } from "./components/Dashboard";
import { DataQualityPage } from "./components/DataQualityPage";
import { EditProcessModal } from "./components/EditProcessModal";
import { EfficiencyPage } from "./components/EfficiencyPage";
import { ImportPage } from "./components/ImportPage";
import { MfaGate } from "./components/MfaGate";
import { ProcessModal } from "./components/ProcessModal";
import { ProcessTable } from "./components/ProcessTable";
import { ReportsPage } from "./components/ReportsPage";
import { ResetPasswordPage } from "./components/ResetPasswordPage";
import { SettingsPage } from "./components/SettingsPage";
import { SetupPage } from "./components/SetupPage";
import { Sidebar } from "./components/Sidebar";
import { TeamPage } from "./components/TeamPage";
import { TrashPage } from "./components/TrashPage";
import { supabase, supabaseConfigured } from "./supabase";
import type { CalendarExclusion, ClassSetting, ClosedPeriod, Page, ProcessEditData, ProcessFormData, ProcessMovement, TeamMember, WorkflowStatus, WorkspaceSettings } from "./types";
import { useIdleSession } from "./useIdleSession";
import { configureWorkdaySchedule, usefulElapsedHours } from "./date";
import { measureAsync } from "./performanceMonitoring";
import { PRAXIS_VERSION } from "./version";
import { listCalendarExclusionsFast, listClassSettingsFast, listMovementsFast } from "./fastApi";

function LoadingScreen({ message }: { message: string }) {
  return <div className="splash-screen"><img className="splash-logo" src="/praxis-logo.png" /><div className="splash-version">Práxis Web · Versão {PRAXIS_VERSION}</div><div className="splash-progress"><span className="splash-spinner" /><span>{message}</span></div></div>;
}

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

  async function reload() {
    const nextRecords = await measureAsync("movements.reload", () => listMovementsFast({ force: true }));
    setRecords(nextRecords);
    setDataVersion((value) => value + 1);
  }

  async function reloadAll() {
    const [nextSettings, nextRecords, nextClasses, nextExclusions, nextMembers, nextClosed] = await measureAsync("app.reloadAll", () => Promise.all([
      getWorkspaceSettings(), listMovementsFast({ force: true }), listClassSettingsFast(), listCalendarExclusionsFast(), listGovernanceMembers(), listClosedPeriods(),
    ]));
    configureWorkdaySchedule(nextSettings);
    setRecords(nextRecords);
    setClasses(nextClasses);
    setExclusions(nextExclusions);
    setMembers(nextMembers);
    setSettings(nextSettings);
    setClosed(nextClosed);
    setDataVersion((value) => value + 1);
  }

  useEffect(() => { reloadAll().finally(() => setLoading(false)); }, []);

  useEffect(() => {
    const markOnline = () => setOnline(true);
    const markOffline = () => setOnline(false);
    window.addEventListener("online", markOnline);
    window.addEventListener("offline", markOffline);
    return () => { window.removeEventListener("online", markOnline); window.removeEventListener("offline", markOffline); };
  }, []);

  const currentMember = members.find((member) => member.userId === session.user.id);
  const access = useMemo(() => resolveAccess(currentMember), [currentMember]);

  useEffect(() => {
    if (!access.visiblePages.has(page)) setPage("dashboard");
  }, [access, page]);

  useEffect(() => {
    if (page !== "queue" && page !== "processes") setTableFocusMode(false);
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
    setRecords((current) => [created, ...current.filter((item) => item.movementId !== created.movementId)]);
    setDataVersion((value) => value + 1);
    setModal(false);
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
    }));
    setDataVersion((value) => value + 1);
    setEditing(null);
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
  }

  async function action(id: number, actionType: string) {
    await measureAsync("movements.action", () => updateMovementAction(id, actionType));
    setRecords((current) => current.map((record) => record.movementId === id ? { ...record, actionType } : record));
  }

  async function assignment(id: number, userId: string) {
    await measureAsync("movements.assignment", () => updateMovementAssignment(id, userId));
    const assignedName = members.find((member) => member.userId === userId)?.fullName || "";
    setRecords((current) => current.map((record) => record.movementId === id ? { ...record, assignedTo: userId, assignedName } : record));
  }

  async function bulk(ids: number[], userId: string) {
    await measureAsync("movements.bulkAssignment", () => updateMovementAssignments(ids, userId));
    const selected = new Set(ids);
    const assignedName = members.find((member) => member.userId === userId)?.fullName || "";
    setRecords((current) => current.map((record) => selected.has(record.movementId) ? { ...record, assignedTo: userId, assignedName } : record));
  }

  async function remove(id: number) {
    await measureAsync("movements.delete", () => deleteMovement(id));
    setRecords((current) => current.filter((record) => record.movementId !== id));
    setDataVersion((value) => value + 1);
  }

  if (loading || !settings) return <LoadingScreen message="Preparando seus processos..." />;

  const appClassName = [
    "app",
    sidebarOpen ? "sidebar-visible" : "",
    sidebarCollapsed ? "sidebar-collapsed" : "",
    tableFocusMode ? "table-focus-mode" : "",
  ].filter(Boolean).join(" ");

  const shell = <div className={appClassName}>
    <Sidebar page={page} access={access} onChange={(nextPage) => { setPage(nextPage); setSidebarOpen(false); setTableFocusMode(false); }} />
    <main>
      <header className="topbar">
        <button className="mobile-menu" onClick={() => setSidebarOpen(!sidebarOpen)}><Menu /></button>
        <button className="icon-button desktop-sidebar-toggle" title={sidebarCollapsed ? "Expandir menu lateral" : "Recolher menu lateral"} onClick={toggleSidebar}>{sidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}</button>
        <div className={`online-indicator ${online ? "" : "offline"}`}><Cloud size={17} /><span>{online ? "Online" : "Sem conexão"}</span></div>
        <div className="topbar-spacer" />
        <span className="current-user">{currentMember?.fullName || session.user.email}</span>
        <div className="global-font-control" role="group" aria-label="Tamanho da letra do Práxis">
          <button type="button" className={fontSize === "small" ? "active" : ""} aria-label="Letra pequena" title="Letra pequena" onClick={() => onFontSizeChange("small")}>A−</button>
          <button type="button" className={fontSize === "normal" ? "active" : ""} aria-label="Letra padrão" title="Letra padrão" onClick={() => onFontSizeChange("normal")}>A</button>
          <button type="button" className={fontSize === "large" ? "active" : ""} aria-label="Letra grande" title="Letra grande" onClick={() => onFontSizeChange("large")}>A+</button>
        </div>
        <button className="icon-button" title={theme === "dark" ? "Usar modo claro" : "Usar modo noturno"} onClick={onToggleTheme}>{theme === "dark" ? <Sun /> : <Moon />}</button>
        <button className="icon-button" onClick={() => supabase?.auth.signOut()}><LogOut /></button>
        {access.canCreateProcess && <button className="button primary" onClick={() => setModal(true)}><Plus />Novo processo</button>}
      </header>
      <div className={page === "queue" || page === "processes" ? "content content-wide" : "content"}>
        {page === "dashboard" && <Dashboard records={records} currentUserId={session.user.id} currentUserName={currentMember?.fullName || "Meus dados"} isAdmin={access.canViewTeamDashboard} />}
        {page === "queue" && <div className="page-stack wide-data-page"><div className="page-heading"><div><h1>Minha fila</h1><p>Processos pendentes atribuídos a você.</p></div></div><ProcessTable records={records} queueOnly currentUserId={session.user.id} members={members} permissions={access} focusMode={tableFocusMode} onToggleFocusMode={() => setTableFocusMode((value) => !value)} onStatus={status} onAction={action} onAssignment={assignment} onDelete={remove} onEdit={setEditing} onExport={saveExport} /></div>}
        {page === "processes" && <div className="page-stack wide-data-page"><div className="page-heading"><div><h1>Processos</h1><p>Todos os processos da unidade, com filtros e leitura compacta.</p></div></div><ProcessTable records={records} currentUserId={session.user.id} members={members} permissions={access} focusMode={tableFocusMode} onToggleFocusMode={() => setTableFocusMode((value) => !value)} onStatus={status} onAction={action} onAssignment={assignment} onDelete={remove} onEdit={setEditing} onExport={saveExport} /></div>}
        {page === "efficiency" && access.efficiencyScope !== "none" && <EfficiencyPage records={records} members={members} currentUserId={session.user.id} accessScope={access.efficiencyScope} />}
        {page === "reports" && access.reportsScope !== "none" && <ReportsPage records={records} members={members} currentUserId={session.user.id} onSave={savePdf} accessScope={access.reportsScope} settings={settings} />}
        {page === "quality" && access.canViewQuality && <DataQualityPage records={records} members={members} isAdmin onEdit={setEditing} onBulkAssignment={bulk} />}
        {page === "import" && access.canImport && <ImportPage isAdmin onImport={importRecords} onBackup={createBackup} onChanged={reloadAll} records={records} classes={classes} exclusions={exclusions} onExport={saveExport} onClear={clearDatabase} onRestoreBackup={restoreBackup} />}
        {page === "trash" && <TrashPage refreshKey={dataVersion} onChanged={reload} canManage={access.canManageTrash} />}
        {page === "team" && access.canManageTeam && <TeamPage onChanged={reloadAll} />}
        {page === "settings" && access.canManageSettings && <SettingsPage classes={classes} exclusions={exclusions} members={members} settings={settings} closedPeriods={closed} onSaveClass={async (value) => { await saveClassSetting(value); await reloadAll(); }} onDeleteClass={async (name) => { await deleteClassSetting(name); await reloadAll(); }} onSaveExclusion={async (value) => { await saveCalendarExclusion(value); await reloadAll(); }} onDeleteExclusion={async (date) => { await deleteCalendarExclusion(date); await reloadAll(); }} onSaveMemberAccess={async (id, efficiency, reports) => { await saveMemberAccess(id, efficiency, reports); await reloadAll(); }} onSaveSettings={async (value) => {
          await saveWorkspaceSettings(value);
          configureWorkdaySchedule(value);
          setSettings(value);
          await reload();
        }} onClosePeriod={async (year, month, reason) => { await closePeriod(year, month, reason); setClosed(await listClosedPeriods()); }} onReopenPeriod={async (id, reason) => { await reopenPeriod(id, reason); setClosed(await listClosedPeriods()); }} />}
        {page === "audit" && access.canViewAudit && <AdminAuditPage />}
        {page === "about" && <AboutPage />}
      </div>
    </main>
    {modal && <ProcessModal classes={classes} exclusions={exclusions} members={members} currentUserId={session.user.id} isAdmin={access.canChangeAssignment} onClose={() => setModal(false)} onSave={save} />}
    {editing && (access.canEditFull || access.canEditNotes) && <EditProcessModal record={editing} classes={classes} members={members} permissions={access} onClose={() => setEditing(null)} onSave={edit} />}
  </div>;

  return (access.role === "admin" || currentMember?.mfaRequired) ? <MfaGate>{shell}</MfaGate> : shell;
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
