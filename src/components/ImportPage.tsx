import { useState } from "react";
import { Archive, CheckCircle2, Download, FileSpreadsheet, RotateCcw, Trash2, Upload, X } from "lucide-react";
import * as XLSX from "xlsx";
import { addBusinessDays, addDays, excelDateTime, localDatePart } from "../date";
import { actionLabel } from "../labels";
import type { CalendarExclusion, ClassSetting, ImportRecord, ImportResult, Priority, WorkflowStatus } from "../types";

interface Props {
  isAdmin: boolean;
  onImport: (records: ImportRecord[], onProgress?: (message: string) => void) => Promise<ImportResult>;
  onBackup: () => Promise<string>;
  onChanged: () => Promise<void>;
  records: import("../types").ProcessMovement[];
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
    const cell = XLSX.utils.decode_cell(address);
    maxRow = Math.max(maxRow, cell.r); maxColumn = Math.max(maxColumn, cell.c);
  }
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null, range: { s: { r: 0, c: 0 }, e: { r: maxRow, c: maxColumn } } });
}

function specialDefaults() {
  return {
    sociallyRelevant: false, extremelyComplex: false, socialTheme: "", relevanceReason: "",
    fundamentalRight: "", affectedGroup: "", reach: "", territorialScope: "", impactType: "",
    socialResult: "", sdgs: [], complexityReason: "",
  };
}

function inferAction(value: string): string {
  const text = value.toLowerCase();
  if (/\bctrz|contrarraz/.test(text)) return "CTRZ";
  if (/\bdi\b|desnecessária intervenção|desnecessaria intervencao/.test(text)) return "DI";
  if (text.includes("dilig")) return "Diligência";
  if (text.includes("preven")) return "Prevenção";
  if (text.includes("ciên") || text.includes("cien")) return "Ciência";
  if (text.includes("sobrest")) return "Sobrestamento";
  if (text.includes("ratific")) return "Ratifico";
  if (text.includes("recurso")) return "Recurso";
  return "";
}

function normalizeHeader(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[º°]/g, "o").replace(/\s+/g, " ");
}

function headerIndex(headers: string[], ...names: string[]): number {
  return headers.findIndex((header) => names.includes(header));
}

function monthlyHeaderIndex(rows: unknown[][]): number {
  return rows.slice(0, 10).findIndex((row) => {
    const headers = row.map(normalizeHeader);
    return headers.includes("entrada") && headers.includes("prazo")
      && headers.includes("no mp") && headers.includes("no judiciario")
      && headers.includes("observacao da fila");
  });
}

function isSajRows(rows: unknown[][]): boolean {
  return rows.some((row) => {
    const headers = row.map(normalizeHeader);
    return headers.includes("entrada") && headers.includes("no mp")
      && headers.includes("no judiciario") && headers.includes("assunto principal");
  });
}

function isMonthlyRows(rows: unknown[][]): boolean { return monthlyHeaderIndex(rows) >= 0; }
function classDays(className: string, classes: ClassSetting[]): number { return classes.find((item) => item.name.trim().toLowerCase() === className.trim().toLowerCase())?.businessDays ?? 30; }

function dateTimeColumns(headers: string[], base: "entrada" | "envio") {
  const date = headerIndex(headers, base, `data de ${base}`, `data ${base}`);
  const time = headerIndex(headers, `hora de ${base}`, `hora ${base}`, `horario de ${base}`, `horario ${base}`);
  return { date, time };
}

