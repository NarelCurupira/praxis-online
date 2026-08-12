import type { CalendarExclusion, ClassSetting, ClosedPeriod, ProcessEditData, ProcessFormData, ProcessMovement, TeamMember, WorkflowStatus, WorkspaceSettings } from "./types";
import type { AvailableWorkspace } from "./workspaceApi";

const DB_NAME = "praxis-offline-v1";
const DB_VERSION = 2;
const SNAPSHOTS = "snapshots";
const META = "meta";
const SYNC_QUEUE = "sync_queue";
const RETENTION_MS = 3 * 24 * 60 * 60 * 1000;

export interface OfflineWorkspaceSnapshot {
  key: string;
  userId: string;
  workspaceId: string;
  workspaceName: string;
  workspaceRole: AvailableWorkspace["role"];
  savedAt: string;
  records: ProcessMovement[];
  classes: ClassSetting[];
  exclusions: CalendarExclusion[];
  members: TeamMember[];
  settings: WorkspaceSettings;
  closedPeriods: ClosedPeriod[];
}

export type OfflineOperationKind = "create" | "edit" | "status" | "action" | "assignment";

export type OfflineOperationPayload =
  | { kind: "create"; data: ProcessFormData }
  | { kind: "edit"; data: ProcessEditData }
  | { kind: "status"; status: WorkflowStatus; actionType?: string }
  | { kind: "action"; actionType: string }
  | { kind: "assignment"; assignedTo: string };

export interface OfflineOperation {
  id: string;
  userId: string;
  workspaceId: string;
  workspaceName: string;
  movementId: number | null;
  tempMovementId: number | null;
  processLabel: string;
  payload: OfflineOperationPayload;
  createdAt: string;
  attempts: number;
  lastError: string;
}

export type OfflineOperationInput = Omit<OfflineOperation, "id" | "createdAt" | "attempts" | "lastError">;

interface OfflineMeta {
  key: string;
  value: string;
}

function supported(): boolean {
  return typeof indexedDB !== "undefined";
}

function snapshotKey(userId: string, workspaceId: string): string {
  return `${userId}:${workspaceId}`;
}

function currentKey(userId: string): string {
  return `current:${userId}`;
}

function operationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function allocateOfflineMovementId(): number {
  const random = Math.floor(Math.random() * 1000);
  return -(Date.now() * 1000 + random);
}

function openDb(): Promise<IDBDatabase> {
  if (!supported()) return Promise.reject(new Error("IndexedDB indisponível neste navegador."));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SNAPSHOTS)) {
        const store = db.createObjectStore(SNAPSHOTS, { keyPath: "key" });
        store.createIndex("userId", "userId", { unique: false });
      }
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: "key" });
      if (!db.objectStoreNames.contains(SYNC_QUEUE)) {
        const store = db.createObjectStore(SYNC_QUEUE, { keyPath: "id" });
        store.createIndex("userId", "userId", { unique: false });
        store.createIndex("workspaceId", "workspaceId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Não foi possível abrir o armazenamento de contingência."));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Falha no armazenamento de contingência."));
  });
}

function transactionDone(tx: IDBTransaction, message: string): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error(message));
    tx.onabort = () => reject(tx.error ?? new Error(message));
  });
}

async function metaValue(key: string): Promise<string | null> {
  if (!supported()) return null;
  const db = await openDb();
  try {
    const tx = db.transaction(META, "readonly");
    const item = await requestResult(tx.objectStore(META).get(key) as IDBRequest<OfflineMeta | undefined>);
    return item?.value ?? null;
  } finally {
    db.close();
  }
}

async function saveMeta(key: string, value: string): Promise<void> {
  if (!supported()) return;
  const db = await openDb();
  try {
    const tx = db.transaction(META, "readwrite");
    tx.objectStore(META).put({ key, value } satisfies OfflineMeta);
    await transactionDone(tx, "Não foi possível atualizar os metadados de contingência.");
  } finally {
    db.close();
  }
}

async function deleteSnapshotKeys(keys: IDBValidKey[]): Promise<void> {
  if (!supported() || !keys.length) return;
  const db = await openDb();
  try {
    const tx = db.transaction(SNAPSHOTS, "readwrite");
    const store = tx.objectStore(SNAPSHOTS);
    keys.forEach((key) => store.delete(key));
    await transactionDone(tx, "Não foi possível expirar o cache de contingência.");
  } finally {
    db.close();
  }
}

function fresh(snapshot: OfflineWorkspaceSnapshot): boolean {
  const saved = new Date(snapshot.savedAt).getTime();
  return Number.isFinite(saved) && Date.now() - saved <= RETENTION_MS;
}

