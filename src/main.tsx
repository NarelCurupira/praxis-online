import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { PwaManager } from "./components/PwaManager";
import { installGlobalErrorHandlers } from "./errorReporting";
import "./styles.css";
import "./governance.css";
import "./pwaSafeArea.css";

function ReliableApp() {
  useEffect(() => installGlobalErrorHandlers(), []);
  return <ErrorBoundary><PwaManager /><App /></ErrorBoundary>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><ReliableApp /></StrictMode>);
