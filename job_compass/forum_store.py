import hashlib
import json
import re
import threading
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4


EMPTY_DATA = {
    "version": 1,
    "users": {},
    "usersByPhoneHash": {},
    "posts": {},
    "comments": {},
    "reports": {},
}


def normalize_phone(phone: str) -> str:
    value = re.sub(r"\D", "", str(phone or ""))
    return value if re.fullmatch(r"1[3-9]\d{9}", value) else ""


def mask_phone(phone: str) -> str:
    return f"{phone[:3]}****{phone[-4:]}"


class ForumStore:
    def __init__(self, file_path: Path, phone_hash_secret: str = ""):
        self.file_path = Path(file_path)
        self.phone_hash_secret = phone_hash_secret
        self._lock = threading.RLock()
        self.data = self._load()

    def _load(self) -> dict:
        try:
            loaded = json.loads(self.file_path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            loaded = {}
        return {
            key: loaded.get(key, default.copy() if isinstance(default, dict) else default)
            for key, default in EMPTY_DATA.items()
        }

    def _save(self) -> None:
        self.file_path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.file_path.with_suffix(self.file_path.suffix + ".tmp")
        temporary.write_text(json.dumps(self.data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        temporary.replace(self.file_path)

    def _phone_hash(self, phone: str) -> str:
        return hashlib.sha256(f"{self.phone_hash_secret}:{phone}".encode()).hexdigest()

    @staticmethod
    def public_user(user: dict | None) -> dict | None:
        if not user:
            return None
        return {
            "id": user["id"],
            "displayName": user["displayName"],
            "role": user["role"],
            "phoneMasked": user["phoneMasked"],
            "createdAt": user["createdAt"],
        }

    def create_user(self, phone: str, password_hash: str, display_name: str, role: str) -> dict:
        normalized = normalize_phone(phone)
        if not normalized:
            raise ValueError("请输入有效的 11 位手机号。")
        key = self._phone_hash(normalized)
        with self._lock:
            if key in self.data["usersByPhoneHash"]:
                raise ValueError("该手机号已经注册，请直接登录。")
            user_id = str(uuid4())
            user = {
                "id": user_id,
                "phoneHash": key,
                "phoneMasked": mask_phone(normalized),
                "passwordHash": password_hash,
                "displayName": display_name,
                "role": role,
                "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "disabled": False,
            }
            self.data["users"][user_id] = user
            self.data["usersByPhoneHash"][key] = user_id
            self._save()
        return self.public_user(user)

    def user_by_phone(self, phone: str) -> dict | None:
        normalized = normalize_phone(phone)
        if not normalized:
            return None
        user_id = self.data["usersByPhoneHash"].get(self._phone_hash(normalized))
        return self.data["users"].get(user_id) if user_id else None

    def user_by_id(self, user_id: str | None) -> dict | None:
        user = self.data["users"].get(str(user_id or ""))
        return user if user and not user.get("disabled") else None

    @staticmethod
    def _author(user: dict) -> dict:
        return {
            "id": user["id"],
            "displayName": user["displayName"],
            "role": user["role"],
            "phoneMasked": user["phoneMasked"],
        }

    def create_post(self, user: dict, topic: str, title: str, body: str) -> dict:
        now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        post = {
            "id": str(uuid4()),
            "title": title,
            "body": body,
            "topic": topic,
            "status": "pending",
            "author": self._author(user),
            "createdAt": now,
            "updatedAt": now,
            "moderation": None,
        }
        with self._lock:
            self.data["posts"][post["id"]] = post
            self._save()
        return post

    def list_posts(self, viewer_id: str = "", admin: bool = False, filters: dict | None = None) -> list[dict]:
        filters = filters or {}
        comments_by_post: dict[str, list] = {}
        for comment in self.data["comments"].values():
            if admin or comment["status"] == "approved" or comment["author"]["id"] == viewer_id:
                comments_by_post.setdefault(comment["postId"], []).append(comment.copy())
        posts = []
        keyword = str(filters.get("q", "")).strip().lower()
        for post in self.data["posts"].values():
            if not (admin or post["status"] == "approved" or post["author"]["id"] == viewer_id):
                continue
            if filters.get("topic") and post["topic"] != filters["topic"]:
                continue
            if admin and filters.get("status") and post["status"] != filters["status"]:
                continue
            if filters.get("role") and post["author"]["role"] != filters["role"]:
                continue
            searchable = " ".join((post["title"], post["body"], post["topic"], post["author"]["displayName"])).lower()
            if keyword and keyword not in searchable:
                continue
            item = post.copy()
            item["comments"] = sorted(comments_by_post.get(post["id"], []), key=lambda value: value["createdAt"])
            posts.append(item)
        return sorted(posts, key=lambda value: value["createdAt"], reverse=True)

    def create_comment(self, user: dict, post_id: str, body: str) -> dict:
        post = self.data["posts"].get(post_id)
        if not post:
            raise ValueError("帖子不存在。")
        if post["status"] != "approved":
            raise ValueError("帖子通过审核后才可以评论。")
        now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        comment = {
            "id": str(uuid4()), "postId": post_id, "body": body, "status": "pending",
            "author": self._author(user), "createdAt": now, "updatedAt": now, "moderation": None,
        }
        with self._lock:
            self.data["comments"][comment["id"]] = comment
            self._save()
        return comment

    def create_report(self, user: dict, target_type: str, target_id: str, reason: str) -> dict:
        if target_type not in {"post", "comment"}:
            raise ValueError("未知举报对象。")
        item = self.data["posts" if target_type == "post" else "comments"].get(target_id)
        if not item or item["status"] != "approved":
            raise ValueError("只能举报已经公开的内容。")
        if item["author"]["id"] == user["id"]:
            raise ValueError("不能举报自己发布的内容。")
        for report in self.data["reports"].values():
            if report["type"] == target_type and report["targetId"] == target_id and report["reporter"]["id"] == user["id"] and report["status"] == "open":
                raise ValueError("你已经举报过这条内容。")
        report = {
            "id": str(uuid4()), "type": target_type, "targetId": target_id,
            "reason": reason, "status": "open", "reporter": self._author(user),
            "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"), "resolvedAt": None,
        }
        with self._lock:
            self.data["reports"][report["id"]] = report
            self._save()
        return report

    def moderate(self, target_type: str, target_id: str, status: str, reason: str = "") -> dict:
        if target_type not in {"post", "comment"} or status not in {"approved", "rejected"}:
            raise ValueError("审核参数无效。")
        container = self.data["posts" if target_type == "post" else "comments"]
        item = container.get(target_id)
        if not item:
            raise ValueError("内容不存在。")
        now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        with self._lock:
            item["status"] = status
            item["updatedAt"] = now
            item["moderation"] = {"status": status, "reason": reason[:200], "moderator": "admin", "moderatedAt": now}
            for report in self.data["reports"].values():
                if report["type"] == target_type and report["targetId"] == target_id and report["status"] == "open":
                    report["status"] = "resolved"
                    report["resolvedAt"] = now
            self._save()
        return item

    def summary(self, viewer_id: str = "", admin: bool = False) -> dict:
        posts = list(self.data["posts"].values())
        comments = list(self.data["comments"].values())
        visible_posts = [item for item in posts if admin or item["status"] == "approved" or item["author"]["id"] == viewer_id]
        visible_comments = [item for item in comments if admin or item["status"] == "approved" or item["author"]["id"] == viewer_id]
        return {
            "visiblePosts": len(visible_posts),
            "approvedPosts": sum(item["status"] == "approved" for item in visible_posts),
            "pendingPosts": sum(item["status"] == "pending" for item in (posts if admin else visible_posts)),
            "pendingComments": sum(item["status"] == "pending" for item in (comments if admin else visible_comments)),
            "openReports": sum(item["status"] == "open" for item in self.data["reports"].values()) if admin else 0,
            "totalUsers": len(self.data["users"]) if admin else None,
        }
