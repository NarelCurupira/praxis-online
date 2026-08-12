import type { AccessScope, PraxisRole } from "./types";
import { clearWorkspaceContext, workspaceContext } from "./workspaceContext";

export interface AvailableWorkspace {
  workspaceId: string;
  name: string;
  role: PraxisRole;
  current: boolean;
}

export interface AdminWorkspace {
  workspaceId: string;
  name: string;
  current: boolean;
  memberCount: number;
}

export interface WorkspaceDirectoryMember {
  userId: string;
  fullName: string;
  email: string;
  enabled: boolean;
  role: PraxisRole;
  efficiencyAccess: AccessScope;
  reportsAccess: AccessScope;
}

export interface TransferMovementInput {
  movementId: number;
  targetWorkspaceId: string;
  targetAssigneeId: string;
  reason: string;
}

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export async function listAvailableWorkspaces(): Promise<AvailableWorkspace[]> {
  const { client } = await workspaceContext();
  const { data, error } = await client.rpc("list_my_workspaces_v01079");
  fail(error);
  return (data ?? []).map((item: Record<string, unknown>) => ({
    workspaceId: String(item.workspace_id),
    name: String(item.workspace_name ?? "Procuradoria"),
    role: item.role as PraxisRole,
    current: Boolean(item.is_current),
  }));
}

export async function switchWorkspace(workspaceId: string): Promise<void> {
  const { client } = await workspaceContext();
  const { error } = await client.rpc("set_current_workspace_v01079", { target_workspace: workspaceId });
  fail(error);
  clearWorkspaceContext();
}

export async function listAdminWorkspaces(): Promise<AdminWorkspace[]> {
  const { client } = await workspaceContext();
  const { data, error } = await client.rpc("list_admin_workspaces_v01080");
  fail(error);
  return (data ?? []).map((item: Record<string, unknown>) => ({
    workspaceId: String(item.workspace_id),
    name: String(item.workspace_name ?? "Procuradoria"),
    current: Boolean(item.is_current),
    memberCount: Number(item.member_count ?? 0),
  }));
}

export async function createWorkspace(name: string, copyCurrentConfiguration: boolean): Promise<string> {
  const { client } = await workspaceContext();
  const { data, error } = await client.rpc("create_workspace_v01080", {
    workspace_name_value: name.trim(),
    copy_current_configuration: copyCurrentConfiguration,
  });
  fail(error);
  return String(data ?? "");
}

export async function renameWorkspace(workspaceId: string, name: string): Promise<void> {
  const { client } = await workspaceContext();
  const { error } = await client.rpc("rename_workspace_v01080", {
    target_workspace: workspaceId,
    workspace_name_value: name.trim(),
  });
  fail(error);
}

export async function listWorkspaceDirectory(workspaceId: string): Promise<WorkspaceDirectoryMember[]> {
  const { client } = await workspaceContext();
  const { data, error } = await client.rpc("list_workspace_directory_v01080", { target_workspace: workspaceId });
  fail(error);
  return (data ?? []).map((item: Record<string, unknown>) => ({
    userId: String(item.user_id),
    fullName: String(item.full_name ?? ""),
    email: String(item.email ?? ""),
    enabled: Boolean(item.enabled),
    role: (item.role ?? "consulta") as PraxisRole,
    efficiencyAccess: (item.efficiency_access ?? "none") as AccessScope,
    reportsAccess: (item.reports_access ?? "none") as AccessScope,
  }));
}

export async function setWorkspaceMember(input: {
  workspaceId: string;
  userId: string;
  enabled: boolean;
  role: PraxisRole;
  efficiencyAccess: AccessScope;
  reportsAccess: AccessScope;
}): Promise<void> {
  const { client } = await workspaceContext();
  const { error } = await client.rpc("set_workspace_member_v01080", {
    target_workspace: input.workspaceId,
    target_user: input.userId,
    new_enabled: input.enabled,
    new_role: input.role,
    new_efficiency_access: input.efficiencyAccess,
    new_reports_access: input.reportsAccess,
  });
  fail(error);
}

export async function setWorkspaceMembersBatch(workspaceId: string, members: WorkspaceDirectoryMember[]): Promise<void> {
  const { client } = await workspaceContext();
  const payload = members.map((member) => ({
    user_id: member.userId,
    enabled: member.enabled,
    role: member.role,
    efficiency_access: member.efficiencyAccess,
    reports_access: member.reportsAccess,
  }));
  const { error } = await client.rpc("set_workspace_members_batch_v01081", {
    target_workspace: workspaceId,
    members_payload: payload,
  });
  fail(error);
}

export async function transferMovement(input: TransferMovementInput): Promise<void> {
  const { client } = await workspaceContext();
  const { error } = await client.rpc("transfer_movement_v01080", {
    target_movement: input.movementId,
    target_workspace: input.targetWorkspaceId,
    target_assignee: input.targetAssigneeId,
    transfer_reason: input.reason.trim(),
  });
  fail(error);
}
