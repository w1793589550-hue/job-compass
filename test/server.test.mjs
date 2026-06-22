import test from "node:test";
import assert from "node:assert/strict";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { createJobCompassServer, verifyPasswordHash } from "../server.mjs";

test("server exposes quota and privacy pages while protecting costly endpoints", async (t) => {
  const server = createJobCompassServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const privacy = await fetch(`${baseUrl}/privacy.html`);
  assert.equal(privacy.status, 200);
  assert.equal(privacy.headers.get("x-content-type-options"), "nosniff");
  assert.match(await privacy.text(), /隐私政策与简历分析授权说明/);

  const missingAccount = await fetch(`${baseUrl}/api/quota`);
  assert.equal(missingAccount.status, 400);

  const account = "test-anonymous-account-1234567890";
  const quota = await fetch(`${baseUrl}/api/quota`, {
    headers: { "X-Client-Id": account },
  });
  assert.equal(quota.status, 200);
  const quotaBody = await quota.json();
  assert.equal(quotaBody.ok, true);
  assert.ok(Number.isInteger(quotaBody.quota.remaining.tavilyCredits));
  assert.equal(quotaBody.quota.deepseek.totalTokens >= 0, true);

  const protectedRequest = await fetch(`${baseUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(protectedRequest.status, 400);
  assert.match((await protectedRequest.json()).error, /匿名账号标识/);

  const noConsent = await fetch(`${baseUrl}/api/analyze-resume`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Client-Id": account,
    },
    body: JSON.stringify({ resumeText: "这是一段用于验证隐私授权硬门槛的简历文字。".repeat(8) }),
  });
  assert.equal(noConsent.status, 400);
  assert.match((await noConsent.json()).error, /隐私政策/);
});

test("admin password verification uses salted PBKDF2 hashes", () => {
  const password = "correct-admin-password";
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, 310_000, 32, "sha256");
  const encoded = `pbkdf2$sha256$310000$${salt.toString("base64url")}$${hash.toString("base64url")}`;

  assert.equal(verifyPasswordHash(password, encoded), true);
  assert.equal(verifyPasswordHash("wrong-password", encoded), false);
  assert.equal(verifyPasswordHash(password, "pbkdf2$sha1$1000$bad$bad"), false);
});
