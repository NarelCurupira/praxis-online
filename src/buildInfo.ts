import { PRAXIS_VERSION } from "./version";

declare const __PRAXIS_BUILD_COMMIT__: string;
declare const __PRAXIS_BUILD_DATE__: string;

function safeDefined(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export const PRAXIS_BUILD = {
  version: PRAXIS_VERSION,
  commit: safeDefined(typeof __PRAXIS_BUILD_COMMIT__ === "undefined" ? "" : __PRAXIS_BUILD_COMMIT__, "local"),
  publishedAt: safeDefined(typeof __PRAXIS_BUILD_DATE__ === "undefined" ? "" : __PRAXIS_BUILD_DATE__, new Date().toISOString()),
};

export function shortCommit(value = PRAXIS_BUILD.commit): string {
  return value === "local" ? value : value.slice(0, 8);
}
