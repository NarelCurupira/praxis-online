import type { PraxisRole } from "./types";
import { clearWorkspaceContext, workspaceContext } from "./workspaceContext";

export interface AvailableWorkspace {
  workspaceId: string;
  name: string;
  role: PraxisRole;
  current: boolean;
}

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

/**
 * API preparatória para o seletor de Procuradoria da 0.10.8.
 * A 0.10.7.9 não expõe a troca na interface, mas já estabelece o contrato
 * seguro e testável entre frontend e banco.
 */
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
