import { Activity, Infinity, ShieldCheck } from "lucide-react";
import { PRAXIS_VERSION } from "../version";

export function SplashScreen({ message }: { message: string }) {
  return (
    <div className="splash-screen p1-splash" role="status" aria-live="polite">
      <div className="p1-splash-orb p1-splash-orb-a" aria-hidden="true" />
      <div className="p1-splash-orb p1-splash-orb-b" aria-hidden="true" />
      <div className="p1-splash-orb p1-splash-orb-c" aria-hidden="true" />

      <div className="p1-splash-content">
        <img
          className="p1-splash-logo"
          src="/brand/praxis-1-logo-dark.webp"
          alt="Práxis"
        />

        <div className="p1-splash-copy">
          <h1>Bem-vindo<br />ao <em>Práxis</em></h1>
          <p>Controle processual com organização, segurança e continuidade.</p>
        </div>

        <div className="p1-splash-benefits" aria-hidden="true">
          <span><ShieldCheck /><b>Mais<br />segurança</b></span>
          <span><Activity /><b>Mais<br />eficiência</b></span>
          <span><Infinity /><b>Resultados<br />contínuos</b></span>
        </div>

        <div className="p1-splash-progress">
          <span className="splash-spinner" aria-hidden="true" />
          <span className="splash-message">{message}</span>
        </div>

        <div className="p1-splash-footer">
          <span>Práxis Web · Versão {PRAXIS_VERSION}</span>
          <strong>Tecnologia que impulsiona a Justiça</strong>
        </div>
      </div>
    </div>
  );
}
