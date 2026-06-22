import test from "node:test";
import assert from "node:assert/strict";
import {
  assertPublicUrl,
  extractReadableText,
  fetchSourceBody,
  isPrivateIp,
  verifyEvidenceSources,
} from "../lib/evidence.mjs";

test("private and loopback addresses are rejected", async () => {
  assert.equal(isPrivateIp("127.0.0.1"), true);
  assert.equal(isPrivateIp("192.168.1.2"), true);
  assert.equal(isPrivateIp("8.8.8.8"), false);
  await assert.rejects(
    assertPublicUrl("http://internal.example/jobs", async () => [{ address: "10.0.0.4" }]),
    /私有网络/,
  );
});

test("HTML extraction removes scripts and preserves readable page content", () => {
  const result = extractReadableText(`
    <html><head><title>校园招聘</title><style>.x{}</style></head>
    <body><script>steal()</script><main><h1>2026 校园招聘</h1><p>接受应届毕业生，工作地点天津。</p></main></body></html>
  `);
  assert.equal(result.title, "校园招聘");
  assert.match(result.text, /接受应届毕业生/);
  assert.doesNotMatch(result.text, /steal/);
});

test("source verification records page body evidence", async () => {
  const verified = await fetchSourceBody(
    { url: "https://jobs.example.com/campus" },
    {
      lookupImpl: async () => [{ address: "93.184.216.34" }],
      fetchImpl: async () => new Response(
        "<html><title>招聘正文</title><body><h1>校园招聘</h1><p>面向2026届毕业生开放职能岗位，工作地点为天津市。岗位包括人力资源助理、供应链助理和行政支持，招聘页面要求申请人提交完整简历并参加统一面试。</p></body></html>",
        { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
      ),
    },
  );
  assert.equal(verified.verificationStatus, "body_verified");
  assert.match(verified.bodyExcerpt, /2026届毕业生/);
});

test("Tavily extracted page content remains usable when direct fetch fails", async () => {
  const [verified] = await verifyEvidenceSources([{
    url: "https://example.com/jobs/graduate",
    providerRawContent: "2026 届毕业生招聘，工作地点天津，提供入职培训与导师带教。".repeat(5),
  }], {
    limit: 1,
    fetchOptions: {
      lookupImpl: async () => [{ address: "93.184.216.34", family: 4 }],
      fetchImpl: async () => new Response("blocked", { status: 403 }),
    },
  });
  assert.equal(verified.verificationStatus, "provider_verified");
  assert.match(verified.bodyExcerpt, /2026 届毕业生招聘/);
  assert.match(verified.fetchError, /HTTP 403/);
});
