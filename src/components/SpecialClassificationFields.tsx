import { Scale, Sparkles } from "lucide-react";

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
  complexityReason: string;
}

interface Props {
  data: SpecialClassificationData;
  onChange: (key: keyof SpecialClassificationData, value: string | boolean) => void;
}

export function SpecialClassificationFields({ data, onChange }: Props) {
  return <>
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
        <label className="full">Justificativa da relevância<textarea rows={2} value={data.relevanceReason} onChange={(event) => onChange("relevanceReason", event.target.value)} placeholder="Por que este processo merece destaque social?" /></label>
        <label className="full">Resultado social observado<textarea rows={2} value={data.socialResult} onChange={(event) => onChange("socialResult", event.target.value)} placeholder="Preencha quando houver resultado ou efeito social identificável." /></label>
      </div>
    </div>}
    {data.extremelyComplex && <div className="classification-section complex-section full">
      <div className="classification-title"><Scale size={17} /><div><strong>Dados de alta complexidade</strong><small>A marcação é independente da relevância social.</small></div></div>
      <label>Justificativa da complexidade<textarea rows={2} value={data.complexityReason} onChange={(event) => onChange("complexityReason", event.target.value)} placeholder="Ex.: multiplicidade de partes, prova técnica extensa, questão jurídica inédita..." /></label>
    </div>}
  </>;
}
