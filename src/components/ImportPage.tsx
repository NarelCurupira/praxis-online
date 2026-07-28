import { useEffect, useMemo, useState } from "react";
import { Archive, CheckCircle2, ChevronDown, Download, FileSpreadsheet, History, RotateCcw, ShieldCheck, Trash2, Upload, X } from "lucide-react";
import * as XLSX from "xlsx";
import { addBusinessDays, addDays, excelDateTime, localDatePart } from "../date";
import { actionLabel } from "../labels";
import {
  buildImportPreview,
  DEFAULT_IMPORT_RULES,
  executeIntelligentImport,
  listImportBatches,
  revertImportBatch,
  type ImportBatchEntry,
  type ImportPreview,
  type IntelligentImportRules,
} from "../intelligentImportApi";
import type { CalendarExclusion, ClassSetting, ImportRecord, ImportResult, Priority, ProcessMovement, WorkflowStatus } from "../types";
import { StrongAuthDialog } from "./StrongAuthDialog";

interface Props {
  isAdmin: boolean;
  onImport: (records: ImportRecord[], onProgress?: (message: string) => void) => Promise<ImportResult>;
  onBackup: () => Promise<string>;
  onChanged: () => Promise<void>;
  records: ProcessMovement[];
  onExport: (bytes: number[]) => Promise<string>;
  onClear: () => Promise<string>;
  onRestoreBackup: (file: File) => Promise<string>;
  classes: ClassSetting[];
  exclusions: CalendarExclusion[];
}

function normalizeStatus(value: unknown): WorkflowStatus {
  const text = String(value ?? "").toLowerCase();
  if (text.includes("enviado")) return "Enviado";
  if (text.includes("minut")) return "Minutado";
  if (text.includes("sobrest")) return "Sobrestado";
  if (text.includes("análise") || text.includes("analise")) return "Em análise";
  return "Recebido";
}

function boundedRows(sheet: XLSX.WorkSheet): unknown[][] {
  let maxRow = 0; let maxColumn = 0;
  for (const address of Object.keys(sheet).filter((key) => !key.startsWith("!"))) {
    const cell = XLSX.utils.decode_cell(address); maxRow = Math.max(maxRow, cell.r); maxColumn = Math.max(maxColumn, cell.c);
  }
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null, range: { s: { r: 0, c: 0 }, e: { r: maxRow, c: maxColumn } } });
}

function specialDefaults() {
  return { sociallyRelevant: false, extremelyComplex: false, socialTheme: "", relevanceReason: "", fundamentalRight: "", affectedGroup: "", reach: "", territorialScope: "", impactType: "", socialResult: "", sdgs: [], complexityReason: "" };
}

function inferAction(value: string): string {
  const text = value.toLowerCase();
  if (/\bctrz|contrarraz/.test(text)) return "CTRZ";
  if (/\bdi\b|desnecessária intervenção|desnecessaria intervencao/.test(text)) return "DI";
  if (text.includes("dilig")) return "Diligência";
  if (text.includes("preven")) return "Prevenção";
  if (text.includes("suspei")) return "Suspeição";
  if (text.includes("ciên") || text.includes("cien")) return "Ciência";
  if (text.includes("sobrest")) return "Sobrestamento";
  if (text.includes("ratific")) return "Ratifico";
  if (text.includes("recurso")) return "Recurso";
  return "";
}

function normalizeHeader(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[º°]/g, "o").replace(/\s+/g, " ");
}
function headerIndex(headers: string[], ...names: string[]): number { return headers.findIndex((header) => names.includes(header)); }
function monthlyHeaderIndex(rows: unknown[][]): number {
  return rows.slice(0, 10).findIndex((row) => { const headers = row.map(normalizeHeader); return headers.includes("entrada") && headers.includes("prazo") && headers.includes("no mp") && headers.includes("no judiciario") && headers.includes("observacao da fila"); });
}
function isSajRows(rows: unknown[][]): boolean { return rows.some((row) => { const headers = row.map(normalizeHeader); return headers.includes("entrada") && headers.includes("no mp") && headers.includes("no judiciario") && headers.includes("assunto principal"); }); }
function isMonthlyRows(rows: unknown[][]): boolean { return monthlyHeaderIndex(rows) >= 0; }
function classDays(className: string, classes: ClassSetting[]): number { return classes.find((item) => item.name.trim().toLowerCase() === className.trim().toLowerCase())?.businessDays ?? 30; }
function dateTimeColumns(headers: string[], base: "entrada" | "envio") { return { date: headerIndex(headers, base, `data de ${base}`, `data ${base}`), time: headerIndex(headers, `hora de ${base}`, `hora ${base}`, `horario de ${base}`, `horario ${base}`) }; }

