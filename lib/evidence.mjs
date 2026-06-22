import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

const blockedHostnames = new Set(["localhost", "localhost.localdomain"]);

export function isPrivateIp(address) {
  const value = String(address || "").toLowerCase();
  if (!value) return true;
  if (value === "::1" || value === "::" || value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe8") || value.startsWith("fe9") || value.startsWith("fea") || value.startsWith("feb")) {
    return true;
  }
  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  const ipv4 = mapped || (isIP(value) === 4 ? value : "");
  if (!ipv4) return false;
  const parts = ipv4.split(".").map(Number);
  return parts[0] === 10
    || parts[0] === 127
    || parts[0] === 0
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168)
    || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127)
    || parts[0] >= 224;
}

export async function assertPublicUrl(value, lookupImpl = lookup) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("仅允许 HTTP 或 HTTPS 来源");
  if (url.username || url.password) throw new Error("来源地址不得包含登录凭据");
  if (blockedHostnames.has(url.hostname.toLowerCase()) || url.hostname.endsWith(".local")) {
    throw new Error("来源地址不是公网域名");
  }
  if (isIP(url.hostname)) {
    if (isPrivateIp(url.hostname)) throw new Error("来源地址指向私有网络");
    return url;
  }
  const addresses = await lookupImpl(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((item) => isPrivateIp(item.address))) {
    throw new Error("来源域名解析到私有网络");
  }
  return url;
}

function decodeEntities(value) {
  const named = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: "\"",
    apos: "'",
    nbsp: " ",
  };
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === "#") {
      const hexadecimal = entity[1]?.toLowerCase() === "x";
      const code = Number.parseInt(entity.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return named[entity.toLowerCase()] ?? " ";
  });
}

export function extractReadableText(html, maxLength = 6000) {
  const source = String(html || "");
  const title = decodeEntities(source.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "")
    .replace(/\s+/g, " ")
    .trim();
  const text = decodeEntities(
    source
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript|svg|template|iframe)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<(br|p|div|li|tr|h[1-6]|section|article|main|header|footer)\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim()
    .slice(0, maxLength);
  return { title, text };
}

async function readLimitedBody(response, maxBytes) {
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > maxBytes) throw new Error("网页正文超过抓取上限");
  const reader = response.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("网页正文超过抓取上限");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
}

function decodeBody(bytes, contentType) {
  const headerCharset = contentType.match(/charset\s*=\s*["']?([^;"'\s]+)/i)?.[1];
  const prefix = bytes.subarray(0, 4096).toString("latin1");
  const metaCharset = prefix.match(/<meta[^>]+charset\s*=\s*["']?([^"'\s/>]+)/i)?.[1]
    || prefix.match(/<meta[^>]+content=["'][^"']*charset=([^"'\s;]+)/i)?.[1];
  let charset = String(headerCharset || metaCharset || "utf-8").toLowerCase();
  if (["gbk", "gb2312", "x-gbk"].includes(charset)) charset = "gb18030";
  try {
    return new TextDecoder(charset, { fatal: false }).decode(bytes);
  } catch {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }
}

export async function fetchSourceBody(source, {
  fetchImpl = fetch,
  lookupImpl = lookup,
  timeoutMs = 12_000,
  maxBytes = 700_000,
  maxRedirects = 3,
} = {}) {
  let currentUrl = await assertPublicUrl(source.url, lookupImpl);
  for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
    const response = await fetchImpl(currentUrl, {
      redirect: "manual",
      headers: {
        "User-Agent": "JobCompassEvidenceVerifier/1.0 (+source verification)",
        Accept: "text/html,application/xhtml+xml,text/plain,application/json;q=0.8",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirect === maxRedirects) throw new Error("来源重定向次数过多");
      currentUrl = await assertPublicUrl(new URL(location, currentUrl).href, lookupImpl);
      continue;
    }
    if (!response.ok) throw new Error(`网页返回 HTTP ${response.status}`);
    const contentType = response.headers.get("content-type") || "";
    if (!/(?:text\/html|application\/xhtml\+xml|text\/plain|application\/json)/i.test(contentType)) {
      throw new Error(`不支持核验该正文类型：${contentType || "未知"}`);
    }
    const raw = decodeBody(await readLimitedBody(response, maxBytes), contentType);
    const readable = /html|xhtml/i.test(contentType)
      ? extractReadableText(raw)
      : { title: "", text: raw.replace(/\s+/g, " ").trim().slice(0, 6000) };
    if (readable.text.length < 80) throw new Error("网页正文可读取内容不足");
    return {
      verificationStatus: "body_verified",
      finalUrl: currentUrl.href,
      httpStatus: response.status,
      contentType,
      fetchedAt: new Date().toISOString(),
      pageTitle: readable.title,
      bodyExcerpt: readable.text,
      fetchError: "",
    };
  }
  throw new Error("来源抓取失败");
}

export async function verifyEvidenceSources(sources, {
  limit = 24,
  concurrency = 4,
  fetchOptions,
} = {}) {
  const output = sources.map((source, index) => {
    const providerText = String(source.providerRawContent || "").trim().slice(0, 6000);
    const providerVerified = index < limit && providerText.length >= 80;
    return {
      ...source,
      verificationStatus: providerVerified ? "provider_verified" : "not_fetched",
      bodyExcerpt: providerVerified ? providerText : "",
      fetchError: "",
    };
  });
  let cursor = 0;
  async function worker() {
    while (cursor < Math.min(limit, output.length)) {
      const index = cursor;
      cursor += 1;
      try {
        Object.assign(output[index], await fetchSourceBody(output[index], fetchOptions));
      } catch (error) {
        if (output[index].verificationStatus !== "provider_verified") {
          output[index].verificationStatus = "fetch_failed";
        }
        output[index].fetchError = String(error?.message || error).slice(0, 240);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  return output;
}