function offlineSafeRecords(records: ProcessMovement[]): ProcessMovement[] {
  return records.map((record) => ({
    ...record,
    notes: "",
    documentPath: "",
    socialTheme: "",
    relevanceReason: "",
    fundamentalRight: "",
    affectedGroup: "",
    reach: "",
    territorialScope: "",
    impactType: "",
    socialResult: "",
    sdgs: [],
    complexityReason: "",
    detailsLoaded: record.movementId < 0,
  }));
}

export async function saveOfflineSnapshot(input: Omit<OfflineWorkspaceSnapshot, "key" | "savedAt">): Promise<OfflineWorkspaceSnapshot> {
  const snapshot: OfflineWorkspaceSnapshot = {
    ...input,
    records: offlineSafeRecords(input.records),
    key: snapshotKey(input.userId, input.workspaceId),
    savedAt: new Date().toISOString(),
  };
  if (!supported()) return snapshot;
  const db = await openDb();
  try {
    const tx = db.transaction(SNAPSHOTS, "readwrite");
    tx.objectStore(SNAPSHOTS).put(snapshot);
    await transactionDone(tx, "Não foi possível salvar a contingência local.");
  } finally {
    db.close();
  }
  await saveMeta(currentKey(input.userId), input.workspaceId);
  return snapshot;
}

export async function loadOfflineSnapshot(userId: string, workspaceId?: string): Promise<OfflineWorkspaceSnapshot | null> {
  if (!supported()) return null;
  const targetWorkspace = workspaceId ?? await metaValue(currentKey(userId));
  const db = await openDb();
  try {
    const tx = db.transaction(SNAPSHOTS, "readonly");
    const store = tx.objectStore(SNAPSHOTS);
    if (targetWorkspace) {
      const snapshot = await requestResult(store.get(snapshotKey(userId, targetWorkspace)) as IDBRequest<OfflineWorkspaceSnapshot | undefined>);
      if (snapshot && fresh(snapshot)) return snapshot;
      if (snapshot) void deleteSnapshotKeys([snapshot.key]);
      if (workspaceId) return null;
    }
    const snapshots = await requestResult(store.index("userId").getAll(userId) as IDBRequest<OfflineWorkspaceSnapshot[]>);
    const valid = snapshots.filter(fresh).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
    const fallback = valid[0] ?? null;
    if (fallback) void saveMeta(currentKey(userId), fallback.workspaceId);
    return fallback;
  } finally {
    db.close();
  }
}

export async function listOfflineWorkspaces(userId: string): Promise<AvailableWorkspace[]> {
  if (!supported()) return [];
  const current = await metaValue(currentKey(userId));
  const db = await openDb();
  try {
    const tx = db.transaction(SNAPSHOTS, "readonly");
    const index = tx.objectStore(SNAPSHOTS).index("userId");
    const snapshots = await requestResult(index.getAll(userId) as IDBRequest<OfflineWorkspaceSnapshot[]>);
    const expired = snapshots.filter((snapshot) => !fresh(snapshot)).map((snapshot) => snapshot.key);
    if (expired.length) void deleteSnapshotKeys(expired);
    return snapshots
      .filter(fresh)
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
      .map((snapshot) => ({
        workspaceId: snapshot.workspaceId,
        name: snapshot.workspaceName,
        role: snapshot.workspaceRole,
        current: snapshot.workspaceId === current,
      }));
  } finally {
    db.close();
  }
}

export async function markOfflineWorkspaceCurrent(userId: string, workspaceId: string): Promise<void> {
  await saveMeta(currentKey(userId), workspaceId);
}

export async function enqueueOfflineOperation(input: OfflineOperationInput): Promise<OfflineOperation> {
  const operation: OfflineOperation = {
    ...input,
    id: operationId(),
    createdAt: new Date().toISOString(),
    attempts: 0,
    lastError: "",
  };
  if (!supported()) throw new Error("IndexedDB indisponível: não é seguro registrar alterações em contingência.");
  const db = await openDb();
  try {
    const tx = db.transaction(SYNC_QUEUE, "readwrite");
    tx.objectStore(SYNC_QUEUE).put(operation);
    await transactionDone(tx, "Não foi possível registrar a alteração na fila local.");
  } finally {
    db.close();
  }
  return operation;
}

