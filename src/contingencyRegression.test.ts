import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const offlineStore = readFileSync(new URL("./offlineStore.ts", import.meta.url), "utf8");
const sw = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");

 test("contingência usa IndexedDB isolado por usuário e Procuradoria", () => {
  assert.match(offlineStore, /indexedDB\.open/);
  assert.match(offlineStore, /`\$\{userId\}:\$\{workspaceId\}`/);
  assert.match(offlineStore, /3 \* 24 \* 60 \* 60 \* 1000/);
});

test("snapshot local remove campos detalhados e documentos", () => {
  assert.match(offlineStore, /notes: ""/);
  assert.match(offlineStore, /documentPath: ""/);
  assert.match(offlineStore, /detailsLoaded: false/);
});

test("queda de rede ativa somente leitura e reconexão tenta restaurar servidor", () => {
  assert.match(app, /setContingencyMode\(true\)/);
  assert.match(app, /Modo contingência · somente leitura/);
  assert.match(app, /if \(!online \|\| !contingencyMode/);
  assert.match(app, /await switchWorkspace\(selected\.workspaceId\)/);
});

test("contingência restringe páginas e capacidades de escrita", () => {
  assert.match(app, /new Set<Page>\(\["dashboard", "queue", "processes"\]\)/);
  assert.match(app, /canCreateProcess: false/);
  assert.match(app, /canEditWorkflow: false/);
  assert.match(app, /canDelete: false/);
  assert.match(app, /canExport: false/);
});

test("logout apaga dados locais do usuário", () => {
  assert.match(app, /clearOfflineUserData\(session\.user\.id\)/);
});

test("service worker devolve o shell da aplicação em navegação offline", () => {
  assert.match(sw, /cache\.match\("\/"\)/);
  assert.match(sw, /cache\.match\("\/index\.html"\)/);
});
