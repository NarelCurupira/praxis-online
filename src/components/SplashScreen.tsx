import { PRAXIS_VERSION } from "../version";

export function SplashScreen({ message }: { message: string }) {
  return <div className="splash-screen" role="status" aria-live="polite">
    <div className="splash-brand">
      <img className="splash-logo" src="/praxis-logo.png" alt="Práxis Web" />
      <div className="splash-version">Práxis Web · Versão {PRAXIS_VERSION}</div>
    </div>
    <div className="splash-progress"><span className="splash-spinner" aria-hidden="true" /><span className="splash-message">{message}</span></div>
  </div>;
}
