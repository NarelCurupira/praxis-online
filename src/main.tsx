import { lazy, StrictMode, Suspense, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { PwaManager } from "./components/PwaManager";
import { SplashScreen } from "./components/SplashScreen";
import { installGlobalErrorHandlers } from "./errorReporting";
import "./styles.css";
import "./governance.css";
import "./pwaSafeArea.css";
import "./mobileDashboard.css";
import "./v0107.css";
import "./v0110-layout-fixes.css";
import "./v0111-fixes.css";

const App = lazy(() => import("./App"));

function ReliableApp() {
  useEffect(() => installGlobalErrorHandlers(), []);
  return <ErrorBoundary><PwaManager /><Suspense fallback={<SplashScreen message="Preparando o Práxis..." />}><App /></Suspense></ErrorBoundary>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><ReliableApp /></StrictMode>);
