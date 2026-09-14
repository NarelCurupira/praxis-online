import { workspaceContext } from "./workspaceContext";
import { toStorageTimestamp } from "./date";
import type { ProcessMovement } from "./types";

type Revision = Pick<ProcessMovement, "rowVersion" | "caseUpdatedAt">;
const revisions = new Map<number, Revision>();
export function rememberRevision(record: ProcessMovement): ProcessMovement {
  revisions.set(record.movementId, { rowVersion: record.rowVersion, caseUpdatedAt: record.caseUpdatedAt });
  return record;
}
export function revisionFor(id: number): Revision { return revisions.get(id) ?? {}; }
export function clearMovementRevisions(): void { revisions.clear(); }
export async function applyMovementOperation(kind: string, id: number | null, data: object, options: { operationId?: string; baseline?: Revision; workspaceId?: string; userId?: string } = {}): Promise<number> {
  const { client, workspaceId, user } = await workspaceContext();
  if (options.workspaceId && options.workspaceId !== workspaceId || options.userId && options.userId !== user.id) throw new Error("Sessão ou Procuradoria alterada. Sincronização interrompida.");
  const payload = { ...data } as Record<string, unknown>;
  for (const field of ["receivedAt", "sentAt", "occurredAt"]) if (field in payload) payload[field] = toStorageTimestamp(payload[field] as string | null);
  const revision = options.baseline ?? (id == null ? {} : revisionFor(id));
  const { data: result, error } = await client.rpc("apply_movement_operation_v11", {
    target_workspace: workspaceId, operation_id: options.operationId ?? crypto.randomUUID(),
    operation_kind: kind, target_movement: id, payload,
    expected_version: revision.rowVersion ?? null, expected_case_updated_at: revision.caseUpdatedAt ?? null,
  });
  if (error) throw new Error(error.code === "PGRST202" ? "Execute o SQL da versão 1.1 no Supabase antes de gravar." : error.message);
  const movementId = Number(result.id);
  // A revisão vem da própria transação, sem uma leitura posterior que poderia
  // incorporar a versão de outra escrita sem os dados correspondentes.
  revisions.set(movementId, { rowVersion: Number(result.rowVersion), caseUpdatedAt: String(result.caseUpdatedAt) });
  return movementId;
}
