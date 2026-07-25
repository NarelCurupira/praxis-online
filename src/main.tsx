import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { installGlobalErrorHandlers } from "./errorReporting";
import "./styles.css";
import "./governance.css";

function ReliableApp() {
  useEffect(() => installGlobalErrorHandlers(), []);
  return <ErrorBoundary><App /></ErrorBoundary>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><ReliableApp /></StrictMode>);
