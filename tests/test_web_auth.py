import tempfile
import unittest
import re
from pathlib import Path

from fastapi.testclient import TestClient

from app import create_app
from job_compass.mysql_store import mysql_config_from_env


class WebAuthenticationTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        data_file = Path(self.temporary_directory.name) / "forum.json"
        self.client = TestClient(create_app(data_file=data_file, testing=True))

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

    def test_primary_pages_are_server_rendered_without_scripts(self):
        for path in ("/", "/foreign", "/forum", "/privacy"):
            with self.subTest(path=path):
                page = self.client.get(path)
                self.assertEqual(page.status_code, 200)
                self.assertNotIn("<script", page.text.lower())

    def test_generate_explains_missing_api_configuration(self):
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

    def test_admin_can_approve_a_pending_post(self):
        self.register("刘同学")
        self.client.post(
            "/forum/posts",
            data={"topic": "求职交流", "title": "等待审核的帖子", "body": "这是用于验证审核流程的正文内容。"},
        )
        admin_login = self.client.post(
            "/admin/login", data={"password": "wang1122lu87", "next": "/forum"}, follow_redirects=True,
        )
        self.assertEqual(admin_login.status_code, 200)
        match = re.search(r'name="target_id" value="([^"]+)"', admin_login.text)
        self.assertIsNotNone(match)

        approved = self.client.post(
            "/forum/moderate",
            data={"target_type": "post", "target_id": match.group(1), "status": "approved", "reason": "内容合规"},
            follow_redirects=True,
        )

        self.assertEqual(approved.status_code, 200)
        self.assertIn("已公开", approved.text)

    def test_mysql_url_is_parsed_for_python_storage_adapter(self):
        config = mysql_config_from_env({"MYSQL_URL": "mysql://demo:p%40ss@db.example:3307/job_compass"})

        self.assertEqual(config["host"], "db.example")
        self.assertEqual(config["port"], 3307)
        self.assertEqual(config["user"], "demo")
        self.assertEqual(config["password"], "p@ss")
        self.assertEqual(config["database"], "job_compass")


if __name__ == "__main__":
    unittest.main()
