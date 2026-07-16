"use client";

import { useEffect, useState } from "react";
import { Cloud, LogOut, Menu, Plus } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { clearDatabase, createBackup, createMovement, databaseInfo, deleteCalendarExclusion, deleteClassSetting, deleteMovement, getStorageSettings, importRecords, listBackups, listCalendarExclusions, listClassSettings, listMovements, listTeamMembers, restoreBackup, saveCalendarExclusion, saveClassSetting, saveExport, savePdf, saveStorageDirectory, updateMovement, updateMovementAction, updateMovementAssignment, updateMovementAssignments, updateMovementStatus } from "./api";
import { AboutPage } from "./components/AboutPage";
import { Dashboard } from "./components/Dashboard";
import { DataQualityPage } from "./components/DataQualityPage";
import { EditProcessModal } from "./components/EditProcessModal";
import { ImportPage } from "./components/ImportPage";
import { ProcessModal } from "./components/ProcessModal";
import { ProcessTable } from "./components/ProcessTable";
import { ReportsPage } from "./components/ReportsPage";
import { SettingsPage } from "./components/SettingsPage";
import { Sidebar } from "./components/Sidebar";
import { TrashPage } from "./components/TrashPage";
import { TeamPage } from "./components/TeamPage";
import { AuthPage } from "./components/AuthPage";
import { SetupPage } from "./components/SetupPage";
import { supabase, supabaseConfigured } from "./supabase";
import type { CalendarExclusion, CalendarExclusionRange, ClassSetting, ImportRecord, Page, ProcessEditData, ProcessFormData, ProcessMovement, StorageDirectoryKind, StorageSettings, TeamMember, WorkflowStatus } from "./types";

