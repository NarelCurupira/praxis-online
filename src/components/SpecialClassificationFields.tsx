import { Scale, Sparkles } from "lucide-react";
import { HelpTip } from "./HelpTip";

export interface SpecialClassificationData {
  sociallyRelevant: boolean;
  extremelyComplex: boolean;
  socialTheme: string;
  relevanceReason: string;
  fundamentalRight: string;
  affectedGroup: string;
  reach: string;
  territorialScope: string;
  impactType: string;
  socialResult: string;
  sdgs: string[];
  complexityReason: string;
}

interface Props { data: SpecialClassificationData; onChange: (key: keyof SpecialClassificationData, value: string | boolean | string[]) => void; }
export const SDG_OPTIONS = [
  "ODS 1 — Erradicação da pobreza", "ODS 2 — Fome zero e agricultura sustentável", "ODS 3 — Saúde e bem-estar",
  "ODS 4 — Educação de qualidade", "ODS 5 — Igualdade de gênero", "ODS 6 — Água potável e saneamento",
  "ODS 7 — Energia limpa e acessível", "ODS 8 — Trabalho decente e crescimento econômico", "ODS 9 — Indústria, inovação e infraestrutura",
  "ODS 10 — Redução das desigualdades", "ODS 11 — Cidades e comunidades sustentáveis", "ODS 12 — Consumo e produção responsáveis",
  "ODS 13 — Ação contra a mudança global do clima", "ODS 14 — Vida na água", "ODS 15 — Vida terrestre",
  "ODS 16 — Paz, justiça e instituições eficazes", "ODS 17 — Parcerias e meios de implementação",
] as const;

export function SpecialClassificationFields({ data, onChange }: Props) {
  function toggleSdg(sdg: string, checked: boolean) { onChange("sdgs", checked ? [...new Set([...data.sdgs, sdg])] : data.sdgs.filter((item) => item !== sdg)); }
  return <>
    <div className="classification-heading full"><div><strong>Classificação especial</strong><small>Marque apenas quando o processo exigir destaque específico.</small></div><HelpTip title="Classificação especial">Relevância social descreve impacto social, coletivo, difuso ou estrutural. Alta complexidade identifica processos que exigem análise excepcional. As marcações são independentes.</HelpTip></div>
    <div className="classification-switches full">
      <label className={data.sociallyRelevant ? "classification-switch social active" : "classification-switch social"}>
        <input type="checkbox" checked={data.sociallyRelevant} onChange={(event) => onChange("sociallyRelevant", event.target.checked)} />
        <Sparkles size={20} /><span><strong>Relevância social</strong><small>Destaca impacto social, coletivo ou estrutural.</small></span>
      </label>
      <label className={data.extremelyComplex ? "classification-switch complex active" : "classification-switch complex"}>
        <input type="checkbox" checked={data.extremelyComplex} onChange={(event) => onChange("extremelyComplex", event.target.checked)} />
        <Scale size={20} /><span><strong>Alta complexidade</strong><small>Destaca processos que exigem análise excepcional.</small></span>
      </label>
    </div>
    {data.sociallyRelevant && <div className="classification-section social-section full">
      <div className="classification-title"><Sparkles size={17} /><div><strong>Dados de relevância social</strong><small>Preencha somente o que for útil para identificar e relatar o impacto.</small></div></div>
      <div className="nested-form-grid">
        <label>Tema social<input value={data.socialTheme} onChange={(event) => onChange("socialTheme", event.target.value)} placeholder="Ex.: saúde pública, infância, meio ambiente" /></label>
        <label>Direito fundamental relacionado<input value={data.fundamentalRight} onChange={(event) => onChange("fundamentalRight", event.target.value)} placeholder="Ex.: saúde, educação, moradia" /></label>
        <label>Grupo afetado<input value={data.affectedGroup} onChange={(event) => onChange("affectedGroup", event.target.value)} placeholder="Ex.: crianças, idosos, comunidade local" /></label>
        <label>Alcance<select value={data.reach} onChange={(event) => onChange("reach", event.target.value)}><option value="">Não informado</option><option>Individual qualificado</option><option>Coletivo</option><option>Difuso</option><option>Estrutural</option></select></label>
        <label>Abrangência territorial<select value={data.territorialScope} onChange={(event) => onChange("territorialScope", event.target.value)}><option value="">Não informada</option><option>Local</option><option>Municipal</option><option>Regional</option><option>Estadual</option><option>Nacional</option></select></label>
        <label>Tipo de impacto<select value={data.impactType} onChange={(event) => onChange("impactType", event.target.value)}><option value="">Não informado</option><option>Direto</option><option>Indireto</option><option>Reflexo</option></select></label>
        <fieldset className="sdg-fieldset full"><legend>Objetivos de Desenvolvimento Sustentável da ONU</legend><small>Selecione um ou mais ODS relacionados ao processo, se houver.</small><div className="sdg-grid">{SDG_OPTIONS.map((sdg) => <label key={sdg} className={data.sdgs.includes(sdg) ? "sdg-option selected" : "sdg-option"}><input type="checkbox" checked={data.sdgs.includes(sdg)} onChange={(event) => toggleSdg(sdg, event.target.checked)} /><span>{sdg}</span></label>)}</div></fieldset>
        <label className="full">Justificativa da relevância<textarea rows={2} value={data.relevanceReason} onChange={(event) => onChange("relevanceReason", event.target.value)} placeholder="Por que este processo merece destaque social?" /></label>
        <label className="full">Impacto social esperado<textarea rows={2} value={data.socialResult} onChange={(event) => onChange("socialResult", event.target.value)} placeholder="Descreva o impacto social que se espera produzir ou proteger." /></label>
      </div>
    </div>}
    {data.extremelyComplex && <div className="classification-section complex-section full"><div className="classification-title"><Scale size={17} /><div><strong>Dados de alta complexidade</strong><small>A marcação é independente da relevância social.</small></div></div><label>Justificativa da complexidade<textarea rows={2} value={data.complexityReason} onChange={(event) => onChange("complexityReason", event.target.value)} placeholder="Ex.: multiplicidade de partes, prova técnica extensa, questão jurídica inédita..." /></label></div>}
  </>;
}
