export type WorkflowStatus = "Recebido" | "Em análise" | "Minutado" | "Enviado" | "Sobrestado";
export type Priority = "Baixa" | "Normal" | "Alta" | "Urgente";

export interface ProcessMovement {
  movementId: number;
  caseId: number;
  mpNumber: string;
  judicialNumber: string;
  className: string;
  subject: string;
  receivedAt: string;
  receivedTimePrecise?: boolean;
  deadlineAt: string;
  draftStatus: string;
  workflowStatus: WorkflowStatus;
  sentAt: string | null;
  sentTimePrecise?: boolean;
  actionType: string;
  notes: string;
  priority: Priority;
  documentPath: string;
  elapsedHours: number | null;
  sociallyRelevant: boolean;
  extremelyComplex: boolean;
  socialTheme: string;
  relevanceReason: string;
  fundamentalRight: string;
  affectedGroup: string;
  reach: string;
  territorialScope: string;
  impactType: string;
  socialResult: string;
  sdgs: string[];
  complexityReason: string;
  deletedAt: string | null;
  archivedAt?: string | null;
  assignedTo: string;
  assignedName: string;
}

export interface ProcessFormData {
  assignedTo?: string;
  mpNumber: string;
  judicialNumber: string;
  className: string;
  subject: string;
  receivedAt: string;
  receivedTimePrecise?: boolean;
  deadlineAt: string;
  actionType: string;
  notes: string;
  priority: Priority;
  documentPath: string;
  sociallyRelevant: boolean;
  extremelyComplex: boolean;
  socialTheme: string;
  relevanceReason: string;
  fundamentalRight: string;
  affectedGroup: string;
  reach: string;
  territorialScope: string;
  impactType: string;
  socialResult: string;
  sdgs: string[];
  complexityReason: string;
}

export interface ProcessEditData {
  sensitiveChangeReason?: string;
  assignedTo: string;
  receivedAt: string;
  receivedTimePrecise?: boolean;
  sentAt: string | null;
  sentTimePrecise?: boolean;
  className: string;
  subject: string;
  deadlineAt: string;
  actionType: string;
  notes: string;
  priority: Priority;
  documentPath: string;
  sociallyRelevant: boolean;
  extremelyComplex: boolean;
  socialTheme: string;
  relevanceReason: string;
  fundamentalRight: string;
  affectedGroup: string;
  reach: string;
  territorialScope: string;
  impactType: string;
  socialResult: string;
  sdgs: string[];
  complexityReason: string;
}

export interface ImportRecord extends ProcessFormData {
  draftStatus: string;
  workflowStatus: WorkflowStatus;
  sentAt: string | null;
  sentTimePrecise?: boolean;
}

export interface ImportResult {
  casesCreated: number;
  movementsCreated: number;
  movementsUpdated: number;
  duplicatesLinked: number;
  ignoredRows: number;
}

export interface ClassSetting { name: string; businessDays: number; }
export interface CalendarExclusion { date: string; label: string; }
export interface CalendarExclusionRange { startDate: string; endDate: string; label: string; }
export interface BackupInfo { fileName: string; modifiedAt: string; sizeBytes: number; }
export interface ChangeHistory {
  id: number;
  movementId: number;
  changedAt: string;
  actorName: string;
  actionName: string;
  fieldName: string;
  oldValue: string;
  newValue: string;
}

export type ProcessListPresetKind =
  | "pending"
  | "sent-today"
  | "sent-week"
  | "overdue"
  | "month";

export interface ProcessListPreset {
  kind: ProcessListPresetKind;
  label: string;
  assignedTo?: string;
  year?: number;
  month?: number;
}

export type MovementSortField = "receivedAt" | "judicialNumber" | "mpNumber" | "className" | "deadlineAt" | "actionType" | "workflowStatus" | "assignedName";
export interface MovementQuery {
  page: number; pageSize: number; query: string; status: string; year: string; classification: string;
  assignedTo: string; sortField: MovementSortField; sortDirection: "asc" | "desc"; queueOnly: boolean;
}
export interface PagedMovements { records: ProcessMovement[]; total: number; years: number[]; }
export type StorageDirectoryKind = "backup" | "export" | "report";
export interface StorageSettings { backupDirectory: string; exportDirectory: string; reportDirectory: string; backupCustom: boolean; exportCustom: boolean; reportCustom: boolean; }
export interface BackupStatus { hasValidBackup: boolean; lastValidAt: string | null; backupType: string | null; path: string | null; sizeBytes: number | null; integrityResult: string | null; lastAttemptAt: string | null; lastAttemptOk: boolean | null; message: string; }
export type Page = "dashboard" | "queue" | "processes" | "efficiency" | "reports" | "quality" | "import" | "trash" | "team" | "settings" | "audit" | "about";
export type PraxisRole = "admin" | "procurador" | "assessor" | "estagiario" | "consulta";
export type AccessScope = "none" | "own" | "team";
export interface TeamMember {
  userId: string;
  fullName: string;
  displayName?: string;
  email: string;
  role: PraxisRole;
  active: boolean;
  mfaRequired: boolean;
  historicalCoverageSince?: string | null;
  efficiencyAccess?: AccessScope;
  reportsAccess?: AccessScope;
}
export interface WorkspaceSettings {
  workdayHours: number;
  workdayStart: string;
  workdayEnd: string;
  defaultDeadlineBusinessDays: number;
  countFromNextBusinessDay: boolean;
  afterHoursPolicy: "keep" | "next_business_day";
  unitName: string;
  leadProsecutor: string;
  reportFooter: string;
  defaultReportMode: "executive" | "complete" | "highlights";
  defaultReportPeriod: "month" | "30days" | "year";
  allowNamedComparisons: boolean;
  requireActionOnSend: boolean;
  requireAssigneeOnProgress: boolean;
  detectDuplicates: boolean;
  requireDateChangeReason: boolean;
  blockClosedPeriods: boolean;
}
export interface ClosedPeriod {
  id: number;
  year: number;
  month: number;
  closedAt: string;
  closedByName: string;
  reason: string;
  reopenedAt: string | null;
  reopenedByName: string;
  reopenReason: string;
}
export interface ProcessPermissions {
  canEditWorkflow: boolean;
  canEditNotes: boolean;
  canEditFull: boolean;
  canChangeAssignment: boolean;
  canChangeReceivedAt: boolean;
  canChangeSentAt: boolean;
  canDelete: boolean;
  canExport: boolean;
}
export interface TeamComparison { userId: string; fullName: string; email: string; role: PraxisRole; received: number; sent: number; pending: number; onTime: number; averageHours: number | null; }
export interface AdminAuditEntry { id: number; createdAt: string; eventType: string; actorName: string; actorEmail: string; details: Record<string, unknown>; }