async function parseWorkbook(file: File, classes: ClassSetting[], exclusions: CalendarExclusion[]): Promise<{ records: ImportRecord[]; ignored: number; template: string }> {
  // Datas permanecem como números seriais do Excel. Converter previamente
  // para Date faz o navegador aplicar o fuso local e pode deslocar o horário
  // importado em três horas.
  const workbook = XLSX.read(await file.arrayBuffer(), { cellDates: false });
  const records: ImportRecord[] = [];
  let ignored = 0;
  const sheets = workbook.SheetNames.map((name) => ({ name, rows: boundedRows(workbook.Sheets[name]) }));
  const saj = sheets.some((sheet) => isSajRows(sheet.rows));

  if (saj) {
    for (const sheet of sheets) {
      if (!isSajRows(sheet.rows)) continue;
      const headerRow = sheet.rows.findIndex((row) => row.map(normalizeHeader).includes("no judiciario"));
      const headers = headerRow >= 0 ? sheet.rows[headerRow].map(normalizeHeader) : [];
      const entryTimeColumn = headerIndex(headers, "hora de entrada", "hora entrada", "horario de entrada", "horario entrada");
      let currentClass = "Não identificada";
      for (const row of sheet.rows) {
        const first = String(row[0] ?? "").trim();
        if (first.toLowerCase().startsWith("classe tj")) {
          currentClass = first.split(":").slice(1).join(":").replace(/\s+\(\d+\)\s*$/, "").trim() || currentClass;
          continue;
        }
        const rowText = row.map((cell) => String(cell ?? "").trim().toLowerCase());
        if (rowText.includes("nº mp") && rowText.includes("nº judiciário")) continue;
        const received = excelDateTime(row[7], entryTimeColumn >= 0 ? row[entryTimeColumn] : undefined);
        const mpNumber = String(row[8] ?? "").trim();
        const judicialNumber = String(row[9] ?? "").trim();
        const principalSubject = String(row[10] ?? "").trim();
        const queueObservation = String(row[11] ?? "").trim();
        const allocatedTo = String(row[12] ?? "").trim();
        const hasContent = row.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== "");
        if (!hasContent || (!mpNumber && !judicialNumber && !received.value)) continue;
        if (!mpNumber || !judicialNumber || !received.value) { ignored += 1; continue; }
        const tarjas = String(row[3] ?? "").trim();
        const notes = [
          principalSubject && principalSubject !== queueObservation ? `Assunto principal: ${principalSubject}` : "",
          allocatedTo ? `Alocado no SAJ para: ${allocatedTo}` : "",
          tarjas ? `Tarjas MP: ${tarjas}` : "",
          String(row[4] ?? "").trim().toUpperCase() === "S" ? "Atividade marcada como realizada no SAJ." : "",
        ].filter(Boolean).join(" | ");
        const priority: Priority = /urgent|prioridade/i.test(tarjas) ? "Urgente" : "Normal";
        records.push({
          mpNumber, judicialNumber, className: currentClass,
          subject: queueObservation || principalSubject || "Importado do fluxo de trabalho do SAJ",
          receivedAt: received.value, receivedTimePrecise: received.precise,
          deadlineAt: addBusinessDays(received.value, classDays(currentClass, classes), exclusions.map((item) => item.date)).slice(0, 10),
          draftStatus: "Pendente", workflowStatus: "Recebido", sentAt: null, sentTimePrecise: false,
          actionType: inferAction(queueObservation), notes, priority, documentPath: "", ...specialDefaults(),
        });
      }
    }
    return { records, ignored, template: "SAJ — Fluxo de Trabalho" };
  }

  const monthlySheets = sheets.filter((sheet) => /^\d{4}-(0[1-9]|1[0-2])$/.test(sheet.name.trim()) || /^(0[1-9]|1[0-2])\.\d{4}$/.test(sheet.name.trim()) || isMonthlyRows(sheet.rows));
  for (const { rows } of monthlySheets) {
    const headerRow = monthlyHeaderIndex(rows);
    if (headerRow < 0) continue;
    const headers = rows[headerRow].map(normalizeHeader);
    const entry = dateTimeColumns(headers, "entrada");
    const deadlineColumn = headerIndex(headers, "prazo");
    const mpColumn = headerIndex(headers, "no mp");
    const judicialColumn = headerIndex(headers, "no judiciario");
    const subjectColumn = headerIndex(headers, "observacao da fila");
    const draftColumn = headerIndex(headers, "minuta?");
    const statusColumn = headerIndex(headers, "status");
    const sent = dateTimeColumns(headers, "envio");
    const actionColumn = headerIndex(headers, "obs", "providencia");
    const priorityColumn = headerIndex(headers, "prioridade?", "prioridade");
    let currentClass = "Não identificada";

    for (const row of rows.slice(headerRow + 1)) {
      const first = String(row[0] ?? "").trim();
      if (first.toLowerCase().startsWith("classe tj")) { currentClass = first.split(":").slice(1).join(":").trim() || currentClass; continue; }
      const judicialNumber = String(row[judicialColumn] ?? "").trim();
      const mpNumber = String(row[mpColumn] ?? "").trim();
      const receivedValue = row[entry.date];
      if (first && !/^\d+$/.test(first) && !judicialNumber && !mpNumber && !receivedValue) { currentClass = first; continue; }
      const hasContent = row.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== "");
      if (!hasContent) continue;
      if (!judicialNumber && !mpNumber && !receivedValue) continue;
      if (!judicialNumber || !mpNumber || !receivedValue) { ignored += 1; continue; }
      const received = excelDateTime(receivedValue, entry.time >= 0 ? row[entry.time] : undefined);
      if (!received.value) { ignored += 1; continue; }
      const sentValue = sent.date >= 0 ? excelDateTime(row[sent.date], sent.time >= 0 ? row[sent.time] : undefined) : { value: "", precise: false };
      const workflowStatus = statusColumn >= 0 ? normalizeStatus(row[statusColumn]) : "Recebido";
      const subject = String(row[subjectColumn] ?? "").trim();
      const providedAction = actionColumn >= 0 ? String(row[actionColumn] ?? "").trim() : "";
      const priorityText = priorityColumn >= 0 ? normalizeHeader(row[priorityColumn]) : "";
      const priority: Priority = /^(s|sim|x|1|true)$/.test(priorityText) || priorityText.includes("urgent") ? "Urgente" : "Normal";
      records.push({
        mpNumber, judicialNumber, className: currentClass, subject,
        receivedAt: received.value, receivedTimePrecise: received.precise,
        deadlineAt: deadlineColumn >= 0 ? localDatePart(excelDateTime(row[deadlineColumn]).value) || addDays(received.value, 40).slice(0, 10) : addDays(received.value, 40).slice(0, 10),
        draftStatus: draftColumn >= 0 ? String(row[draftColumn] ?? "Pendente").trim() : workflowStatus === "Enviado" ? "Minutado" : "Pendente",
        workflowStatus, sentAt: sentValue.value || null, sentTimePrecise: sentValue.precise,
        actionType: providedAction || inferAction(subject) || "Manifestação", notes: "", priority, documentPath: "", ...specialDefaults(),
      });
    }
  }
  return { records, ignored, template: records.length ? "Planilha mensal do Práxis" : "Modelo não reconhecido" };
}