export async function enqueueOfflineOperations(inputs: OfflineOperationInput[]): Promise<OfflineOperation[]> {
  if (!inputs.length) return [];
  if (!supported()) throw new Error("IndexedDB indisponível: não é seguro registrar alterações em contingência.");
  const baseTime = Date.now();
  const operations = inputs.map((input, index) => ({
    ...input, id: operationId(), createdAt: new Date(baseTime + index).toISOString(), attempts: 0, lastError: "",
  } satisfies OfflineOperation));
  const db = await openDb();
  try {
    const tx = db.transaction(SYNC_QUEUE, "readwrite");
    const store = tx.objectStore(SYNC_QUEUE);
    operations.forEach((operation) => store.put(operation));
    await transactionDone(tx, "Não foi possível registrar as alterações na fila local.");
  } finally {
    db.close();
  }
  return operations;
}

export async function listOfflineOperations(userId: string, workspaceId?: string): Promise<OfflineOperation[]> {
  if (!supported()) return [];
  const db = await openDb();
  try {
    const tx = db.transaction(SYNC_QUEUE, "readonly");
    const all = await requestResult(tx.objectStore(SYNC_QUEUE).index("userId").getAll(userId) as IDBRequest<OfflineOperation[]>);
    return all
      .filter((operation) => !workspaceId || operation.workspaceId === workspaceId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  } finally {
    db.close();
  }
}

export async function markOfflineOperationError(id: string, message: string): Promise<void> {
  if (!supported()) return;
  const db = await openDb();
  try {
    const tx = db.transaction(SYNC_QUEUE, "readwrite");
    const store = tx.objectStore(SYNC_QUEUE);
    const operation = await requestResult(store.get(id) as IDBRequest<OfflineOperation | undefined>);
    if (operation) store.put({ ...operation, attempts: operation.attempts + 1, lastError: message });
    await transactionDone(tx, "Não foi possível atualizar a fila de sincronização.");
  } finally {
    db.close();
  }
}

export async function removeOfflineOperation(id: string): Promise<void> {
  if (!supported()) return;
  const db = await openDb();
  try {
    const tx = db.transaction(SYNC_QUEUE, "readwrite");
    tx.objectStore(SYNC_QUEUE).delete(id);
    await transactionDone(tx, "Não foi possível remover a operação sincronizada.");
  } finally {
    db.close();
  }
}

export async function remapOfflineMovementId(userId: string, workspaceId: string, temporaryId: number, serverId: number): Promise<void> {
  if (!supported()) return;
  const operations = await listOfflineOperations(userId, workspaceId);
  const affected = operations.filter((operation) => operation.movementId === temporaryId);
  if (!affected.length) return;
  const db = await openDb();
  try {
    const tx = db.transaction(SYNC_QUEUE, "readwrite");
    const store = tx.objectStore(SYNC_QUEUE);
    affected.forEach((operation) => store.put({ ...operation, movementId: serverId }));
    await transactionDone(tx, "Não foi possível vincular o registro local ao registro sincronizado.");
  } finally {
    db.close();
  }
}

export async function discardOfflineOperationTree(userId: string, operationIdValue: string): Promise<void> {
  const operations = await listOfflineOperations(userId);
  const target = operations.find((operation) => operation.id === operationIdValue);
  if (!target || !supported()) return;
  const ids = new Set([target.id]);
  if (target.payload.kind === "create" && target.tempMovementId != null) {
    operations.filter((operation) => operation.workspaceId === target.workspaceId && operation.movementId === target.tempMovementId).forEach((operation) => ids.add(operation.id));
  }
  const db = await openDb();
  try {
    const tx = db.transaction(SYNC_QUEUE, "readwrite");
    const store = tx.objectStore(SYNC_QUEUE);
    ids.forEach((id) => store.delete(id));
    await transactionDone(tx, "Não foi possível descartar a alteração local.");
  } finally {
    db.close();
  }
}

export async function clearOfflineUserData(userId: string): Promise<void> {
  if (!supported()) return;
  const db = await openDb();
  try {
    const snapshotKeys = await requestResult(db.transaction(SNAPSHOTS, "readonly").objectStore(SNAPSHOTS).index("userId").getAllKeys(userId));
    const queueKeys = await requestResult(db.transaction(SYNC_QUEUE, "readonly").objectStore(SYNC_QUEUE).index("userId").getAllKeys(userId));
    const writeTx = db.transaction([SNAPSHOTS, META, SYNC_QUEUE], "readwrite");
    const snapshots = writeTx.objectStore(SNAPSHOTS);
    snapshotKeys.forEach((key) => snapshots.delete(key));
    const queue = writeTx.objectStore(SYNC_QUEUE);
    queueKeys.forEach((key) => queue.delete(key));
    writeTx.objectStore(META).delete(currentKey(userId));
    await transactionDone(writeTx, "A limpeza dos dados locais foi interrompida.");
  } finally {
    db.close();
  }
}

export function offlineRetentionHours(): number {
  return RETENTION_MS / (60 * 60 * 1000);
}