async function parseWorkbook(file: File, classes: ClassSetting[], exclusions: CalendarExclusion[]): Promise<{ records: ImportRecord[]; ignored: number; template: string }> {
  const workbook = XLSX.read(await file.arrayBuffer(), { cellDates: false });
  const records: ImportRecord[] = []; let ignored = 0;
  const sheets = workbook.SheetNames.map((name) => ({ name, rows: boundedRows(workbook.Sheets[name]) }));
  const excludedDates = exclusions.map((item) => item.date);

  if (sheets.some((sheet) => isSajRows(sheet.rows))) {
    for (const sheet of sheets) {
      if (!isSajRows(sheet.rows)) continue;
      const headerRow = sheet.rows.findIndex((row) => row.map(normalizeHeader).includes("no judiciario"));
      const headers = headerRow >= 0 ? sheet.rows[headerRow].map(normalizeHeader) : [];
      const entryDateColumn = headerIndex(headers, "entrada", "data de entrada", "data entrada");
      const entryTimeColumn = headerIndex(headers, "hora de entrada", "hora entrada", "horario de entrada", "horario entrada");
      const mpColumn = headerIndex(headers, "no mp");
      const judicialColumn = headerIndex(headers, "no judiciario");
      const principalColumn = headerIndex(headers, "assunto principal");
      const observationColumn = headerIndex(headers, "observacao da fila");
      let currentClass = "Não identificada";
      for (const row of sheet.rows.slice(Math.max(0, headerRow + 1))) {
        const first = String(row[0] ?? "").trim();
        if (first.toLowerCase().startsWith("classe tj")) { currentClass = first.split(":").slice(1).join(":").replace(/\s+\(\d+\)\s*$/, "").trim() || currentClass; continue; }
        const received = excelDateTime(row[entryDateColumn >= 0 ? entryDateColumn : 7], entryTimeColumn >= 0 ? row[entryTimeColumn] : undefined);
        const mpNumber = String(row[mpColumn >= 0 ? mpColumn : 8] ?? "").trim();
        const judicialNumber = String(row[judicialColumn >= 0 ? judicialColumn : 9] ?? "").trim();
        const principalSubject = String(row[principalColumn >= 0 ? principalColumn : 10] ?? "").trim();
        const queueObservation = String(row[observationColumn >= 0 ? observationColumn : 11] ?? "").trim();
        const hasContent = row.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== "");
        if (!hasContent || (!mpNumber && !judicialNumber && !received.value)) continue;
        if (!mpNumber || !judicialNumber || !received.value) { ignored += 1; continue; }
        records.push({ mpNumber, judicialNumber, className: currentClass, subject: queueObservation || principalSubject || "Importado do fluxo de trabalho do SAJ", receivedAt: received.value, receivedTimePrecise: received.precise, deadlineAt: addBusinessDays(received.value, classDays(currentClass, classes), excludedDates).slice(0, 10), draftStatus: "Pendente", workflowStatus: "Recebido", sentAt: null, sentTimePrecise: false, actionType: inferAction(queueObservation), notes: "", priority: "Normal", documentPath: "", ...specialDefaults() });
      }
    }
    return { records, ignored, template: "SAJ — Fluxo de Trabalho" };
  }

  const monthlySheets = sheets.filter((sheet) => /^\d{4}-(0[1-9]|1[0-2])$/.test(sheet.name.trim()) || /^(0[1-9]|1[0-2])\.\d{4}$/.test(sheet.name.trim()) || isMonthlyRows(sheet.rows));
  for (const { rows } of monthlySheets) {
    const headerRow = monthlyHeaderIndex(rows); if (headerRow < 0) continue;
    const headers = rows[headerRow].map(normalizeHeader);
    const entry = dateTimeColumns(headers, "entrada"); const sent = dateTimeColumns(headers, "envio");
    const deadlineColumn = headerIndex(headers, "prazo"); const mpColumn = headerIndex(headers, "no mp"); const judicialColumn = headerIndex(headers, "no judiciario");
    const subjectColumn = headerIndex(headers, "observacao da fila"); const draftColumn = headerIndex(headers, "minuta?"); const statusColumn = headerIndex(headers, "status");
    const actionColumn = headerIndex(headers, "obs", "providencia"); const priorityColumn = headerIndex(headers, "prioridade?", "prioridade");
    let currentClass = "Não identificada";
    for (const row of rows.slice(headerRow + 1)) {
      const first = String(row[0] ?? "").trim();
      if (first.toLowerCase().startsWith("classe tj")) { currentClass = first.split(":").slice(1).join(":").trim() || currentClass; continue; }
      const judicialNumber = String(row[judicialColumn] ?? "").trim(); const mpNumber = String(row[mpColumn] ?? "").trim(); const receivedValue = row[entry.date];
      if (first && !/^\d+$/.test(first) && !judicialNumber && !mpNumber && !receivedValue) { currentClass = first; continue; }
      if (!row.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== "")) continue;
      if (!judicialNumber && !mpNumber && !receivedValue) continue;
      if (!judicialNumber || !mpNumber || !receivedValue) { ignored += 1; continue; }
      const received = excelDateTime(receivedValue, entry.time >= 0 ? row[entry.time] : undefined); if (!received.value) { ignored += 1; continue; }
      const sentValue = sent.date >= 0 ? excelDateTime(row[sent.date], sent.time >= 0 ? row[sent.time] : undefined) : { value: "", precise: false };
      const workflowStatus = statusColumn >= 0 ? normalizeStatus(row[statusColumn]) : "Recebido";
      const subject = String(row[subjectColumn] ?? "").trim(); const providedAction = actionColumn >= 0 ? String(row[actionColumn] ?? "").trim() : "";
      const priorityText = priorityColumn >= 0 ? normalizeHeader(row[priorityColumn]) : ""; const priority: Priority = /^(s|sim|x|1|true)$/.test(priorityText) || priorityText.includes("urgent") ? "Urgente" : "Normal";
      records.push({ mpNumber, judicialNumber, className: currentClass, subject, receivedAt: received.value, receivedTimePrecise: received.precise, deadlineAt: deadlineColumn >= 0 ? localDatePart(excelDateTime(row[deadlineColumn]).value) || addDays(received.value, 40).slice(0, 10) : addDays(received.value, 40).slice(0, 10), draftStatus: draftColumn >= 0 ? String(row[draftColumn] ?? "Pendente").trim() : workflowStatus === "Enviado" ? "Minutado" : "Pendente", workflowStatus, sentAt: sentValue.value || null, sentTimePrecise: sentValue.precise, actionType: providedAction || inferAction(subject) || "Manifestação", notes: "", priority, documentPath: "", ...specialDefaults() });
    }
  }
  return { records, ignored, template: records.length ? "Planilha mensal do Práxis" : "Modelo não reconhecido" };
}

