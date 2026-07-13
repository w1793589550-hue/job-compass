import tempfile
import unittest
import re
from types import SimpleNamespace
from pathlib import Path

from fastapi.testclient import TestClient

from app import create_app
from job_compass.mysql_store import mysql_config_from_env


class WebAuthenticationTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        data_file = Path(self.temporary_directory.name) / "forum.json"
        self.app = create_app(data_file=data_file, testing=True)
        self.client = TestClient(self.app)

    def tearDown(self):
        self.client.close()
        self.temporary_directory.cleanup()

    def register(self, display_name="刘同学"):
        response = self.client.post(
            "/auth/register",
            data={
                "phone": "13800138000",
                "password": "answer123",
                "display_name": display_name,
                "role": "candidate",
                "next": "/",
            },
            follow_redirects=False,
        )
        self.assertEqual(response.status_code, 303)

    def test_logged_in_header_uses_first_character_avatar(self):
        self.register("刘同学")

        page = self.client.get("/")

        self.assertEqual(page.status_code, 200)
        self.assertIn('class="user-avatar"', page.text)
        self.assertIn(">刘</span>", page.text)
        self.assertIn("刘同学", page.text)
        self.assertNotIn(">用户登录</strong>", page.text)

    def test_forum_reuses_site_session_and_hides_auth_buttons(self):
        self.register("刘同学")

        page = self.client.get("/forum")

        self.assertEqual(page.status_code, 200)
        self.assertIn("当前账号", page.text)
        self.assertIn("刘同学", page.text)
        self.assertNotIn('name="auth_action"', page.text)
        self.assertNotIn(">注册</button>", page.text)

    def test_logged_in_user_can_submit_and_see_pending_post(self):
        self.register("刘同学")

        response = self.client.post(
            "/forum/posts",
            data={"topic": "求职交流", "title": "天津校招信息", "body": "这是一条等待管理员审核的求职信息。"},
            follow_redirects=True,
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn("天津校招信息", response.text)
        self.assertIn("待审核", response.text)

    def test_primary_pages_include_browser_analytics_script(self):
        for path in ("/", "/foreign", "/forum", "/privacy", "/admin"):
            with self.subTest(path=path):
                page = self.client.get(path)
                self.assertEqual(page.status_code, 200)
                if path == "/admin":
                    self.assertNotIn("/analytics/page-view", page.text)
                else:
                    self.assertIn("/analytics/page-view", page.text)

    def test_home_page_has_portal_workbench_sections(self):
        page = self.client.get("/")

        self.assertEqual(page.status_code, 200)
        for expected in (
            "求职门户工作台",
            "我的待办任务",
            "画像信息",
            "求职日程安排",
            "常用资料下载",
            "企业核验",
        ):
            self.assertIn(expected, page.text)

    def record_browser_view(self, visitor_id, path):
        return self.client.post(
            "/analytics/page-view",
            json={"visitorId": visitor_id, "path": path},
            headers={"user-agent": "Mozilla/5.0 Chrome/126.0"},
        )

    def test_admin_analytics_use_browser_reported_page_views(self):
        self.client.get("/")
        empty = self.app.state.analytics.summary()
        self.assertEqual(empty["totals"]["views"], 0)
        self.assertEqual(empty["totals"]["visitors"], 0)

        self.assertEqual(self.record_browser_view("browser-user-0001", "/").json(), {"ok": True})
        self.assertEqual(self.record_browser_view("browser-user-0001", "/forum").json(), {"ok": True})
        self.assertEqual(self.record_browser_view("browser-user-0002", "/foreign").json(), {"ok": True})
        rejected = self.client.post(
            "/analytics/page-view",
            json={"visitorId": "script-client", "path": "/admin"},
            headers={"user-agent": "python-httpx"},
        )
        self.assertEqual(rejected.json(), {"ok": False})

        summary = self.app.state.analytics.summary()
        self.assertEqual(summary["totals"]["todayViews"], 3)
        self.assertEqual(summary["totals"]["todayVisitors"], 2)

    def test_generate_explains_missing_api_configuration(self):
        class MissingResearch:
            async def research_companies(inner_self, profile):
                return SimpleNamespace(content="", sources=[], error="尚未配置 DeepSeek 与搜索服务密钥。")

        self.app.state.research = MissingResearch()
        response = self.client.post(
            "/generate",
            data={
                "city": "天津市",
                "identity": "应届毕业生",
                "age": "22",
                "count": "10",
                "mode": "balanced",
                "model": "deepseek-v4-flash",
                "roles": "行政、人力",
                "notes": "",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn("尚未配置", response.text)

    def test_generate_renders_tables_and_downloads_csv_export(self):
        class TableResearch:
            async def research_companies(inner_self, profile):
                content = "\n".join([
                    "### Target 1",
                    "",
                    "| Item | Value | Source |",
                    "| :--- | :--- | :--- |",
                    "| **Company** | Acme Ltd | [1] |",
                    "| **Role** | AI Intern | [1] |",
                ])
                return SimpleNamespace(content=content, sources=[], error="")

        self.app.state.research = TableResearch()
        response = self.client.post(
            "/generate",
            data={
                "city": "Tianjin", "identity": "Graduate", "age": "22", "count": "5",
                "modes": ["balanced"], "model": "deepseek-v4-flash", "roles": "AI", "notes": "",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn('<table class="server-result-table">', response.text)
        self.assertIn("<th>Item</th>", response.text)
        self.assertNotIn("| Item | Value | Source |", response.text)
        match = re.search(r'href="(/downloads/results/[^"]+\.csv)"', response.text)
        self.assertIsNotNone(match)

        export = self.client.get(match.group(1))

        self.assertEqual(export.status_code, 200)
        self.assertEqual(export.headers["content-type"], "text/csv; charset=utf-8")
        self.assertIn("attachment", export.headers["content-disposition"])
        self.assertIn("Company,Acme Ltd,[1]", export.text)

    def test_filter_modes_are_multi_select_and_company_count_has_no_upper_limit(self):
        page = self.client.get("/")
        self.assertEqual(page.text.count('name="modes"'), 3)
        self.assertNotIn('name="count" type="number" min="1" max=', page.text)

        class CapturingResearch:
            async def research_companies(inner_self, profile):
                selected = ",".join(profile["modes"])
                return SimpleNamespace(content=f"数量={profile['count']}；模式={selected}", sources=[], error="")

        self.app.state.research = CapturingResearch()
        response = self.client.post(
            "/generate",
            data={
                "city": "天津市", "identity": "应届毕业生", "age": "22", "count": "250",
                "modes": ["strict", "emerging"], "model": "deepseek-v4-flash", "roles": "行政", "notes": "",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn("数量=250；模式=strict,emerging", response.text)

    def test_admin_can_approve_a_pending_post(self):
        self.register("刘同学")
        self.client.post(
            "/forum/posts",
            data={"topic": "求职交流", "title": "等待审核的帖子", "body": "这是用于验证审核流程的正文内容。"},
        )
        admin_login = self.client.post(
            "/admin/login", data={"password": "wang1122lu87", "next": "/admin"}, follow_redirects=True,
        )
        self.assertEqual(admin_login.status_code, 200)
        match = re.search(r'name="target_id" value="([^"]+)"', admin_login.text)
        self.assertIsNotNone(match)

        approved = self.client.post(
            "/forum/moderate",
            data={"target_type": "post", "target_id": match.group(1), "status": "approved", "reason": "内容合规", "next": "/admin"},
            follow_redirects=True,
        )

        self.assertEqual(approved.status_code, 200)
        self.assertIn("审核状态已更新", approved.text)
        self.assertIn("暂无待审核帖子", approved.text)

    def test_admin_dashboard_shows_review_queue_and_visit_analytics(self):
        login_page = self.client.get("/admin")
        self.assertEqual(login_page.status_code, 200)
        self.assertIn("管理员后台登录", login_page.text)

        self.record_browser_view("browser-user-0001", "/")
        self.record_browser_view("browser-user-0001", "/")
        self.record_browser_view("browser-user-0002", "/foreign")

        self.register("刘同学")
        self.client.post(
            "/forum/posts",
            data={"topic": "求职交流", "title": "后台待审核帖子", "body": "这条内容应当出现在独立管理后台。"},
        )
        dashboard = self.client.post(
            "/admin/login", data={"password": "wang1122lu87"}, follow_redirects=True,
        )

        self.assertEqual(dashboard.status_code, 200)
        self.assertIn("管理后台", dashboard.text)
        self.assertIn('data-metric="today-visitors">2', dashboard.text)
        self.assertIn('data-metric="today-views">3', dashboard.text)
        self.assertIn("后台待审核帖子", dashboard.text)
        self.assertIn("<svg", dashboard.text)

    def test_mysql_url_is_parsed_for_python_storage_adapter(self):
        config = mysql_config_from_env({"MYSQL_URL": "mysql://demo:p%40ss@db.example:3307/job_compass"})

        self.assertEqual(config["host"], "db.example")
        self.assertEqual(config["port"], 3307)
        self.assertEqual(config["user"], "demo")
        self.assertEqual(config["password"], "p@ss")
        self.assertEqual(config["database"], "job_compass")


if __name__ == "__main__":
    unittest.main()
