import { Activity, Infinity, ShieldCheck } from "lucide-react";
import { PRAXIS_VERSION } from "../version";

export function SplashScreen({ message }: { message: string }) {
  return <div className="splash-screen praxis-welcome" role="status" aria-live="polite">
    <div className="praxis-welcome-shape praxis-welcome-shape-a" aria-hidden="true" />
    <div className="praxis-welcome-shape praxis-welcome-shape-b" aria-hidden="true" />
    <div className="praxis-welcome-shape praxis-welcome-shape-c" aria-hidden="true" />

    <div className="praxis-welcome-content">
      <div className="splash-brand praxis-welcome-brand">
        <img
          className="splash-logo praxis-welcome-logo"
          src="/brand/logo-horizontal-dark.webp"
          alt="Práxis — Controle de Processos"
        />
      </div>

      <div className="praxis-welcome-copy">
        <h1>Bem-vindo<br />ao <em>Práxis</em></h1>
        <p>Controle processual com organização, segurança e continuidade.</p>
      </div>

      <div className="praxis-welcome-benefits" aria-hidden="true">
        <span><ShieldCheck /><b>Mais<br />segurança</b></span>
        <span><Activity /><b>Mais<br />eficiência</b></span>
        <span><Infinity /><b>Resultados<br />contínuos</b></span>
      </div>

      <div className="splash-progress praxis-welcome-progress">
        <span className="splash-spinner" aria-hidden="true" />
        <span className="splash-message">{message}</span>
      </div>

      <div className="praxis-welcome-footer">
        <span className="splash-version">Práxis Web · Versão {PRAXIS_VERSION}</span>
        <span className="praxis-welcome-tagline">Tecnologia que impulsiona a Justiça</span>
      </div>
    </div>
  </div>;
}
