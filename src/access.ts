import type { AccessScope, Page, ProcessPermissions, TeamMember } from "./types";

export interface AccessCapabilities extends ProcessPermissions {
  role: TeamMember["role"];
  efficiencyScope: AccessScope;
  reportsScope: AccessScope;
  visiblePages: Set<Page>;
  canCreateProcess: boolean;
  canManageTrash: boolean;
  canManageTeam: boolean;
  canManageSettings: boolean;
  canImport: boolean;
  canViewQuality: boolean;
  canViewAudit: boolean;
  canViewTeamDashboard: boolean;
}

function scopeFor(member: TeamMember, kind: "efficiency" | "reports"): AccessScope {
  if (member.role === "admin" || member.role === "procurador") return "team";
  if (member.role === "estagiario" || member.role === "consulta") return "none";
  return kind === "efficiency"
    ? member.efficiencyAccess ?? "own"
    : member.reportsAccess ?? "own";
}

export function resolveAccess(member: TeamMember | undefined): AccessCapabilities {
  const role = member?.role ?? "consulta";
  const efficiencyScope = member ? scopeFor(member, "efficiency") : "none";
  const reportsScope = member ? scopeFor(member, "reports") : "none";
  const isAdmin = role === "admin";
  const isProsecutor = role === "procurador";
  const isAssessor = role === "assessor";
  const isIntern = role === "estagiario";
  const writer = isAdmin || isProsecutor || isAssessor;

  // Configurações fica visível para todos os usuários autenticados. Para quem
  // não é administrador, a página apresenta somente as opções pessoais de
  // passkey/biometria; as configurações institucionais permanecem restritas.
  const visiblePages = new Set<Page>(["dashboard", "queue", "processes", "settings", "about"]);
  if (!isIntern) visiblePages.add("trash");
  if (efficiencyScope !== "none") visiblePages.add("efficiency");
  if (reportsScope !== "none") visiblePages.add("reports");
  if (isAdmin) {
    ["quality", "import", "team", "audit"].forEach((page) => visiblePages.add(page as Page));
  }

  return {
    role,
    efficiencyScope,
    reportsScope,
    visiblePages,
    canCreateProcess: writer,
    canEditWorkflow: writer || isIntern,
    canEditNotes: writer || isIntern,
    canEditFull: writer,
    canChangeAssignment: writer,
    canChangeReceivedAt: isAdmin,
    canChangeSentAt: isAdmin,
    canDelete: writer,
    canExport: !isIntern && role !== "consulta",
    canTransferProcess: isAdmin,
    canManageTrash: isAdmin,
    canManageTeam: isAdmin,
    canManageSettings: isAdmin,
    canImport: isAdmin,
    canViewQuality: isAdmin,
    canViewAudit: isAdmin,
    canViewTeamDashboard: isAdmin || isProsecutor,
  };
}
