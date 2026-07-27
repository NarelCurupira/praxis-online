import assert from "node:assert/strict";
import test from "node:test";
import { eligiblePasskeyDevice } from "./passkeySupport";

test("habilita passkeys apenas em Mac e celulares", () => {
  assert.equal(eligiblePasskeyDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)").eligible, true);
  assert.equal(eligiblePasskeyDevice("Mozilla/5.0 (Linux; Android 15)").eligible, true);
  assert.equal(eligiblePasskeyDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)").eligible, true);
  assert.equal(eligiblePasskeyDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64)").eligible, false);
  assert.equal(eligiblePasskeyDevice("Mozilla/5.0 (X11; Linux x86_64)").eligible, false);
});
