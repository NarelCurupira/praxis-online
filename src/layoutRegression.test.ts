import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("./v0107.css", import.meta.url), "utf8");
const baseCss = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("./components/Sidebar.tsx", import.meta.url), "utf8");
const about = readFileSync(new URL("./components/AboutPage.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const processModal = readFileSync(new URL("./components/ProcessModal.tsx", import.meta.url), "utf8");
const editModal = readFileSync(new URL("./components/EditProcessModal.tsx", import.meta.url), "utf8");
const processTable = readFileSync(new URL("./components/ProcessTable.tsx", import.meta.url), "utf8");
const mobileInteractions = readFileSync(new URL("./mobileInteractions.ts", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("./components/Dashboard.tsx", import.meta.url), "utf8");
const fastApi = readFileSync(new URL("./fastApi.ts", import.meta.url), "utf8");
const governanceApi = readFileSync(new URL("./governanceApi.ts", import.meta.url), "utf8");

test("menu móvel permanece oculto no desktop e reaparece no breakpoint móvel", () => {
  assert.match(css, /\.topbar \.mobile-menu\s*\{\s*display:\s*none !important;/);
  assert.match(css, /@media \(max-width:\s*760px\)[\s\S]*?\.topbar \.mobile-menu\s*\{\s*display:\s*inline-grid !important;/);
});

test("menu recolhido possui símbolos separados para os temas claro e escuro", () => {
  assert.match(sidebar, /brand-symbol-light/);
  assert.match(sidebar, /brand-symbol-dark/);
  assert.match(sidebar, /symbol-light\.webp/);
  assert.match(sidebar, /symbol-dark\.webp/);
});

test("botão de copiar compacto não herda a altura mínima global", () => {
  assert.match(css, /button:not\(\.copy-number-button\)/);
  assert.match(css, /button\.copy-number-button[\s\S]*?min-height:\s*30px !important;/);
  assert.match(css, /\.number-copy-line \.copy-number-button[\s\S]*?min-height:\s*26px !important;/);
});

test("cartões especiais e campos administrativos usam os tokens do tema", () => {
  assert.match(css, /\.classification-switch,[\s\S]*?\.locked-fields > div[\s\S]*?background:\s*var\(--surface-subtle\) !important;/);
  assert.match(css, /\.governance-section \.settings-grid[\s\S]*?border:\s*1px solid var\(--border\) !important;/);
});

test("seletores de formulários e tabelas possuem alturas coerentes", () => {
  assert.match(css, /\.process-form-grid select,[\s\S]*?height:\s*44px;/);
  assert.match(css, /\.table-toolbar-v091 select,[\s\S]*?height:\s*40px;/);
  assert.match(css, /\.process-data-table \.table-inline-select,[\s\S]*?height:\s*36px;/);
});

test("aba Sobre exibe somente as três versões mais recentes e centraliza os títulos", () => {
  assert.match(about, /VERSIONS\.slice\(0,\s*3\)\.map/);
  assert.match(css, /\.version-history summary\s*\{[\s\S]*?text-align:\s*center;/);
  assert.match(css, /\.version-history summary > span\s*\{[\s\S]*?text-align:\s*center;/);
});

test("menu móvel respeita a área segura superior do iPhone", () => {
  assert.match(css, /@media \(max-width:\s*900px\) and \(display-mode:\s*standalone\)[\s\S]*?padding-top:\s*calc\(var\(--praxis-safe-top\) \+ 18px\) !important;/);
});

test("pull-to-refresh só é montado após o limiar ou durante a atualização", () => {
  assert.match(app, /pullDistance >= 72 \|\| mobileNavigation\.refreshing/);
  assert.doesNotMatch(app, /Puxe para atualizar/);
  assert.match(app, /Solte para atualizar/);
  assert.match(app, /Atualizando…/);
});

test("cadastro usa colagem e edição continua usando cópia", () => {
  assert.match(processModal, /PasteButton/);
  assert.match(processModal, /Colar número MP/);
  assert.match(processModal, /Colar número judicial/);
  assert.doesNotMatch(processModal, /CopyButton/);
});

test("Minha fila reserva largura legível para classe e assunto", () => {
  assert.match(css, /\.queue-data-table\s*\{[\s\S]*?min-width:\s*1080px;/);
  assert.match(css, /\.queue-data-table \.col-subject\s*\{[\s\S]*?width:\s*260px;/);
});

test("status enviado usa o azul-marinho da identidade na aba Processos", () => {
  assert.match(css, /\.processes-table-panel \.status-enviado\s*\{[\s\S]*?background:\s*var\(--praxis-navy\) !important;/);
});

test("prazo inferior a cinco dias recebe destaque próprio", () => {
  assert.match(processTable, /remaining < 5 && record\.workflowStatus !== "Enviado" \? "deadline-urgent"/);
  assert.match(css, /\.deadline-urgent\s*\{[\s\S]*?color:\s*#B44747 !important;/);
});

test("filtros da aba Processos seguem Ano, Responsável, Status e Destacados", () => {
  const filterStart = processTable.indexOf('className="table-toolbar-row table-filter-row"');
  const filterEnd = processTable.indexOf('className="table-toolbar-row table-sort-row"');
  const filters = processTable.slice(filterStart, filterEnd);
  assert.ok(filters.indexOf("<span>Ano</span>") < filters.indexOf("<span>Responsável</span>"));
  assert.ok(filters.indexOf("<span>Responsável</span>") < filters.indexOf("<span>Status</span>"));
  assert.ok(filters.indexOf("<span>Status</span>") < filters.indexOf("<span>Destacados</span>"));
});

test("swipe para a esquerda fecha o menu móvel", () => {
  assert.match(mobileInteractions, /touch\.current\.sidebar && deltaX <= -72/);
  assert.match(mobileInteractions, /callbacks\.current\.onCloseSidebar\(\)/);
  assert.match(app, /onCloseSidebar:\s*\(\) => setSidebarOpen\(false\)/);
});

test("alteração da entrada direciona à justificativa sem desabilitar silenciosamente o salvamento", () => {
  assert.match(editModal, /reasonRef\.current\?\.focus\(\)/);
  assert.match(editModal, /Preencha a justificativa para salvar a alteração da entrada/);
  assert.match(editModal, /disabled=\{saving\}/);
  assert.doesNotMatch(editModal, /disabled=\{saving \|\| \(receivedChanged/);
});

test("comparativo anual responde à largura do painel sem sobreposição", () => {
  assert.match(dashboard, /annual-comparison-panel/);
  assert.match(baseCss, /\.annual-comparison-panel\s*\{[^}]*container-type:\s*inline-size;/);
  assert.match(baseCss, /@container \(max-width:\s*860px\)[\s\S]*?\.annual-layout\s*\{\s*grid-template-columns:\s*1fr;/);
  assert.match(baseCss, /\.annual-table-wrap\s*\{[^}]*max-width:\s*100%;[^}]*overflow-x:\s*auto;/);
});

test("cadastro e edição separam urgência da prioridade processual", () => {
  for (const source of [processModal, editModal]) {
    assert.match(source, /Urgência da fila/);
    assert.match(source, /Prioridade processual/);
    assert.match(source, /PROCEDURAL_PRIORITY_OPTIONS/);
  }
});


test("pull-to-refresh atualiza somente as movimentações", () => {
  assert.match(app, /onRefresh:\s*\(\) => reload\("pull"\)/);
  assert.doesNotMatch(app, /onRefresh:\s*reloadAll/);
});

test("carga forçada preserva a chamada ativa de movimentações em andamento", () => {
  const listStart = fastApi.indexOf("export async function listMovementsFast");
  const inFlightGuard = fastApi.indexOf("if (activeInFlight)", listStart);
  const forceInvalidation = fastApi.indexOf("if (options.force)", listStart);
  assert.ok(listStart >= 0 && inFlightGuard >= 0 && forceInvalidation >= 0 && inFlightGuard < forceInvalidation);
  const forceBlock = fastApi.slice(forceInvalidation, fastApi.indexOf("const now", forceInvalidation));
  assert.doesNotMatch(forceBlock, /activeInFlight\s*=\s*null/);
  assert.doesNotMatch(forceBlock, /exclusionsPromise\s*=\s*null/);
});

test("telemetria de movimentações identifica motivo, conjunto, formato, páginas e linhas", () => {
  assert.match(fastApi, /movements\.page\.\$\{reason\}\.\$\{dataset\}\.\$\{shape\}\.\$\{pageNumber\}\.rows/);
  assert.match(fastApi, /movements\.fetch\.\$\{reason\}\.\$\{dataset\}\.\$\{shape\}\.pages/);
  assert.match(fastApi, /movements\.transform\.\$\{reason\}\.\$\{dataset\}\.\$\{shape\}\.pages/);
  assert.match(fastApi, /movements\.inFlightReuse/);
});

test("carga inicial usa núcleo ativo e reserva detalhes e arquivados para demanda", () => {
  const coreStart = fastApi.indexOf("const SELECT_MOVEMENT_CORE");
  const detailStart = fastApi.indexOf("const SELECT_MOVEMENT_DETAIL");
  const core = fastApi.slice(coreStart, detailStart);
  assert.doesNotMatch(core, /notes|document_path|relevance_reason|complexity_reason|sdgs/);
  assert.match(fastApi, /dataset === "active"\) query = query\.is\("archived_at", null\)/);
  assert.match(app, /listArchivedMovementsFast/);
  assert.match(app, /listDetailedMovementsFast/);
});

test("cache rápido é isolado pelo par usuário e workspace", () => {
  assert.match(fastApi, /const nextKey = `\$\{context\.user\.id\}:\$\{context\.workspaceId\}`/);
  assert.match(fastApi, /if \(cacheContextKey !== nextKey\)/);
});

test("equipe é filtrada explicitamente pelo workspace ativo", () => {
  assert.match(governanceApi, /from\("workspace_members"\)/);
  assert.match(governanceApi, /eq\("workspace_id", workspaceId\)/);
  assert.match(governanceApi, /filter\(\(member\) => memberships\.has\(member\.userId\)\)/);
});
