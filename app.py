import os
import logging
from pathlib import Path
from urllib.parse import quote
from uuid import UUID, uuid4

from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.responses import HTMLResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from job_compass.forum_store import ForumStore
from job_compass.analytics_store import JsonAnalyticsStore, MySqlAnalyticsStore, chart_points
from job_compass.mysql_store import MySqlForumStore, mysql_config_from_env
from job_compass.result_renderer import render_result_content, result_tables_to_csv
from job_compass.research import ResearchService, extract_resume, load_local_env
from job_compass.security import hash_password, read_session, sign_session, verify_password


ROOT = Path(__file__).resolve().parent
load_local_env(ROOT / ".env")
SESSION_COOKIE = "job_compass_user"
ADMIN_COOKIE = "job_compass_admin"
VISITOR_COOKIE = "job_compass_visitor"
FALLBACK_ADMIN_HASH = "pbkdf2$sha256$310000$mOpDpuPhjMo9u1u7k1bIoQ$lzpjb0VN6jMQ6ZPmNSF7eVML4moaJ3U9jLqBDw6dWlI"
ROLES = {
    "candidate": "求职者",
    "employee": "已就业者",
    "boss": "老板 / HR",
    "observer": "旁观交流者",
}
logger = logging.getLogger(__name__)


def create_app(data_file: Path | None = None, testing: bool = False) -> FastAPI:
    app = FastAPI(title="职路 - 应届生求职信息助手")
    app.state.testing = testing
    app.state.session_secret = os.getenv("FORUM_SESSION_SECRET", "job-compass-local-demo-secret")
    mysql_config = None if data_file else mysql_config_from_env()
    app.state.store = MySqlForumStore(
        mysql_config, ROOT / "mysql_schema.sql", os.getenv("FORUM_PHONE_HASH_SECRET", ""),
    ) if mysql_config else ForumStore(
        data_file or Path(os.getenv("FORUM_DATA_FILE", ROOT / "data" / "forum.json")),
        os.getenv("FORUM_PHONE_HASH_SECRET", ""),
    )
    app.state.storage_backend = "mysql" if mysql_config else "json"
    analytics_file = (data_file.with_name("analytics.json") if data_file else Path(os.getenv("ANALYTICS_DATA_FILE", ROOT / "data" / "analytics.json")))
    app.state.analytics = MySqlAnalyticsStore(mysql_config) if mysql_config else JsonAnalyticsStore(analytics_file)
    app.state.research = ResearchService()
    app.state.result_exports = {}
    app.mount("/static", StaticFiles(directory=ROOT / "public"), name="static")
    templates = Jinja2Templates(directory=ROOT / "templates")
    tracked_pages = {"/", "/foreign", "/foreign.html", "/forum", "/forum.html", "/privacy", "/privacy.html"}

    @app.middleware("http")
    async def record_public_page_view(request: Request, call_next):
        response = await call_next(request)
        if request.method == "GET" and request.url.path in tracked_pages and response.status_code < 400:
            visitor_id = request.cookies.get(VISITOR_COOKIE, "")
            try:
                visitor_id = str(UUID(visitor_id))
                new_visitor = False
            except ValueError:
                visitor_id = str(uuid4())
                new_visitor = True
            try:
                app.state.analytics.record(visitor_id, request.url.path)
            except Exception:
                logger.exception("Unable to record page view")
            if new_visitor:
                response.set_cookie(VISITOR_COOKIE, visitor_id, max_age=365 * 24 * 3600, httponly=True, samesite="lax", secure=request.url.scheme == "https")
        return response

    def current_user(request: Request) -> dict | None:
        token = request.cookies.get(SESSION_COOKIE, "")
        user_id = read_session(token, app.state.session_secret) if token else None
        return app.state.store.public_user(app.state.store.user_by_id(user_id))

    def admin_mode(request: Request) -> bool:
        token = request.cookies.get(ADMIN_COOKIE, "")
        return read_session(token, app.state.session_secret) == "admin" if token else False

    def context(request: Request, **values) -> dict:
        user = current_user(request)
        return {
            "request": request,
            "current_user": user,
            "admin_mode": admin_mode(request),
            "avatar_initial": (user.get("displayName", "用").strip() or "用")[0] if user else "用",
            "role_label": ROLES.get(user.get("role"), "用户") if user else "",
            "message": request.query_params.get("message", ""),
            "error": request.query_params.get("error", ""),
            **values,
        }

    def result_view_values(result) -> dict:
        rendered_result = render_result_content(result.content) if not result.error else ""
        export_csv = result_tables_to_csv(result.content) if not result.error else ""
        result_export_id = ""
        if export_csv:
            result_export_id = str(uuid4())
            app.state.result_exports[result_export_id] = export_csv
            while len(app.state.result_exports) > 50:
                app.state.result_exports.pop(next(iter(app.state.result_exports)))
        return {"rendered_result": rendered_result, "result_export_id": result_export_id}

    def safe_next(value: str, fallback: str = "/") -> str:
        return value if value.startswith("/") and not value.startswith("//") else fallback

    @app.get("/", response_class=HTMLResponse)
    async def home(request: Request):
        return templates.TemplateResponse(request, "home.html", context(request))

    @app.get("/foreign", response_class=HTMLResponse)
    @app.get("/foreign.html", response_class=HTMLResponse)
    async def foreign(request: Request):
        return templates.TemplateResponse(request, "foreign.html", context(request))

    @app.get("/privacy", response_class=HTMLResponse)
    @app.get("/privacy.html", response_class=HTMLResponse)
    async def privacy(request: Request):
        return templates.TemplateResponse(request, "privacy.html", context(request))

    @app.post("/generate", response_class=HTMLResponse)
    async def generate(
        request: Request,
        city: str = Form(""),
        identity: str = Form(""),
        age: str = Form(""),
        count: int = Form(10),
        modes: list[str] = Form(["balanced"]),
        model: str = Form("deepseek-v4-flash"),
        roles: str = Form(""),
        notes: str = Form(""),
    ):
        allowed_modes = ("strict", "balanced", "emerging")
        selected_modes = [mode for mode in allowed_modes if mode in modes] or ["balanced"]
        profile = {
            "city": city[:80], "identity": identity[:80], "age": age[:10],
            "count": max(1, count), "modes": selected_modes, "model": model,
            "roles": roles[:300], "notes": notes[:1000],
        }
        result = await app.state.research.research_companies(profile)
        return templates.TemplateResponse(request, "result.html", context(
            request, result=result, **result_view_values(result),
            profile=profile, result_title="企业与岗位核验结果", back_url="/",
        ))

    @app.get("/downloads/results/{export_id}.csv")
    async def download_result_table(export_id: str):
        content = app.state.result_exports.get(export_id)
        if not content:
            return Response("Export expired or not found.", status_code=404, media_type="text/plain")
        return Response(
            content,
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": 'attachment; filename="job-compass-result.csv"'},
        )

    @app.post("/foreign/analyze", response_class=HTMLResponse)
    async def foreign_analyze(
        request: Request,
        city: str = Form(""),
        english: str = Form(""),
        roles: str = Form(""),
        model: str = Form("deepseek-v4-flash"),
        resume_text: str = Form(""),
        resume_file: UploadFile | None = File(None),
        privacy_consent: str = Form(""),
    ):
        if privacy_consent != "accepted":
            result = type("Result", (), {"error": "请先阅读并同意隐私政策。", "content": "", "sources": []})()
        else:
            text = resume_text.strip()
            if resume_file and resume_file.filename:
                try:
                    text = (text + "\n" + extract_resume(resume_file.filename, await resume_file.read())).strip()
                except ValueError as error:
                    result = type("Result", (), {"error": str(error), "content": "", "sources": []})()
                else:
                    result = await app.state.research.analyze_resume(text, {"city": city, "english": english, "roles": roles, "model": model})
            else:
                result = await app.state.research.analyze_resume(text, {"city": city, "english": english, "roles": roles, "model": model})
        return templates.TemplateResponse(request, "result.html", context(
            request, result=result, **result_view_values(result),
            profile={}, result_title="简历与岗位方向分析", back_url="/foreign",
        ))

    @app.get("/forum", response_class=HTMLResponse)
    @app.get("/forum.html", response_class=HTMLResponse)
    async def forum(request: Request):
        user = current_user(request)
        is_admin = admin_mode(request)
        filters = {key: request.query_params.get(key, "") for key in ("q", "topic", "role", "status")}
        posts = app.state.store.list_posts(viewer_id=user["id"] if user else "", admin=is_admin, filters=filters)
        summary = app.state.store.summary(viewer_id=user["id"] if user else "", admin=is_admin)
        return templates.TemplateResponse(request, "forum.html", context(
            request, roles=ROLES, posts=posts, summary=summary, filters=filters,
        ))

    @app.get("/admin", response_class=HTMLResponse)
    async def admin_dashboard(request: Request):
        if not admin_mode(request):
            return templates.TemplateResponse(request, "admin_login.html", context(request))
        posts = app.state.store.list_posts(admin=True)
        pending_posts = [post for post in posts if post["status"] == "pending"]
        pending_comments = [comment for post in posts for comment in post.get("comments", []) if comment["status"] == "pending"]
        forum_summary = app.state.store.summary(admin=True)
        analytics = app.state.analytics.summary()
        return templates.TemplateResponse(request, "admin.html", context(
            request,
            pending_posts=pending_posts,
            pending_comments=pending_comments,
            forum_summary=forum_summary,
            analytics=analytics,
            views_points=chart_points(analytics["daily"], "views"),
            visitors_points=chart_points(analytics["daily"], "visitors"),
        ))

    @app.post("/forum/posts")
    async def create_forum_post(
        request: Request,
        topic: str = Form(""),
        title: str = Form(""),
        body: str = Form(""),
    ):
        user = current_user(request)
        if not user:
            return RedirectResponse("/forum?error=" + quote("请先登录后再发帖。"), 303)
        if topic not in {"求职交流", "公司核验", "面试经验", "入职避坑", "薪资福利"}:
            return RedirectResponse("/forum?error=" + quote("请选择有效话题。"), 303)
        clean_title = " ".join(title.split())[:60]
        clean_body = body.strip()[:2000]
        if len(clean_title) < 3 or len(clean_body) < 10:
            return RedirectResponse("/forum?error=" + quote("标题至少 3 个字，正文至少 10 个字。"), 303)
        app.state.store.create_post(user, topic, clean_title, clean_body)
        return RedirectResponse("/forum?message=" + quote("帖子已提交，正在等待管理员审核。"), 303)

    @app.post("/forum/comments")
    async def create_forum_comment(request: Request, post_id: str = Form(""), body: str = Form("")):
        user = current_user(request)
        if not user:
            return RedirectResponse("/forum?error=" + quote("请先登录后再评论。"), 303)
        clean_body = body.strip()[:1000]
        try:
            if len(clean_body) < 2:
                raise ValueError("评论至少 2 个字。")
            app.state.store.create_comment(user, post_id, clean_body)
        except ValueError as error:
            return RedirectResponse("/forum?error=" + quote(str(error)), 303)
        return RedirectResponse("/forum?message=" + quote("评论已提交审核。"), 303)

    @app.post("/forum/reports")
    async def create_forum_report(
        request: Request, target_type: str = Form(""), target_id: str = Form(""), reason: str = Form(""),
    ):
        user = current_user(request)
        if not user:
            return RedirectResponse("/forum?error=" + quote("请先登录后再举报。"), 303)
        try:
            app.state.store.create_report(user, target_type, target_id, reason.strip()[:200] or "内容可能违反论坛规则")
        except ValueError as error:
            return RedirectResponse("/forum?error=" + quote(str(error)), 303)
        return RedirectResponse("/forum?message=" + quote("举报已提交。"), 303)

    @app.post("/admin/login")
    async def admin_login(request: Request, password: str = Form(""), next: str = Form("/admin")):
        destination = safe_next(next, "/admin")
        configured_hash = os.getenv("ADMIN_PASSWORD_HASH", "")
        configured_plain = os.getenv("ADMIN_PASSWORD", "")
        if configured_hash:
            valid = verify_password(password, configured_hash)
        elif configured_plain:
            valid = password == configured_plain
        else:
            valid = verify_password(password, FALLBACK_ADMIN_HASH)
        if not valid:
            return RedirectResponse(f"{destination}?error={quote('管理员密码错误。')}", 303)
        response = RedirectResponse(f"{destination}?message={quote('已进入管理员审核模式。')}", 303)
        response.set_cookie(ADMIN_COOKIE, sign_session("admin", app.state.session_secret, 12 * 3600), max_age=12 * 3600, httponly=True, samesite="lax", secure=request.url.scheme == "https")
        return response

    @app.post("/admin/logout")
    async def admin_logout(next: str = Form("/admin")):
        response = RedirectResponse(safe_next(next, "/admin"), 303)
        response.delete_cookie(ADMIN_COOKIE)
        return response

    @app.post("/forum/moderate")
    async def moderate_forum(
        request: Request, target_type: str = Form(""), target_id: str = Form(""),
        status: str = Form(""), reason: str = Form(""), next: str = Form("/admin"),
    ):
        if not admin_mode(request):
            return RedirectResponse("/forum?error=" + quote("需要管理员权限。"), 303)
        try:
            app.state.store.moderate(target_type, target_id, status, reason.strip())
        except ValueError as error:
            return RedirectResponse("/forum?error=" + quote(str(error)), 303)
        destination = safe_next(next, "/admin")
        return RedirectResponse(destination + "?message=" + quote("审核状态已更新。"), 303)

    @app.post("/auth/register")
    async def register(
        request: Request,
        phone: str = Form(""),
        password: str = Form(""),
        display_name: str = Form(""),
        role: str = Form("candidate"),
        next: str = Form("/"),
    ):
        destination = safe_next(next)
        name = " ".join(display_name.split())[:20]
        if len(password) < 6 or not name or role not in ROLES:
            return RedirectResponse(f"{destination}?error={quote('请填写昵称并使用至少 6 位密码。')}", 303)
        try:
            user = app.state.store.create_user(phone, hash_password(password), name, role)
        except ValueError as error:
            return RedirectResponse(f"{destination}?error={quote(str(error))}", 303)
        response = RedirectResponse(f"{destination}?message={quote('注册并登录成功。')}", 303)
        response.set_cookie(
            SESSION_COOKIE,
            sign_session(user["id"], app.state.session_secret),
            max_age=30 * 24 * 3600,
            httponly=True,
            samesite="lax",
            secure=request.url.scheme == "https",
        )
        return response

    @app.post("/auth/login")
    async def login(request: Request, phone: str = Form(""), password: str = Form(""), next: str = Form("/")):
        destination = safe_next(next)
        user = app.state.store.user_by_phone(phone)
        if not user or user.get("disabled") or not verify_password(password, user.get("passwordHash", "")):
            return RedirectResponse(f"{destination}?error={quote('手机号或密码错误。')}", 303)
        response = RedirectResponse(f"{destination}?message={quote('登录成功。')}", 303)
        response.set_cookie(
            SESSION_COOKIE,
            sign_session(user["id"], app.state.session_secret),
            max_age=30 * 24 * 3600,
            httponly=True,
            samesite="lax",
            secure=request.url.scheme == "https",
        )
        return response

    @app.post("/auth/logout")
    async def logout(next: str = Form("/")):
        response = RedirectResponse(safe_next(next), 303)
        response.delete_cookie(SESSION_COOKIE)
        return response

    @app.get("/health")
    async def health():
        return {"ok": True, "runtime": "python", "framework": "FastAPI", "storage": app.state.storage_backend}

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host=os.getenv("HOST", "127.0.0.1"), port=int(os.getenv("PORT", "4173")), reload=False)