function PraxisApp({ session }: { session: Session }) {
  const [page, setPage] = useState<Page>("dashboard");
  const [records, setRecords] = useState<ProcessMovement[]>([]);
  const [modal, setModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [classes, setClasses] = useState<ClassSetting[]>([]);
  const [editing, setEditing] = useState<ProcessMovement | null>(null);
  const [exclusions, setExclusions] = useState<CalendarExclusion[]>([]);
  const [dataVersion, setDataVersion] = useState(0);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [storage, setStorage] = useState<StorageSettings>({ backupDirectory: "", exportDirectory: "", reportDirectory: "", backupCustom: false, exportCustom: false, reportCustom: false });

  async function reload() { setRecords(await listMovements()); setDataVersion((value) => value + 1); }
  async function reloadClasses() { setClasses(await listClassSettings()); }
  async function reloadExclusions() { setExclusions(await listCalendarExclusions()); }
  async function reloadStorage() { setStorage(await getStorageSettings()); }
  async function reloadMembers() { setMembers(await listTeamMembers()); }
  async function reloadAll() { await Promise.all([reload(), reloadClasses(), reloadExclusions(), reloadStorage(), reloadMembers(), databaseInfo().then(setInfo)]); }
  useEffect(() => {
    const startedAt = Date.now();
    reloadAll().finally(() => {
      const remaining = Math.max(0, 1100 - (Date.now() - startedAt));
      window.setTimeout(() => setLoading(false), remaining);
    });
  }, []);

  async function save(data: ProcessFormData) { await createMovement(data); await reload(); setModal(false); }
  async function status(id: number, value: WorkflowStatus, actionType?: string) { await updateMovementStatus(id, value, actionType); await reload(); }
  async function action(id: number, actionType: string) { await updateMovementAction(id, actionType); await reload(); }
  async function assignment(id: number, assignedTo: string) { await updateMovementAssignment(id, assignedTo); await reload(); }
  async function bulkAssignment(ids: number[], assignedTo: string) { await updateMovementAssignments(ids, assignedTo); await reload(); }
  async function remove(id: number) { await deleteMovement(id); await reload(); }
  async function runImport(items: ImportRecord[]) { return importRecords(items); }
  async function saveClass(setting: ClassSetting) { await saveClassSetting(setting); await reloadClasses(); }
  async function removeClass(name: string) { await deleteClassSetting(name); await reloadClasses(); }
  async function saveExclusion(data: CalendarExclusionRange) { await saveCalendarExclusion(data); await reloadExclusions(); }
  async function removeExclusion(date: string) { await deleteCalendarExclusion(date); await reloadExclusions(); }
  async function edit(movementId: number, data: ProcessEditData) { await updateMovement(movementId, data); await reload(); setEditing(null); }
  async function saveStorage(kind: StorageDirectoryKind, path: string | null) { await saveStorageDirectory(kind, path); await reloadStorage(); }
  const currentMember = members.find((member) => member.userId === session.user.id);
  const isAdmin = currentMember?.role === "admin";

  if (loading) return <div className="splash-screen" role="status" aria-live="polite">
    <img className="splash-logo" src="/praxis-logo.png" alt="Práxis — Controle de Processos" />
    <div className="splash-progress"><span className="splash-spinner" /><span>Preparando seus processos...</span></div>
  </div>;

  return <div className={sidebarOpen ? "app sidebar-visible" : "app"}>
    <Sidebar page={page} onChange={(next) => { setPage(next); setSidebarOpen(false); }} />
    <main>
      <header className="topbar"><button className="mobile-menu" onClick={() => setSidebarOpen(!sidebarOpen)}><Menu /></button><div className="online-indicator"><Cloud size={17} /><span>Online</span></div><div className="topbar-spacer" /><span className="current-user" title={session.user.email}>{session.user.user_metadata.full_name || session.user.email}</span><button className="icon-button" onClick={() => supabase?.auth.signOut()} title="Sair"><LogOut size={18} /></button><button className="button primary" onClick={() => setModal(true)}><Plus size={18} />Novo processo</button></header>
      <div className="content">
        <>
          {page === "dashboard" && <Dashboard records={records} currentUserId={session.user.id} currentUserName={currentMember?.fullName || session.user.user_metadata.full_name || session.user.email || "Meus dados"} />}
          {page === "queue" && <div className="page-stack"><div className="page-heading"><div><p className="eyebrow">Trabalho em andamento</p><h1>Minha fila</h1><p>Processos atribuídos a você e ainda não enviados.</p></div></div><ProcessTable records={records} queueOnly serverPagination refreshKey={dataVersion} currentUserId={session.user.id} members={members} isAdmin={isAdmin} onStatus={status} onAction={action} onAssignment={assignment} onDelete={remove} onEdit={setEditing} onExport={saveExport} /></div>}
          {page === "processes" && <div className="page-stack"><div className="page-heading"><div><p className="eyebrow">Histórico completo</p><h1>Processos</h1><p>Pesquise todas as entradas e retornos.</p></div></div><ProcessTable records={records} serverPagination refreshKey={dataVersion} members={members} isAdmin={isAdmin} onStatus={status} onAction={action} onAssignment={assignment} onDelete={remove} onEdit={setEditing} onExport={saveExport} /></div>}
          {page === "reports" && <ReportsPage records={records} onSave={savePdf} isAdmin={isAdmin} />}
          {page === "quality" && <DataQualityPage records={records} members={members} isAdmin={isAdmin} onEdit={setEditing} onBulkAssignment={bulkAssignment} />}
          {page === "import" && <ImportPage onImport={runImport} onBackup={createBackup} onChanged={reloadAll} records={records} classes={classes} exclusions={exclusions} onExport={saveExport} onClear={clearDatabase} onListBackups={listBackups} onRestoreBackup={restoreBackup} />}
          {page === "trash" && <TrashPage refreshKey={dataVersion} onChanged={reload} />}
          {page === "team" && <TeamPage />}
          {page === "settings" && <SettingsPage info={info} classes={classes} exclusions={exclusions} storage={storage} onSaveClass={saveClass} onDeleteClass={removeClass} onSaveExclusion={saveExclusion} onDeleteExclusion={removeExclusion} onSaveStorage={saveStorage} />}
          {page === "about" && <AboutPage />}
        </>
      </div>
    </main>
    {modal && <ProcessModal classes={classes} exclusions={exclusions} members={members} currentUserId={session.user.id} isAdmin={isAdmin} onClose={() => setModal(false)} onSave={save} />}
    {editing && <EditProcessModal record={editing} classes={classes} members={members} isAdmin={isAdmin} onClose={() => setEditing(null)} onSave={edit} />}
  </div>;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!supabase) { setChecking(false); return; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setChecking(false); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setChecking(false);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  if (!supabaseConfigured) return <SetupPage />;
  if (checking) return <div className="splash-screen"><img className="splash-logo" src="/praxis-logo.png" alt="Práxis — Controle de Processos" /><div className="splash-progress"><span className="splash-spinner" /><span>Verificando acesso seguro...</span></div></div>;
  if (!session) return <AuthPage />;
  return <PraxisApp session={session} />;
}
