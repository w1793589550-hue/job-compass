import os
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote, urlparse
from uuid import uuid4

import pymysql

from .forum_store import mask_phone, normalize_phone
from hashlib import sha256


def mysql_config_from_env(env: dict | None = None) -> dict | None:
    values = env or os.environ
    url = values.get("MYSQL_URL") or values.get("DATABASE_URL")
    if url:
        parsed = urlparse(url)
        if parsed.scheme not in {"mysql", "mysql+pymysql"} or not parsed.hostname:
            raise ValueError("MYSQL_URL 必须是有效的 mysql:// 地址。")
        return {
            "host": parsed.hostname,
            "port": parsed.port or 3306,
            "user": unquote(parsed.username or ""),
            "password": unquote(parsed.password or ""),
            "database": unquote(parsed.path.lstrip("/")),
        }
    if values.get("MYSQL_HOST") and values.get("MYSQL_USER") and values.get("MYSQL_DATABASE"):
        return {
            "host": values["MYSQL_HOST"],
            "port": int(values.get("MYSQL_PORT", "3306")),
            "user": values["MYSQL_USER"],
            "password": values.get("MYSQL_PASSWORD", ""),
            "database": values["MYSQL_DATABASE"],
        }
    return None


def _iso(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


class MySqlForumStore:
    def __init__(self, config: dict, schema_path: Path, phone_hash_secret: str = ""):
        self.config = {**config, "charset": "utf8mb4", "cursorclass": pymysql.cursors.DictCursor, "autocommit": True}
        self.phone_hash_secret = phone_hash_secret
        self._ensure_schema(schema_path)

    def _connect(self):
        return pymysql.connect(**self.config)

    def _ensure_schema(self, schema_path: Path) -> None:
        statements = [part.strip() for part in schema_path.read_text(encoding="utf-8").split(";") if part.strip()]
        with self._connect() as connection, connection.cursor() as cursor:
            for statement in statements:
                cursor.execute(statement)

    def _phone_hash(self, phone: str) -> str:
        return sha256(f"{self.phone_hash_secret}:{phone}".encode()).hexdigest()

    @staticmethod
    def _user(row: dict | None) -> dict | None:
        if not row:
            return None
        return {
            "id": row["id"], "phoneHash": row["phone_hash"], "phoneMasked": row["phone_masked"],
            "passwordHash": row["password_hash"], "displayName": row["display_name"], "role": row["role"],
            "createdAt": _iso(row["created_at"]), "disabled": bool(row["disabled"]),
        }

    @staticmethod
    def public_user(user: dict | None) -> dict | None:
        if not user:
            return None
        return {key: user[key] for key in ("id", "displayName", "role", "phoneMasked", "createdAt")}

    @staticmethod
    def _author(row: dict, prefix: str = "author") -> dict:
        return {
            "id": row[f"{prefix}_id"], "displayName": row[f"{prefix}_display_name"],
            "role": row[f"{prefix}_role"], "phoneMasked": row[f"{prefix}_phone_masked"],
        }

    def create_user(self, phone: str, password_hash: str, display_name: str, role: str) -> dict:
        normalized = normalize_phone(phone)
        if not normalized:
            raise ValueError("请输入有效的 11 位手机号。")
        user = {
            "id": str(uuid4()), "phoneHash": self._phone_hash(normalized), "phoneMasked": mask_phone(normalized),
            "passwordHash": password_hash, "displayName": display_name, "role": role,
            "createdAt": _iso(datetime.now(timezone.utc)), "disabled": False,
        }
        try:
            with self._connect() as connection, connection.cursor() as cursor:
                cursor.execute(
                    "INSERT INTO forum_users (id, phone_hash, phone_masked, password_hash, display_name, role, disabled, created_at) VALUES (%s,%s,%s,%s,%s,%s,FALSE,%s)",
                    (user["id"], user["phoneHash"], user["phoneMasked"], password_hash, display_name, role, datetime.now(timezone.utc)),
                )
        except pymysql.err.IntegrityError as error:
            if error.args and error.args[0] == 1062:
                raise ValueError("该手机号已经注册，请直接登录。") from error
            raise
        return self.public_user(user)

    def user_by_phone(self, phone: str) -> dict | None:
        normalized = normalize_phone(phone)
        if not normalized:
            return None
        with self._connect() as connection, connection.cursor() as cursor:
            cursor.execute("SELECT * FROM forum_users WHERE phone_hash=%s LIMIT 1", (self._phone_hash(normalized),))
            return self._user(cursor.fetchone())

    def user_by_id(self, user_id: str | None) -> dict | None:
        with self._connect() as connection, connection.cursor() as cursor:
            cursor.execute("SELECT * FROM forum_users WHERE id=%s AND disabled=FALSE LIMIT 1", (str(user_id or ""),))
            return self._user(cursor.fetchone())

    def create_post(self, user: dict, topic: str, title: str, body: str) -> dict:
        post_id = str(uuid4())
        now = datetime.now(timezone.utc)
        with self._connect() as connection, connection.cursor() as cursor:
            cursor.execute(
                "INSERT INTO forum_posts (id,author_id,topic,title,body,status,created_at,updated_at) VALUES (%s,%s,%s,%s,%s,'pending',%s,%s)",
                (post_id, user["id"], topic, title, body, now, now),
            )
        return {"id": post_id, "title": title, "body": body, "topic": topic, "status": "pending", "author": user, "createdAt": _iso(now), "updatedAt": _iso(now), "moderation": None}

    def _post(self, row: dict) -> dict:
        return {
            "id": row["id"], "title": row["title"], "body": row["body"], "topic": row["topic"],
            "status": row["status"], "author": self._author(row), "createdAt": _iso(row["created_at"]),
            "updatedAt": _iso(row["updated_at"]), "moderation": None, "comments": [],
        }

    def _comment(self, row: dict) -> dict:
        return {
            "id": row["id"], "postId": row["post_id"], "body": row["body"], "status": row["status"],
            "author": self._author(row), "createdAt": _iso(row["created_at"]), "updatedAt": _iso(row["updated_at"]),
            "moderation": None,
        }

    def list_posts(self, viewer_id: str = "", admin: bool = False, filters: dict | None = None) -> list[dict]:
        filters = filters or {}
        with self._connect() as connection, connection.cursor() as cursor:
            cursor.execute("""SELECT p.*,u.id author_id,u.display_name author_display_name,u.role author_role,u.phone_masked author_phone_masked FROM forum_posts p JOIN forum_users u ON u.id=p.author_id ORDER BY p.created_at DESC""")
            posts = [self._post(row) for row in cursor.fetchall()]
            cursor.execute("""SELECT c.*,u.id author_id,u.display_name author_display_name,u.role author_role,u.phone_masked author_phone_masked FROM forum_comments c JOIN forum_users u ON u.id=c.author_id ORDER BY c.created_at""")
            comments = [self._comment(row) for row in cursor.fetchall()]
        visible = []
        keyword = str(filters.get("q", "")).strip().lower()
        for post in posts:
            if not (admin or post["status"] == "approved" or post["author"]["id"] == viewer_id):
                continue
            if filters.get("topic") and post["topic"] != filters["topic"]:
                continue
            if admin and filters.get("status") and post["status"] != filters["status"]:
                continue
            if filters.get("role") and post["author"]["role"] != filters["role"]:
                continue
            if keyword and keyword not in " ".join((post["title"], post["body"], post["topic"], post["author"]["displayName"])).lower():
                continue
            post["comments"] = [comment for comment in comments if comment["postId"] == post["id"] and (admin or comment["status"] == "approved" or comment["author"]["id"] == viewer_id)]
            visible.append(post)
        return visible

    def create_comment(self, user: dict, post_id: str, body: str) -> dict:
        with self._connect() as connection, connection.cursor() as cursor:
            cursor.execute("SELECT status FROM forum_posts WHERE id=%s", (post_id,))
            post = cursor.fetchone()
            if not post:
                raise ValueError("帖子不存在。")
            if post["status"] != "approved":
                raise ValueError("帖子通过审核后才可以评论。")
            comment_id = str(uuid4())
            now = datetime.now(timezone.utc)
            cursor.execute("INSERT INTO forum_comments (id,post_id,author_id,body,status,created_at,updated_at) VALUES (%s,%s,%s,%s,'pending',%s,%s)", (comment_id, post_id, user["id"], body, now, now))
        return {"id": comment_id, "postId": post_id, "body": body, "status": "pending", "author": user, "createdAt": _iso(now), "updatedAt": _iso(now), "moderation": None}

    def create_report(self, user: dict, target_type: str, target_id: str, reason: str) -> dict:
        if target_type not in {"post", "comment"}:
            raise ValueError("未知举报对象。")
        table = "forum_posts" if target_type == "post" else "forum_comments"
        with self._connect() as connection, connection.cursor() as cursor:
            cursor.execute(f"SELECT author_id,status FROM {table} WHERE id=%s", (target_id,))
            target = cursor.fetchone()
            if not target or target["status"] != "approved":
                raise ValueError("只能举报已经公开的内容。")
            if target["author_id"] == user["id"]:
                raise ValueError("不能举报自己发布的内容。")
            cursor.execute("SELECT id FROM forum_reports WHERE reporter_id=%s AND target_type=%s AND target_id=%s AND status='open'", (user["id"], target_type, target_id))
            if cursor.fetchone():
                raise ValueError("你已经举报过这条内容。")
            report_id = str(uuid4())
            cursor.execute("INSERT INTO forum_reports (id,reporter_id,target_type,target_id,reason,status,created_at) VALUES (%s,%s,%s,%s,%s,'open',%s)", (report_id, user["id"], target_type, target_id, reason, datetime.now(timezone.utc)))
        return {"id": report_id}

    def moderate(self, target_type: str, target_id: str, status: str, reason: str = "") -> dict:
        if target_type not in {"post", "comment"} or status not in {"approved", "rejected"}:
            raise ValueError("审核参数无效。")
        table = "forum_posts" if target_type == "post" else "forum_comments"
        now = datetime.now(timezone.utc)
        with self._connect() as connection, connection.cursor() as cursor:
            affected = cursor.execute(f"UPDATE {table} SET status=%s,moderation_reason=%s,moderated_by='admin',moderated_at=%s,updated_at=%s WHERE id=%s", (status, reason[:200], now, now, target_id))
            if not affected:
                raise ValueError("内容不存在。")
            cursor.execute("UPDATE forum_reports SET status='resolved',resolved_at=%s WHERE target_type=%s AND target_id=%s AND status='open'", (now, target_type, target_id))
        return {"id": target_id, "status": status}

    def summary(self, viewer_id: str = "", admin: bool = False) -> dict:
        with self._connect() as connection, connection.cursor() as cursor:
            cursor.execute("SELECT status,author_id FROM forum_posts")
            posts = cursor.fetchall()
            cursor.execute("SELECT status,author_id FROM forum_comments")
            comments = cursor.fetchall()
            cursor.execute("SELECT COUNT(*) count FROM forum_reports WHERE status='open'")
            reports = cursor.fetchone()["count"]
            cursor.execute("SELECT COUNT(*) count FROM forum_users")
            users = cursor.fetchone()["count"]
        visible_posts = [item for item in posts if admin or item["status"] == "approved" or item["author_id"] == viewer_id]
        visible_comments = [item for item in comments if admin or item["status"] == "approved" or item["author_id"] == viewer_id]
        return {
            "visiblePosts": len(visible_posts), "approvedPosts": sum(item["status"] == "approved" for item in visible_posts),
            "pendingPosts": sum(item["status"] == "pending" for item in (posts if admin else visible_posts)),
            "pendingComments": sum(item["status"] == "pending" for item in (comments if admin else visible_comments)),
            "openReports": int(reports) if admin else 0, "totalUsers": int(users) if admin else None,
        }