function fmt(value: string): string { try { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); } catch { return value; } }
function resultNumber(value: unknown): number { return Number(value ?? 0); }

export function ImportPage({ isAdmin, onBackup, onChanged, records: currentRecords, onExport, onClear, onRestoreBackup, classes, exclusions }: Props) {
  const [fileName, setFileName] = useState(""); const [records, setRecords] = useState<ImportRecord[]>([]); const [ignored, setIgnored] = useState(0);
  const [template, setTemplate] = useState(""); const [preview, setPreview] = useState<ImportPreview | null>(null); const [rules, setRules] = useState<IntelligentImportRules>(() => { try { return { ...DEFAULT_IMPORT_RULES, ...JSON.parse(localStorage.getItem("praxis-import-rules") ?? "{}") }; } catch { return DEFAULT_IMPORT_RULES; } });
  const [result, setResult] = useState<(ImportResult & { batchCode?: string }) | null>(null); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false); const [importError, setImportError] = useState(""); const [importProgress, setImportProgress] = useState("");
  const [showClear, setShowClear] = useState(false); const [clearText, setClearText] = useState(""); const [showRestore, setShowRestore] = useState(false); const [restoreFile, setRestoreFile] = useState<File | null>(null); const [restoreText, setRestoreText] = useState("");
  const [sensitiveConfirmation, setSensitiveConfirmation] = useState<"clear" | "restore" | null>(null);
  const [batches, setBatches] = useState<ImportBatchEntry[]>([]); const [revertingId, setRevertingId] = useState<number | null>(null); const [showAllPreview, setShowAllPreview] = useState(false);

  useEffect(() => { if (isAdmin) listImportBatches().then(setBatches).catch(() => setBatches([])); }, [isAdmin]);
  useEffect(() => { if (records.length) setPreview(buildImportPreview(records, currentRecords, rules)); try { localStorage.setItem("praxis-import-rules", JSON.stringify(rules)); } catch { /* preferência não persistente */ } }, [currentRecords, records, rules]);

  async function chooseFile(file?: File) {
    if (!file) return; setBusy(true); setResult(null); setMessage(""); setImportError(""); setImportProgress(""); setRecords([]); setPreview(null);
    try { const parsed = await parseWorkbook(file, classes, exclusions); setFileName(file.name); setRecords(parsed.records); setIgnored(parsed.ignored); setTemplate(parsed.template); if (!parsed.records.length) setImportError("O arquivo não corresponde ao modelo mensal do Práxis nem ao relatório Fluxo de Trabalho do SAJ, ou não contém registros válidos."); }
    catch (error) { setImportError(`Não foi possível ler a planilha: ${String(error)}`); }
    finally { setBusy(false); }
  }

  async function confirmImport() {
    if (!preview?.accepted) return; setBusy(true); setImportError(""); setImportProgress("Preparando lote de importação...");
    try {
      const imported = await executeIntelligentImport(fileName, template, preview, rules, setImportProgress); imported.ignoredRows += ignored;
      setResult(imported); setRecords([]); setPreview(null); await onChanged(); setBatches(await listImportBatches());
    } catch (error) { setImportError(`A planilha foi analisada, mas não foi possível concluir o lote: ${String(error)}`); }
    finally { setBusy(false); setImportProgress(""); }
  }

  async function revert(batch: ImportBatchEntry) {
    if (!confirm(`Desfazer o lote ${batch.batchCode}? Registros alterados manualmente depois da importação serão preservados e enviados para revisão.`)) return;
    setRevertingId(batch.id); setMessage("");
    try { const reverted = await revertImportBatch(batch.id); setMessage(`Lote desfeito: ${reverted.restoredMovements} movimentações restauradas, ${reverted.deletedMovements} movimentações novas removidas e ${reverted.skipped} registro(s) preservado(s) por alteração posterior.`); await onChanged(); setBatches(await listImportBatches()); }
    catch (error) { setMessage(`Não foi possível desfazer o lote: ${String(error)}`); }
    finally { setRevertingId(null); }
  }

  async function backup() { setBusy(true); setMessage(await onBackup()); setBusy(false); }
  async function restore() { if (!restoreFile) return; setBusy(true); setMessage(""); try { const restored = await onRestoreBackup(restoreFile); await onChanged(); setMessage(restored); setShowRestore(false); setRestoreText(""); setRestoreFile(null); setSensitiveConfirmation(null); } catch (error) { setMessage(`Não foi possível restaurar: ${String(error)}`); setShowRestore(false); setSensitiveConfirmation(null); } finally { setBusy(false); } }
  async function exportExcel() { setBusy(true); const rows = currentRecords.map((record) => ({ "Nº MP": record.mpNumber, "Nº Judicial": record.judicialNumber, Classe: record.className, Assunto: record.subject, Entrada: record.receivedAt, "Horário de entrada confirmado": record.receivedTimePrecise ? "Sim" : "Não", Prazo: record.deadlineAt, Minuta: record.draftStatus, Status: record.workflowStatus, Envio: record.sentAt ?? "", "Horário de envio confirmado": record.sentTimePrecise ? "Sim" : "Não", Providência: actionLabel(record.actionType), Prioridade: record.priority, Observações: record.notes, Documento: record.documentPath })); const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "Processos"); const bytes = Array.from(new Uint8Array(XLSX.write(workbook, { bookType: "xlsx", type: "array" }))); setMessage(await onExport(bytes)); setBusy(false); }
  async function clearAll() { setBusy(true); try { const resultMessage = await onClear(); await onChanged(); setMessage(resultMessage); setShowClear(false); setClearText(""); setResult(null); setSensitiveConfirmation(null); } finally { setBusy(false); } }

  const visiblePreview = useMemo(() => preview?.items.slice(0, showAllPreview ? 500 : 30) ?? [], [preview, showAllPreview]);
  const blockedStrict = Boolean(preview && rules.validationMode === "strict" && (preview.invalid || preview.duplicates || preview.conflicts));

  return <div className="page-stack intelligent-import-page">
    <div className="page-heading"><div><p className="eyebrow">Importação Inteligente</p><h1>Importar e backup</h1><p>Analise previamente, importe por lote, preserve a origem dos dados e reverta com segurança.</p></div></div>
    <div className="two-column">
      <section className="panel action-panel"><div className="large-icon blue"><FileSpreadsheet size={28} /></div><h2>Selecionar planilha</h2><p>Compatível com a planilha mensal do Práxis e com o relatório “Fluxo de Trabalho” do SAJ.</p><label className="button primary file-button"><Upload size={18} />Selecionar arquivo<input type="file" accept=".xlsx,.xls" onClick={(event) => { event.currentTarget.value = ""; }} onChange={(event) => void chooseFile(event.currentTarget.files?.[0])} /></label>{busy && <p className="muted">{importProgress || "Processando..."}</p>}{importError && <div className="import-error">{importError}</div>}</section>
      <section className="panel action-panel"><div className="large-icon green"><Archive size={28} /></div><h2>Backup e exportação</h2><p>Baixe cópias independentes dos dados armazenados no Supabase.</p><div className="button-row">{isAdmin && <><button className="button secondary" onClick={backup} disabled={busy}><Archive size={18} />Criar backup JSON</button><label className="button secondary file-button"><RotateCcw size={18} />Restaurar backup<input type="file" accept=".json,application/json" onChange={(event) => { const file = event.currentTarget.files?.[0] ?? null; setRestoreFile(file); if (file) setShowRestore(true); }} /></label></>}<button className="button secondary" onClick={exportExcel} disabled={busy || !currentRecords.length}><Download size={18} />Exportar Excel completo</button></div>{message && <div className="info-box">{message}</div>}</section>
    </div>

    {preview && <><section className="panel import-rules-panel"><div className="panel-title"><div><h2>Regras desta importação</h2><p>As escolhas ficam salvas neste navegador para as próximas planilhas.</p></div><ShieldCheck size={21} /></div><div className="import-rules-grid"><label>Quando o registro já existir<select value={rules.existingPolicy} onChange={(event) => setRules((current) => ({ ...current, existingPolicy: event.target.value as IntelligentImportRules["existingPolicy"] }))}><option value="skip">Não alterar</option><option value="fill_missing">Preencher somente campos ausentes</option><option value="update_different">Atualizar campos diferentes</option></select></label><label>Duplicidades dentro da planilha<select value={rules.duplicatePolicy} onChange={(event) => setRules((current) => ({ ...current, duplicatePolicy: event.target.value as IntelligentImportRules["duplicatePolicy"] }))}><option value="block">Bloquear linhas repetidas</option><option value="first">Considerar somente a primeira</option></select></label><label>Conflito entre horários confirmados<select value={rules.timestampConflictPolicy} onChange={(event) => setRules((current) => ({ ...current, timestampConflictPolicy: event.target.value as IntelligentImportRules["timestampConflictPolicy"] }))}><option value="keep_existing">Preservar o cadastro atual</option><option value="use_imported">Usar o horário da planilha</option></select></label><label>Modo de validação<select value={rules.validationMode} onChange={(event) => setRules((current) => ({ ...current, validationMode: event.target.value as IntelligentImportRules["validationMode"] }))}><option value="tolerant">Tolerante — importar somente os válidos</option><option value="strict">Rigoroso — bloquear o lote se houver erro</option></select></label><label className="import-rule-check"><input type="checkbox" checked={rules.useCurrentUserWhenAssigneeMissing} onChange={(event) => setRules((current) => ({ ...current, useCurrentUserWhenAssigneeMissing: event.target.checked }))} />Usar o usuário atual quando não houver responsável</label><label className="import-rule-check"><input type="checkbox" checked={rules.estimateMissingSentAt} onChange={(event) => setRules((current) => ({ ...current, estimateMissingSentAt: event.target.checked }))} />Manter estimativa de envio quando a planilha não informar a data</label></div></section>

      <section className="panel import-analysis-panel"><div className="panel-title"><div><h2>Prévia da importação</h2><p><strong>{fileName}</strong> · modelo identificado: {template}</p></div><span className="import-ready-count">{preview.accepted} aptos</span></div><div className="import-summary-grid"><span><b>{preview.total}</b> analisados</span><span><b>{preview.newCases}</b> novos processos</span><span><b>{preview.newMovements}</b> novas movimentações</span><span><b>{preview.updates}</b> atualizações</span><span><b>{preview.unchanged}</b> sem alteração</span><span className={preview.conflicts ? "warning" : ""}><b>{preview.conflicts}</b> conflitos</span><span className={preview.invalid ? "danger" : ""}><b>{preview.invalid}</b> inválidos</span><span><b>{ignored}</b> linhas ignoradas na leitura</span></div><div className="import-preview-list">{visiblePreview.map((item) => <div className={`import-preview-row preview-${item.kind}`} key={item.key}><span className="preview-status">{item.label}</span><div><strong>{item.record.judicialNumber || "Sem número judicial"}</strong><small>{item.record.mpNumber || "Sem número MP"} · {localDatePart(item.record.receivedAt) || "entrada inválida"}</small></div><p>{item.details.join("; ")}</p></div>)}</div>{preview.items.length > 30 && <button className="button secondary preview-expand" onClick={() => setShowAllPreview((value) => !value)}><ChevronDown size={17} />{showAllPreview ? "Mostrar resumo" : `Ver todos os ${preview.items.length} registros`}</button>}<div className="import-confirm-bar"><div><strong>{blockedStrict ? "Importação bloqueada pela validação rigorosa" : `${preview.accepted} registro(s) serão processados`}</strong><small>Nada será gravado antes da confirmação.</small></div><button className="button primary" disabled={busy || !preview.accepted || blockedStrict} onClick={confirmImport}>{busy ? "Importando..." : "Confirmar lote de importação"}</button></div></section>
    </>}

    {result && <div className="success-box"><CheckCircle2 size={20} /><div><strong>Importação concluída {result.batchCode ? `— ${result.batchCode}` : ""}</strong><span>{result.casesCreated} processos novos; {result.movementsCreated} movimentações novas; {result.movementsUpdated} atualizações; {result.ignoredRows} linhas sem alteração.</span></div></div>}

    {isAdmin && <section className="panel import-history-panel"><div className="panel-title"><div><h2>Histórico das importações</h2><p>Cada planilha é registrada como lote independente e pode ser desfeita quando não houver alterações manuais posteriores.</p></div><History size={21} /></div><div className="import-history-list">{batches.map((batch) => <details key={batch.id}><summary><div><strong>{batch.batchCode}</strong><small>{batch.fileName} · {fmt(batch.startedAt)}</small></div><span className={`batch-status status-${batch.status}`}>{batch.status === "completed" ? "Concluído" : batch.status === "reverted" ? "Revertido" : batch.status === "failed" ? "Falhou" : "Processando"}</span></summary><div className="batch-details"><dl><div><dt>Modelo</dt><dd>{batch.templateName || "Não informado"}</dd></div><div><dt>Usuário</dt><dd>{batch.actorName || "Administrador"}</dd></div><div><dt>Criados</dt><dd>{resultNumber(batch.result.casesCreated) + resultNumber(batch.result.movementsCreated)}</dd></div><div><dt>Atualizados</dt><dd>{resultNumber(batch.result.movementsUpdated)}</dd></div><div><dt>Ignorados</dt><dd>{resultNumber(batch.result.ignoredRows)}</dd></div></dl>{batch.errorMessage && <div className="import-error">{batch.errorMessage}</div>}{batch.status === "completed" && <button className="button secondary" disabled={revertingId === batch.id} onClick={() => void revert(batch)}><RotateCcw size={17} />{revertingId === batch.id ? "Desfazendo..." : "Desfazer lote"}</button>}</div></details>)}{!batches.length && <div className="empty-state">Nenhum lote de importação registrado.</div>}</div></section>}

    {isAdmin && <section className="panel danger-zone"><div><Trash2 size={22} /><span><strong>Limpar banco de dados</strong><small>Remove todos os processos e movimentações. As configurações permanecem.</small></span></div><button className="button danger-button" disabled={busy || !currentRecords.length} onClick={() => setShowClear(true)}>Limpar banco</button></section>}

    {showClear && <div className="modal-backdrop"><div className="confirm-dialog"><div className="modal-head"><div><p className="eyebrow danger-text">Ação irreversível</p><h2>Limpar todo o banco?</h2></div><button className="icon-button" onClick={() => setShowClear(false)}><X size={20} /></button></div><div className="confirm-body"><p>Antes da limpeza, o programa criará automaticamente um backup.</p><label>Digite <strong>LIMPAR</strong> para confirmar<input autoFocus value={clearText} onChange={(event) => setClearText(event.target.value)} /></label></div><div className="modal-actions"><button className="button secondary" onClick={() => setShowClear(false)}>Cancelar</button><button className="button danger-button" disabled={busy || clearText !== "LIMPAR"} onClick={() => { setShowClear(false); setSensitiveConfirmation("clear"); }}>{busy ? "Limpando..." : "Continuar para confirmação segura"}</button></div></div></div>}
    {showRestore && restoreFile && <div className="modal-backdrop"><div className="restore-dialog"><div className="modal-head"><div><p className="eyebrow">Recuperação de dados</p><h2>Restaurar um backup</h2></div><button className="icon-button" onClick={() => setShowRestore(false)}><X size={20} /></button></div><div className="restore-body"><p>A restauração substituirá os dados atuais pelos dados de <strong>{restoreFile.name}</strong>.</p><label className="restore-confirm">Digite <strong>RESTAURAR</strong> para confirmar<input value={restoreText} onChange={(event) => setRestoreText(event.target.value)} /></label></div><div className="modal-actions"><button className="button secondary" onClick={() => setShowRestore(false)}>Cancelar</button><button className="button danger-button" disabled={busy || restoreText !== "RESTAURAR"} onClick={() => { setShowRestore(false); setSensitiveConfirmation("restore"); }}>{busy ? "Restaurando..." : "Continuar para confirmação segura"}</button></div></div></div>}
    {sensitiveConfirmation === "clear" && <StrongAuthDialog title="Confirmar limpeza integral" description="Escolha biometria/passkey ou o código do autenticador. A limpeza somente será iniciada depois desta confirmação." onCancel={() => setSensitiveConfirmation(null)} onConfirmed={clearAll} />}
    {sensitiveConfirmation === "restore" && <StrongAuthDialog title="Confirmar restauração integral" description="Escolha biometria/passkey ou o código do autenticador. A restauração somente será iniciada depois desta confirmação." onCancel={() => setSensitiveConfirmation(null)} onConfirmed={restore} />}
  </div>;
}
