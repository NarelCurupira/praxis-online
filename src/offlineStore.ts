import type { CalendarExclusion, ClassSetting, ClosedPeriod, ProcessMovement, TeamMember, WorkspaceSettings } from "./types";
import type { AvailableWorkspace } from "./workspaceApi";

const DB_NAME = "praxis-offline-v1";
const DB_VERSION = 1;
const SNAPSHOTS = "snapshots";
const META = "meta";
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
    await requestResult(tx.objectStore(META).put({ key, value } satisfies OfflineMeta));
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
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Não foi possível expirar o cache de contingência."));
      tx.onabort = () => reject(tx.error ?? new Error("A expiração do cache foi interrompida."));
    });
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
    detailsLoaded: false,
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
    await requestResult(tx.objectStore(SNAPSHOTS).put(snapshot));
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

    // Se a unidade que era a atual expirou, usa a cópia válida mais recente do usuário.
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

export async function clearOfflineUserData(userId: string): Promise<void> {
  if (!supported()) return;
  const db = await openDb();
  try {
    const readTx = db.transaction(SNAPSHOTS, "readonly");
    const keys = await requestResult(readTx.objectStore(SNAPSHOTS).index("userId").getAllKeys(userId));
    const writeTx = db.transaction([SNAPSHOTS, META], "readwrite");
    const snapshots = writeTx.objectStore(SNAPSHOTS);
    keys.forEach((key) => snapshots.delete(key));
    writeTx.objectStore(META).delete(currentKey(userId));
    await new Promise<void>((resolve, reject) => {
      writeTx.oncomplete = () => resolve();
      writeTx.onerror = () => reject(writeTx.error ?? new Error("Não foi possível limpar os dados locais."));
      writeTx.onabort = () => reject(writeTx.error ?? new Error("A limpeza dos dados locais foi interrompida."));
    });
  } finally {
    db.close();
  }
}

export function offlineRetentionHours(): number {
  return RETENTION_MS / (60 * 60 * 1000);
}
