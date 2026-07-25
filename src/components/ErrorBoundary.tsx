import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, ClipboardCopy, House, RefreshCw } from "lucide-react";
import { copyTechnicalDiagnostic, reportTechnicalError } from "../errorReporting";
import type { TechnicalErrorRecord } from "../reliability";

interface Props { children: ReactNode; }
interface State { error: TechnicalErrorRecord | null; copied: boolean; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, copied: false };

  static getDerivedStateFromError(): Partial<State> { return {}; }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.setState({ error: reportTechnicalError(error, { source: "react.error-boundary", componentStack: info.componentStack }) });
  }

  private copy = async () => {
    if (!this.state.error) return;
    await copyTechnicalDiagnostic(this.state.error);
    this.setState({ copied: true });
  };

  render() {
    if (!this.state.error) return this.props.children;
    const error = this.state.error;
    return <main className="fatal-error-page">
      <section className="fatal-error-card">
        <div className="fatal-error-icon"><AlertTriangle size={32} /></div>
        <p className="eyebrow">Recuperação segura</p>
        <h1>Ocorreu um erro inesperado</h1>
        <p>Nenhum dado foi alterado por esta tela. O erro técnico foi identificado para facilitar a correção.</p>
        <dl>
          <div><dt>Código</dt><dd>{error.code}</dd></div>
          <div><dt>Página</dt><dd>{error.page || "Não identificada"}</dd></div>
          <div><dt>Versão</dt><dd>{error.buildVersion}</dd></div>
          <div><dt>Compilação</dt><dd>{error.buildCommit}</dd></div>
        </dl>
        <div className="fatal-error-actions">
          <button className="button secondary" onClick={this.copy}><ClipboardCopy size={17} />{this.state.copied ? "Diagnóstico copiado" : "Copiar diagnóstico"}</button>
          <button className="button secondary" onClick={() => { location.hash = ""; location.reload(); }}><House size={17} />Visão geral</button>
          <button className="button primary" onClick={() => location.reload()}><RefreshCw size={17} />Recarregar</button>
        </div>
      </section>
    </main>;
  }
}
