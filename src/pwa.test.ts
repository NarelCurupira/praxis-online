import assert from "node:assert/strict";
import test from "node:test";
import { isIosDevice, isMacSafari, isStandaloneMode } from "./pwa";

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
