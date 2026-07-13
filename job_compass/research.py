import asyncio
import io
import os
from dataclasses import dataclass

import httpx
from docx import Document
from pypdf import PdfReader


SUPPORTED_MODELS = {"deepseek-v4-flash", "deepseek-v4-pro"}


@dataclass
class ResearchResult:
    content: str
    sources: list[dict]
    error: str = ""


def load_local_env(path) -> None:
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except FileNotFoundError:
        return
    for raw_line in lines:
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


class ResearchService:
    def __init__(self):
        self.deepseek_key = os.getenv("DEEPSEEK_API_KEY", "")
        self.tavily_key = os.getenv("TAVILY_API_KEY", "")
        self.brave_key = os.getenv("BRAVE_SEARCH_API_KEY", "")
        self.search_provider = os.getenv("SEARCH_PROVIDER", "tavily").lower()

    @property
    def configured(self) -> bool:
        search_key = self.brave_key if self.search_provider == "brave" else self.tavily_key
        return bool(self.deepseek_key and search_key)

    async def _deepseek(self, system: str, user: str, model: str) -> str:
        selected_model = model if model in SUPPORTED_MODELS else "deepseek-v4-flash"
        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post(
                "https://api.deepseek.com/chat/completions",
                headers={"Authorization": f"Bearer {self.deepseek_key}"},
                json={
                    "model": selected_model,
                    "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
                    "temperature": 0.2,
                },
            )
            response.raise_for_status()
            return response.json()["choices"][0]["message"]["content"].strip()

    async def _search_tavily(self, query: str) -> list[dict]:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                "https://api.tavily.com/search",
                json={
                    "api_key": self.tavily_key,
                    "query": query,
                    "search_depth": "advanced",
                    "max_results": 8,
                    "include_raw_content": True,
                },
            )
            response.raise_for_status()
            return response.json().get("results", [])

    async def _search_brave(self, query: str) -> list[dict]:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.get(
                "https://api.search.brave.com/res/v1/web/search",
                headers={"X-Subscription-Token": self.brave_key, "Accept": "application/json"},
                params={"q": query, "count": 8},
            )
            response.raise_for_status()
            values = response.json().get("web", {}).get("results", [])
            return [{"title": item.get("title"), "url": item.get("url"), "content": item.get("description", "")} for item in values]

    async def search(self, query: str) -> list[dict]:
        return await (self._search_brave(query) if self.search_provider == "brave" else self._search_tavily(query))

    @staticmethod
    def _deduplicate(groups: list[list[dict]]) -> list[dict]:
        unique = {}
        for group in groups:
            for source in group:
                url = str(source.get("url", "")).strip()
                if not url or url in unique:
                    continue
                unique[url] = {
                    "title": str(source.get("title") or url)[:200],
                    "url": url,
                    "content": str(source.get("raw_content") or source.get("content") or "")[:6000],
                }
        return list(unique.values())[:36]

    async def research_companies(self, profile: dict) -> ResearchResult:
        if not self.configured:
            return ResearchResult("", [], "尚未配置 DeepSeek 与搜索服务密钥，请先在 .env 中填写后再生成。")
        city = profile.get("city", "")
        roles = profile.get("roles", "") or "应届生岗位"
        queries = [
            f"{city} {roles} 校园招聘 应届生 2026",
            f"{city} 企业官网 招聘 {roles}",
            f"{city} {roles} 招聘 薪资 工作地点",
            f"{city} 企业 劳动争议 经营风险 招聘",
        ]
        try:
            groups = await asyncio.gather(*(self.search(query) for query in queries))
            sources = self._deduplicate(groups)
            if not sources:
                return ResearchResult("", [], "本次搜索没有获得可核验来源，请调整条件后重试。")
            packet = "\n\n".join(
                f"[{index}] {source['title']}\n网址：{source['url']}\n正文或摘要：{source['content']}"
                for index, source in enumerate(sources, 1)
            )
            prompt = f"""请根据下列条件形成企业与岗位核验清单：
城市：{city}
身份：{profile.get('identity', '')}
年龄：{profile.get('age', '')}
岗位偏好：{roles}
目标数量：{profile.get('count', 10)}
筛选模式（可复选）：{', '.join(profile.get('modes', ['balanced']))}
补充条件：{profile.get('notes', '')}

公开来源：
{packet}
"""
            content = await self._deepseek(
                "你是严谨的应届生求职研究员。只能使用给定来源，不得补写公司或岗位事实。每项结论标注来源编号；未知信息明确写待确认。用中文输出清晰的表格和复核建议。",
                prompt,
                profile.get("model", "deepseek-v4-flash"),
            )
            return ResearchResult(content, sources)
        except (httpx.HTTPError, KeyError, ValueError) as error:
            return ResearchResult("", [], f"联网核验失败：{error}")

    async def analyze_resume(self, resume_text: str, profile: dict) -> ResearchResult:
        if not self.deepseek_key:
            return ResearchResult("", [], "尚未配置 DeepSeek API Key，无法分析简历。")
        try:
            content = await self._deepseek(
                "你是求职匹配顾问。只根据简历原文提取可证明的能力，不根据姓名、性别等敏感信息推断。指出证据、缺口和适合的岗位方向。",
                f"目标城市：{profile.get('city', '')}\n英语能力：{profile.get('english', '')}\n偏好岗位：{profile.get('roles', '')}\n\n简历原文：\n{resume_text[:30000]}",
                profile.get("model", "deepseek-v4-flash"),
            )
            return ResearchResult(content, [])
        except (httpx.HTTPError, KeyError, ValueError) as error:
            return ResearchResult("", [], f"简历分析失败：{error}")


def extract_resume(filename: str, content: bytes) -> str:
    suffix = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    if suffix == "pdf":
        reader = PdfReader(io.BytesIO(content))
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    if suffix == "docx":
        document = Document(io.BytesIO(content))
        return "\n".join(paragraph.text for paragraph in document.paragraphs)
    if suffix in {"txt", "md"}:
        return content.decode("utf-8", errors="replace")
    raise ValueError("仅支持 PDF、DOCX、TXT 和 MD 简历。")
