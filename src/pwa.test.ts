import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { isIosDevice, isMacSafari, isStandaloneMode, isSupportedPwaInstallDevice } from "./pwa";

test("detecta execução instalada", () => {
  assert.equal(isStandaloneMode(true, false), true);
  assert.equal(isStandaloneMode(false, true), true);
  assert.equal(isStandaloneMode(false, false), false);
});

test("detecta dispositivos iOS", () => {
  assert.equal(isIosDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)"), true);
  assert.equal(isIosDevice("Mozilla/5.0 (Linux; Android 15)"), false);
});

test("detecta Safari no Mac", () => {
  assert.equal(isMacSafari("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15"), true);
  assert.equal(isMacSafari("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/150.0.0.0 Safari/537.36"), false);
});


test("limita a oferta de instalação a Mac e celulares", () => {
  assert.equal(isSupportedPwaInstallDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/150"), false);
  assert.equal(isSupportedPwaInstallDevice("Mozilla/5.0 (Linux; Android 15) Chrome/150"), true);
  assert.equal(isSupportedPwaInstallDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)"), true);
  assert.equal(isSupportedPwaInstallDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15"), true);
});

test("manifesto 0.10.7 declara ícones comuns e maskable da nova identidade", () => {
  const manifest = JSON.parse(fs.readFileSync("public/manifest.webmanifest", "utf8")) as {
    theme_color: string;
    background_color: string;
    icons: Array<{ sizes: string; purpose: string; src: string }>;
  };
  assert.equal(manifest.theme_color, "#0A2B52");
  assert.equal(manifest.background_color, "#F8FAFC");
  assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512" && icon.purpose === "any"));
  assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512" && icon.purpose === "maskable"));
  manifest.icons.forEach((icon) => assert.equal(fs.existsSync(`public${icon.src}`), true));
});