export function ImportPage({ isAdmin, onImport, onBackup, onChanged, records: currentRecords, onExport, onClear, onRestoreBackup, classes, exclusions }: Props) {
  const [fileName, setFileName] = useState("");
  const [records, setRecords] = useState<ImportRecord[]>([]);
  const [ignored, setIgnored] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [showClear, setShowClear] = useState(false);
  const [clearText, setClearText] = useState("");
  const [showRestore, setShowRestore] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoreText, setRestoreText] = useState("");
  const [template, setTemplate] = useState("");
  const [importError, setImportError] = useState("");
  const [importProgress, setImportProgress] = useState("");

  async function chooseFile(file?: File) {
    if (!file) return;
    setBusy(true); setResult(null); setMessage(""); setImportError(""); setImportProgress(""); setRecords([]);
    try {
      const parsed = await parseWorkbook(file, classes, exclusions);
      setFileName(file.name); setRecords(parsed.records); setIgnored(parsed.ignored); setTemplate(parsed.template);
      if (!parsed.records.length) setImportError("O arquivo não corresponde ao modelo mensal do Práxis nem ao relatório Fluxo de Trabalho do SAJ, ou não contém registros válidos.");
    } catch (error) { setImportError(`Não foi possível ler a planilha: ${String(error)}`); }
    finally { setBusy(false); }
  }

  async function confirmImport() {
    if (!records.length) return;
    setBusy(true); setImportError(""); setImportProgress("Preparando importação...");
    try {
      const imported = await onImport(records, setImportProgress);
      imported.ignoredRows += ignored;
      setResult(imported); setRecords([]); await onChanged();
    } catch (error) { setImportError(`A planilha foi lida, mas não foi possível gravar os dados: ${String(error)}`); }
    finally { setBusy(false); setImportProgress(""); }
  }

  async function backup() { setBusy(true); setMessage(await onBackup()); setBusy(false); }
  async function restore() {
    if (!restoreFile) return;
    setBusy(true); setMessage("");
    try { const restored = await onRestoreBackup(restoreFile); await onChanged(); setMessage(restored); setShowRestore(false); setRestoreText(""); setRestoreFile(null); }
    catch (error) { setMessage(`Não foi possível restaurar: ${String(error)}`); setShowRestore(false); }
    finally { setBusy(false); }
  }

  async function exportExcel() {
    setBusy(true);
    const rows = currentRecords.map((record) => ({
      "Nº MP": record.mpNumber, "Nº Judicial": record.judicialNumber, "Classe": record.className, "Assunto": record.subject,
      "Entrada": record.receivedAt, "Horário de entrada confirmado": record.receivedTimePrecise ? "Sim" : "Não",
      "Prazo": record.deadlineAt, "Minuta": record.draftStatus, "Status": record.workflowStatus,
      "Envio": record.sentAt ?? "", "Horário de envio confirmado": record.sentTimePrecise ? "Sim" : "Não",
      "Providência": actionLabel(record.actionType), "Prioridade": record.priority, "Observações": record.notes,
      "Documento": record.documentPath, "Relevância social": record.sociallyRelevant ? "Sim" : "Não",
      "Alta complexidade": record.extremelyComplex ? "Sim" : "Não", "Tema social": record.socialTheme,
      "Justificativa da relevância": record.relevanceReason, "Direito fundamental": record.fundamentalRight,
      "Grupo afetado": record.affectedGroup, "Alcance": record.reach, "Abrangência territorial": record.territorialScope,
      "Tipo de impacto": record.impactType, "Impacto social esperado": record.socialResult,
      "ODS da ONU": record.sdgs.join("; "), "Justificativa da complexidade": record.complexityReason,
    }));
    const workbook = XLSX.utils.book_new(); const sheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, sheet, "Processos");
    const bytes = Array.from(new Uint8Array(XLSX.write(workbook, { bookType: "xlsx", type: "array" })));
    setMessage(await onExport(bytes)); setBusy(false);
  }

  async function clearAll() { setBusy(true); const resultMessage = await onClear(); await onChanged(); setMessage(resultMessage); setShowClear(false); setClearText(""); setResult(null); setBusy(false); }
  const preciseEntries = records.filter((record) => record.receivedTimePrecise).length;
  const preciseSends = records.filter((record) => record.sentTimePrecise).length;

  return <div className="page-stack">
    <div className="page-heading"><div><p className="eyebrow">Segurança dos dados</p><h1>Importar e backup</h1><p>Traga o histórico do Excel e preserve cópias externas do banco online.</p></div></div>
    <div className="two-column">
      <section className="panel action-panel"><div className="large-icon blue"><FileSpreadsheet size={28} /></div><h2>Importar planilha</h2><p>Compatível com a planilha mensal do Práxis e com o relatório “Fluxo de Trabalho” exportado pelo SAJ. Horários podem estar na mesma célula da data ou em colunas separadas.</p><label className="button primary file-button"><Upload size={18} />Selecionar arquivo<input type="file" accept=".xlsx,.xls" onClick={(event) => { event.currentTarget.value = ""; }} onChange={(event) => { const file = event.currentTarget.files?.[0]; void chooseFile(file); }} /></label>
        {busy && <p className="muted">{importProgress || "Processando..."}</p>}
        {records.length > 0 && <div className="import-preview"><strong>{fileName}</strong><span className="template-detected">Modelo identificado: {template}</span><span>{records.length} registros reconhecidos</span><span>{preciseEntries} entradas e {preciseSends} envios com horário reconhecido</span><span>{ignored} linhas ignoradas</span>{template.startsWith("SAJ") && <small>Os prazos foram calculados conforme a classe e o calendário atual das Configurações.</small>}<button className="button primary" disabled={busy} onClick={confirmImport}>{busy ? "Importando..." : "Confirmar importação"}</button></div>}
        {importError && <div className="import-error">{importError}</div>}
        {result && <div className="success-box"><CheckCircle2 size={20} /><div><strong>Importação concluída</strong><span>{result.casesCreated} processos novos; {result.movementsCreated} movimentações novas; {result.movementsUpdated} movimentações existentes atualizadas com horários; {result.ignoredRows} linhas sem alteração.</span></div></div>}
      </section>
      <section className="panel action-panel"><div className="large-icon green"><Archive size={28} /></div><h2>{isAdmin ? "Backup e exportação" : "Exportação"}</h2><p>{isAdmin ? "Baixe cópias independentes dos dados armazenados no Supabase." : "Exporte uma cópia em Excel para conferência e trabalho pessoal."}</p><div className="button-row">{isAdmin && <><button className="button secondary" onClick={backup} disabled={busy}><Archive size={18} />Criar backup JSON</button><label className="button secondary file-button"><RotateCcw size={18} />Restaurar backup<input type="file" accept=".json,application/json" onClick={(event) => { event.currentTarget.value = ""; }} onChange={(event) => { const file = event.currentTarget.files?.[0] ?? null; setRestoreFile(file); if (file) setShowRestore(true); }} /></label></>}<button className="button secondary" onClick={exportExcel} disabled={busy || !currentRecords.length}><Download size={18} />Exportar Excel completo</button></div>{message && <div className="info-box">{message}</div>}</section>
    </div>
    {isAdmin && <section className="panel danger-zone"><div><Trash2 size={22} /><span><strong>Limpar banco de dados</strong><small>Remove todos os processos e movimentações. As configurações de classes permanecem.</small></span></div><button className="button danger-button" disabled={busy || !currentRecords.length} onClick={() => setShowClear(true)}>Limpar banco</button></section>}
    <section className="panel"><div className="panel-title"><div><h2>Como a importação funciona</h2><p>O modelo é identificado automaticamente e a planilha original permanece intacta.</p></div></div><ol className="steps-list"><li>No modelo mensal, são lidas as abas no formato AAAA-MM.</li><li>O horário é lido da própria célula de Entrada/Envio ou das colunas “Hora de entrada” e “Hora de envio”.</li><li>Ao reimportar, o Práxis não duplica o processo: ele preenche os horários de registros antigos que ainda não tinham hora confirmada.</li><li>Processos que não constam na planilha podem ter a entrada e o envio corrigidos pela opção Editar.</li><li>No modelo SAJ, como não há prazo, ele é calculado pelas regras atuais das Configurações.</li></ol></section>
    {showClear && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setShowClear(false)}><div className="confirm-dialog"><div className="modal-head"><div><p className="eyebrow danger-text">Ação irreversível</p><h2>Limpar todo o banco?</h2></div><button className="icon-button" onClick={() => setShowClear(false)}><X size={20} /></button></div><div className="confirm-body"><p>Todos os processos e movimentações serão removidos. Antes da limpeza, o programa criará automaticamente um backup de segurança.</p><label>Digite <strong>LIMPAR</strong> para confirmar<input autoFocus value={clearText} onChange={(event) => setClearText(event.target.value)} /></label></div><div className="modal-actions"><button className="button secondary" onClick={() => setShowClear(false)}>Cancelar</button><button className="button danger-button" disabled={busy || clearText !== "LIMPAR"} onClick={clearAll}>{busy ? "Limpando..." : "Limpar definitivamente"}</button></div></div></div>}
    {showRestore && restoreFile && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setShowRestore(false)}><div className="restore-dialog"><div className="modal-head"><div><p className="eyebrow">Recuperação de dados</p><h2>Restaurar um backup</h2></div><button className="icon-button" onClick={() => setShowRestore(false)}><X size={20} /></button></div><div className="restore-body"><div className="restore-warning"><ShieldRestoreIcon /><p>A restauração substituirá os dados atuais pelos dados de <strong>{restoreFile.name}</strong>. Antes disso, o Práxis baixará automaticamente uma cópia de segurança do banco atual.</p></div><label className="restore-confirm">Digite <strong>RESTAURAR</strong> para confirmar<input value={restoreText} onChange={(event) => setRestoreText(event.target.value)} /></label></div><div className="modal-actions"><button className="button secondary" onClick={() => setShowRestore(false)}>Cancelar</button><button className="button danger-button" disabled={busy || restoreText !== "RESTAURAR"} onClick={restore}>{busy ? "Restaurando..." : "Restaurar backup"}</button></div></div></div>}
  </div>;
}

function ShieldRestoreIcon() { return <RotateCcw size={24} />; }
