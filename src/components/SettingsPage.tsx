import { useMemo, useState } from "react";
import {
  CalendarDays,
  Download,
  LockKeyhole,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import type {
  AccessScope,
  CalendarExclusion,
  CalendarExclusionRange,
  ClassSetting,
  ClosedPeriod,
  TeamMember,
  WorkspaceSettings,
} from "../types";
import { HelpTip } from "./HelpTip";
import { DeviceAccessPanel } from "./DeviceAccessPanel";
import { ProcuradoriasPanel } from "./ProcuradoriasPanel";
import { buildConfigurationExport, downloadConfigurationExport } from "../configurationExport";

interface Props {
  classes: ClassSetting[];
  exclusions: CalendarExclusion[];
  members: TeamMember[];
  settings: WorkspaceSettings;
  closedPeriods: ClosedPeriod[];
  onSaveClass: (setting: ClassSetting) => Promise<void>;
  onDeleteClass: (name: string) => Promise<void>;
  onSaveExclusion: (range: CalendarExclusionRange) => Promise<void>;
  onDeleteExclusion: (date: string) => Promise<void>;
  onSaveMemberAccess: (
    id: string,
    efficiency: AccessScope,
    reports: AccessScope,
  ) => Promise<void>;
  onSaveSettings: (settings: WorkspaceSettings) => Promise<void>;
  onClosePeriod: (year: number, month: number, reason: string) => Promise<void>;
  onReopenPeriod: (id: number, reason: string) => Promise<void>;
  currentWorkspaceId: string;
  onWorkspacesChanged?: () => Promise<void>;
}

interface CalendarRange {
  startDate: string;
  endDate: string;
}

interface CalendarDescriptionGroup {
  label: string;
  dates: CalendarExclusion[];
  ranges: CalendarRange[];
}

interface CalendarYearGroup {
  year: string;
  totalDays: number;
  groups: CalendarDescriptionGroup[];
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmt(date: string): string {
  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${date}T12:00:00`));
}

function normalizedLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
}

function nextDate(date: string): string {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + 1);
  return value.toISOString().slice(0, 10);
}

function consecutiveRanges(items: CalendarExclusion[]): CalendarRange[] {
  const dates = [...new Set(items.map((item) => item.date))].sort();
  if (!dates.length) return [];

  const ranges: CalendarRange[] = [];
  let startDate = dates[0];
  let endDate = dates[0];

  for (const date of dates.slice(1)) {
    if (date === nextDate(endDate)) {
      endDate = date;
      continue;
    }

    ranges.push({ startDate, endDate });
    startDate = date;
    endDate = date;
  }

  ranges.push({ startDate, endDate });
  return ranges;
}

function rangeLabel(range: CalendarRange): string {
  return range.startDate === range.endDate
    ? fmt(range.startDate)
    : `${fmt(range.startDate)} a ${fmt(range.endDate)}`;
}

function groupCalendar(exclusions: CalendarExclusion[]): CalendarYearGroup[] {
  const years = new Map<string, CalendarExclusion[]>();

  for (const exclusion of exclusions) {
    const year = exclusion.date.slice(0, 4);
    years.set(year, [...(years.get(year) ?? []), exclusion]);
  }

  return [...years.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([year, yearItems]) => {
      const descriptions = new Map<string, CalendarExclusion[]>();

      for (const item of yearItems) {
        const key = normalizedLabel(item.label || "Sem descrição");
        descriptions.set(key, [...(descriptions.get(key) ?? []), item]);
      }

      const groups = [...descriptions.values()]
        .map((items) => {
          const dates = [...items].sort((a, b) => a.date.localeCompare(b.date));
          return {
            label: dates[0]?.label?.trim() || "Sem descrição",
            dates,
            ranges: consecutiveRanges(dates),
          };
        })
        .sort((a, b) => a.dates[0].date.localeCompare(b.dates[0].date));

      return {
        year,
        totalDays: yearItems.length,
        groups,
      };
    });
}

export function SettingsPage(props: Props) {
  const [draft, setDraft] = useState(props.settings);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [className, setClassName] = useState("");
  const [days, setDays] = useState(30);
  const [label, setLabel] = useState("");
  const [start, setStart] = useState(today());
  const [end, setEnd] = useState(today());
  const [period, setPeriod] = useState(today().slice(0, 7));
  const [reason, setReason] = useState("");

  const calendarYears = useMemo(
    () => groupCalendar(props.exclusions),
    [props.exclusions],
  );

  async function run(operation: () => Promise<void>, successMessage: string) {
    setBusy(true);
    setMessage("");

    try {
      await operation();
      setMessage(successMessage);
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Governança</p>
          <h1>Configurações</h1>
          <p>Perfis, prazos, calendário, relatórios e integridade.</p>
        </div>
      </div>

      <DeviceAccessPanel />

      <ProcuradoriasPanel currentWorkspaceId={props.currentWorkspaceId} onChanged={props.onWorkspacesChanged} />

      <section className="panel governance-section configuration-export-panel">
        <div className="panel-title">
          <div>
            <div className="title-with-help"><h2>Exportação de configurações</h2><HelpTip title="O que é exportado">Gera um arquivo JSON com configurações institucionais, prazos por classe, calendário e períodos fechados. Não inclui processos, senhas, passkeys, tokens ou conteúdo processual.</HelpTip></div>
            <p>Guarde uma cópia externa das regras atualmente utilizadas pelo Práxis.</p>
          </div>
          <Download />
        </div>
        <div className="configuration-export-actions">
          <div>
            <strong>Arquivo de configurações</strong>
            <span>Formato JSON versionado, próprio para conferência e futura portabilidade.</span>
          </div>
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              const value = buildConfigurationExport({
                settings: draft,
                classes: props.classes,
                exclusions: props.exclusions,
                closedPeriods: props.closedPeriods,
              });
              downloadConfigurationExport(value);
              setMessage("Configurações exportadas.");
            }}
          >
            <Download size={17} /> Exportar configurações
          </button>
        </div>
      </section>

      <section className="panel governance-section">
        <div className="panel-title">
          <div>
            <h2>Perfis e permissões</h2>
            <p>
              Eficiência e Relatórios podem ser liberados somente para dados
              próprios ou para toda a equipe.
            </p>
          </div>
          <Users />
        </div>

        <div className="permission-table">
          <div className="permission-head">
            <span>Usuário</span>
            <span>Perfil</span>
            <span>Eficiência</span>
            <span>Relatórios</span>
          </div>

          {props.members.map((member) => {
            const fixed = ["admin", "procurador", "estagiario", "consulta"].includes(member.role);
            const efficiency = fixed
              ? member.role === "admin" || member.role === "procurador" ? "team" : "none"
              : member.efficiencyAccess ?? "own";
            const reports = fixed
              ? member.role === "admin" || member.role === "procurador" ? "team" : "none"
              : member.reportsAccess ?? "own";

            return (
              <div className="permission-row" key={member.userId}>
                <strong>{member.fullName || member.email}</strong>
                <span className="role-badge">{member.role}</span>

                <select
                  disabled={fixed || busy}
                  value={efficiency}
                  onChange={(event) => run(
                    () => props.onSaveMemberAccess(
                      member.userId,
                      event.target.value as AccessScope,
                      reports,
                    ),
                    "Permissão atualizada.",
                  )}
                >
                  <option value="none">Sem acesso</option>
                  <option value="own">Somente próprios dados</option>
                  <option value="team">Toda a equipe</option>
                </select>

                <select
                  disabled={fixed || busy}
                  value={reports}
                  onChange={(event) => run(
                    () => props.onSaveMemberAccess(
                      member.userId,
                      efficiency,
                      event.target.value as AccessScope,
                    ),
                    "Permissão atualizada.",
                  )}
                >
                  <option value="none">Sem acesso</option>
                  <option value="own">Somente relatório próprio</option>
                  <option value="team">Relatórios da equipe</option>
                </select>
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel governance-section">
        <div className="panel-title">
          <div>
            <div className="title-with-help"><h2>Prazos e jornada</h2><HelpTip title="Horas úteis">Os cálculos consideram apenas a interseção entre entrada, envio, expediente, fins de semana e datas sem expediente.</HelpTip></div>
            <p>Alterações futuras não recalculam o histórico automaticamente.</p>
          </div>
          <Save />
        </div>

        <div className="settings-grid">
          <label>
            Horas úteis por dia
            <input
              type="number"
              min="1"
              max="12"
              step="0.5"
              value={draft.workdayHours}
              onChange={(event) => setDraft({
                ...draft,
                workdayHours: Number(event.target.value),
              })}
            />
          </label>

          <label>
            Início do expediente
            <input
              type="time"
              value={draft.workdayStart}
              onChange={(event) => setDraft({
                ...draft,
                workdayStart: event.target.value,
              })}
            />
          </label>

          <label>
            Fim do expediente
            <input
              type="time"
              value={draft.workdayEnd}
              onChange={(event) => setDraft({
                ...draft,
                workdayEnd: event.target.value,
              })}
            />
          </label>

          <label>
            Prazo-padrão
            <input
              type="number"
              min="1"
              max="365"
              value={draft.defaultDeadlineBusinessDays}
              onChange={(event) => setDraft({
                ...draft,
                defaultDeadlineBusinessDays: Number(event.target.value),
              })}
            />
          </label>

          <label>
            Recebimento fora do expediente
            <select
              value={draft.afterHoursPolicy}
              onChange={(event) => setDraft({
                ...draft,
                afterHoursPolicy: event.target.value as WorkspaceSettings["afterHoursPolicy"],
              })}
            >
              <option value="next_business_day">Iniciar no próximo dia útil</option>
              <option value="keep">Manter o instante real</option>
            </select>
          </label>

          <label className="check-row">
            <input
              type="checkbox"
              checked={draft.countFromNextBusinessDay}
              onChange={(event) => setDraft({
                ...draft,
                countFromNextBusinessDay: event.target.checked,
              })}
            />
            Contar a partir do próximo dia útil
          </label>
        </div>
      </section>

      <section className="panel governance-section">
        <div className="panel-title">
          <div>
            <h2>Relatórios e privacidade</h2>
            <p>Identificação institucional e prevenção de comparações depreciativas.</p>
          </div>
          <ShieldCheck />
        </div>

        <p className="report-settings-help">Estas informações passam a compor os PDFs: unidade e procurador aparecem na identificação do relatório; o rodapé personalizado complementa o aviso obrigatório; modalidade e período definem a seleção inicial; a opção de comparações nominais controla a exibição dos nomes da equipe.</p>

        <div className="settings-grid">
          <label>
            Nome da unidade
            <input
              value={draft.unitName}
              onChange={(event) => setDraft({ ...draft, unitName: event.target.value })}
            />
          </label>

          <label>
            Procurador responsável
            <input
              value={draft.leadProsecutor}
              onChange={(event) => setDraft({ ...draft, leadProsecutor: event.target.value })}
            />
          </label>

          <label>
            Modalidade-padrão
            <select
              value={draft.defaultReportMode}
              onChange={(event) => setDraft({
                ...draft,
                defaultReportMode: event.target.value as WorkspaceSettings["defaultReportMode"],
              })}
            >
              <option value="executive">Executivo</option>
              <option value="complete">Completo</option>
              <option value="highlights">Anexo de destaques</option>
            </select>
          </label>

          <label>
            Período-padrão
            <select
              value={draft.defaultReportPeriod}
              onChange={(event) => setDraft({
                ...draft,
                defaultReportPeriod: event.target.value as WorkspaceSettings["defaultReportPeriod"],
              })}
            >
              <option value="month">Mês atual</option>
              <option value="30days">Últimos 30 dias</option>
              <option value="year">Ano atual</option>
            </select>
          </label>

          <label className="full">
            Rodapé
            <textarea
              rows={2}
              value={draft.reportFooter}
              onChange={(event) => setDraft({ ...draft, reportFooter: event.target.value })}
            />
          </label>

          <label className="check-row full">
            <input
              type="checkbox"
              checked={draft.allowNamedComparisons}
              onChange={(event) => setDraft({
                ...draft,
                allowNamedComparisons: event.target.checked,
              })}
            />
            Permitir comparações nominais nos relatórios da equipe
          </label>
        </div>
      </section>

      <section className="panel governance-section">
        <div className="panel-title">
          <div>
            <h2>Integridade dos dados</h2>
            <p>Validações obrigatórias e proteção de períodos fechados.</p>
          </div>
          <LockKeyhole />
        </div>

        <div className="check-grid">
          {([
            ["requireActionOnSend", "Exigir providência antes do envio"],
            ["requireAssigneeOnProgress", "Exigir responsável antes de avançar o status"],
            ["detectDuplicates", "Detectar possíveis duplicidades"],
            ["requireDateChangeReason", "Exigir justificativa para alteração de datas"],
            ["blockClosedPeriods", "Bloquear alterações em períodos fechados"],
          ] as const).map(([key, text]) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={draft[key]}
                onChange={(event) => setDraft({
                  ...draft,
                  [key]: event.target.checked,
                })}
              />
              {text}
            </label>
          ))}
        </div>

        <button
          className="button primary"
          disabled={busy}
          onClick={() => run(
            () => props.onSaveSettings(draft),
            "Configurações salvas.",
          )}
        >
          <Save size={17} />
          Salvar configurações
        </button>
      </section>

      <section className="panel">
        <div className="panel-title">
          <div><h2>Classes e prazos</h2></div>
        </div>

        <form
          className="class-form"
          onSubmit={(event) => {
            event.preventDefault();
            run(
              () => props.onSaveClass({
                name: className.trim(),
                businessDays: days,
              }),
              "Classe incluída.",
            );
            setClassName("");
          }}
        >
          <label>
            Nova classe
            <input
              required
              value={className}
              onChange={(event) => setClassName(event.target.value)}
            />
          </label>

          <label>
            Dias úteis
            <input
              type="number"
              min="1"
              max="365"
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
            />
          </label>

          <button className="button primary">
            <Plus size={17} />
            Incluir
          </button>
        </form>

        <div className="class-list">
          {props.classes.map((setting) => (
            <div className="class-row" key={setting.name}>
              <strong>{setting.name}</strong>
              <span>{setting.businessDays} dias úteis</span>
              <button
                className="icon-button danger"
                onClick={() => confirm(`Excluir ${setting.name}?`) && run(
                  () => props.onDeleteClass(setting.name),
                  "Classe removida.",
                )}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="panel calendar-settings">
        <div className="panel-title">
          <div>
            <div className="title-with-help"><h2>Feriados, recessos e dias sem expediente</h2><HelpTip title="Calendário institucional">As datas cadastradas são excluídas dos cálculos de prazo e de horas úteis. Dias consecutivos com a mesma descrição são apresentados em conjunto.</HelpTip></div>
            <p>Agrupados por ano, descrição e períodos consecutivos.</p>
          </div>
          <CalendarDays />
        </div>

        <form
          className="calendar-form"
          onSubmit={(event) => {
            event.preventDefault();
            run(
              () => props.onSaveExclusion({
                startDate: start,
                endDate: end,
                label: label.trim(),
              }),
              "Calendário atualizado.",
            );
            setLabel("");
          }}
        >
          <label>
            Descrição
            <input
              required
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
          </label>

          <label>
            Data inicial
            <input
              type="date"
              value={start}
              onChange={(event) => setStart(event.target.value)}
            />
          </label>

          <label>
            Data final
            <input
              type="date"
              min={start}
              value={end}
              onChange={(event) => setEnd(event.target.value)}
            />
          </label>

          <button className="button primary">
            <Plus size={17} />
            Incluir
          </button>
        </form>

        <div className="calendar-years">
          {calendarYears.map((yearGroup, yearIndex) => (
            <details key={yearGroup.year} open={yearIndex === 0}>
              <summary>
                <strong>{yearGroup.year}</strong>
                <span>{yearGroup.totalDays} dias cadastrados</span>
              </summary>

              <div className="calendar-groups">
                {yearGroup.groups.map((group) => (
                  <details
                    className="calendar-label-group"
                    key={`${yearGroup.year}-${normalizedLabel(group.label)}`}
                  >
                    <summary>
                      <span>
                        <strong>{group.label}</strong>
                        <small>{group.ranges.map(rangeLabel).join(" · ")}</small>
                      </span>
                      <b>{group.dates.length} {group.dates.length === 1 ? "dia" : "dias"}</b>
                    </summary>

                    <div className="calendar-list">
                      {group.dates.map((item) => (
                        <div className="calendar-row" key={item.date}>
                          <span>
                            <strong>{fmt(item.date)}</strong>
                            <small>{item.label}</small>
                          </span>
                          <button
                            className="icon-button danger"
                            aria-label={`Excluir ${item.label} em ${fmt(item.date)}`}
                            onClick={() => run(
                              () => props.onDeleteExclusion(item.date),
                              "Data removida.",
                            )}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            </details>
          ))}
        </div>
      </section>

      <section className="panel governance-section">
        <div className="panel-title">
          <div>
            <div className="title-with-help"><h2>Fechamento mensal</h2><HelpTip title="Fechamento mensal">O fechamento protege o histórico contra alterações comuns. Somente o administrador pode reabrir o período, mediante justificativa.</HelpTip></div>
            <p>Períodos fechados ficam estáveis e só podem ser reabertos pelo administrador.</p>
          </div>
          <LockKeyhole />
        </div>

        <div className="period-close-form">
          <input
            type="month"
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
          />
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Justificativa"
          />
          <button
            className="button primary"
            disabled={!reason.trim()}
            onClick={() => {
              const [year, month] = period.split("-").map(Number);
              run(
                () => props.onClosePeriod(year, month, reason),
                "Período fechado.",
              );
              setReason("");
            }}
          >
            Fechar período
          </button>
        </div>

        <div className="closed-period-list">
          {props.closedPeriods.map((closedPeriod) => (
            <div key={closedPeriod.id}>
              <strong>
                {String(closedPeriod.month).padStart(2, "0")}/{closedPeriod.year}
              </strong>
              <span>
                {closedPeriod.reopenedAt ? "Reaberto" : "Fechado"} · {closedPeriod.reason}
              </span>
              {!closedPeriod.reopenedAt && (
                <button
                  className="button secondary"
                  onClick={() => {
                    const reopenReason = prompt("Justificativa para reabertura:");
                    if (reopenReason) {
                      run(
                        () => props.onReopenPeriod(closedPeriod.id, reopenReason),
                        "Período reaberto.",
                      );
                    }
                  }}
                >
                  Reabrir
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {message && <div className="info-box">{message}</div>}
    </div>
  );
}
