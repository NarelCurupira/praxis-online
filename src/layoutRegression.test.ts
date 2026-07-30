import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("./v0107.css", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("./components/Sidebar.tsx", import.meta.url), "utf8");

test("menu móvel permanece oculto no desktop e reaparece no breakpoint móvel", () => {
  assert.match(css, /\.topbar \.mobile-menu\s*\{\s*display:\s*none !important;/);
  assert.match(css, /@media \(max-width:\s*760px\)[\s\S]*?\.topbar \.mobile-menu\s*\{\s*display:\s*inline-grid !important;/);
});

test("menu recolhido possui símbolos separados para os temas claro e escuro", () => {
  assert.match(sidebar, /brand-symbol-light/);
  assert.match(sidebar, /brand-symbol-dark/);
  assert.match(sidebar, /symbol-light\.webp/);
  assert.match(sidebar, /symbol-dark\.webp/);
});

test("botão de copiar compacto não herda a altura mínima global", () => {
  assert.match(css, /button:not\(\.copy-number-button\)/);
  assert.match(css, /button\.copy-number-button[\s\S]*?min-height:\s*30px !important;/);
  assert.match(css, /\.number-copy-line \.copy-number-button[\s\S]*?min-height:\s*26px !important;/);
});

test("cartões especiais e campos administrativos usam os tokens do tema", () => {
  assert.match(css, /\.classification-switch,[\s\S]*?\.locked-fields > div[\s\S]*?background:\s*var\(--surface-subtle\) !important;/);
  assert.match(css, /\.governance-section \.settings-grid[\s\S]*?border:\s*1px solid var\(--border\) !important;/);
});
