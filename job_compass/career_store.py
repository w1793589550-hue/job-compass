import json
import threading
from datetime import date, datetime, timezone
from pathlib import Path
from uuid import uuid4


APPLICATION_STATUSES = (
    "planned",
    "applied",
    "assessment",
    "interview",
    "offer",
    "closed",
)

PROFILE_FIELDS = (
    "city",
    "identity",
    "graduationYear",
    "education",
    "major",
    "roles",
    "industries",
    "salary",
    "workStyle",
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _iso(value) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def empty_profile(user_id: str) -> dict:
    return {
        "userId": user_id,
        "city": "",
        "identity": "",
        "graduationYear": "",
        "education": "",
        "major": "",
        "roles": "",
        "industries": "",
        "salary": "",
        "workStyle": "",
        "updatedAt": "",
    }


def profile_completeness(profile: dict) -> int:
    filled = sum(bool(str(profile.get(field, "")).strip()) for field in PROFILE_FIELDS)
    return round(filled / len(PROFILE_FIELDS) * 100)


def application_summary(applications: list[dict]) -> dict:
    counts = {status: 0 for status in APPLICATION_STATUSES}
    for application in applications:
        status = application.get("status", "planned")
        if status in counts:
            counts[status] += 1
    today = date.today().isoformat()
    upcoming = [
        item for item in applications
        if item.get("nextActionAt") and item["nextActionAt"] >= today and item.get("status") not in {"offer", "closed"}
    ]
    upcoming.sort(key=lambda item: item["nextActionAt"])
    return {
        "total": len(applications),
        "active": sum(counts[status] for status in ("planned", "applied", "assessment", "interview")),
        "offers": counts["offer"],
        "counts": counts,
        "upcoming": upcoming[:5],
    }


class JsonCareerStore:
    def __init__(self, file_path: Path):
        self.file_path = Path(file_path)
        self._lock = threading.RLock()
        self.data = self._load()

    def _load(self) -> dict:
        try:
            loaded = json.loads(self.file_path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            loaded = {}
        return {
            "version": 1,
            "profiles": loaded.get("profiles", {}),
            "applications": loaded.get("applications", {}),
            "researches": loaded.get("researches", {}),
        }

    def _save(self) -> None:
        self.file_path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.file_path.with_suffix(self.file_path.suffix + ".tmp")
        temporary.write_text(json.dumps(self.data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        temporary.replace(self.file_path)

    def profile(self, user_id: str) -> dict:
        return {**empty_profile(user_id), **self.data["profiles"].get(user_id, {})}

    def save_profile(self, user_id: str, values: dict) -> dict:
        profile = empty_profile(user_id)
        profile.update({field: str(values.get(field, "")) for field in PROFILE_FIELDS})
        profile["updatedAt"] = _now()
        with self._lock:
            self.data["profiles"][user_id] = profile
            self._save()
        return profile.copy()

    def list_applications(self, user_id: str, status: str = "", query: str = "") -> list[dict]:
        keyword = query.strip().lower()
        applications = []
        for item in self.data["applications"].values():
            if item["userId"] != user_id:
                continue
            if status and item["status"] != status:
                continue
            if keyword and keyword not in " ".join((item["company"], item["role"], item["city"], item["notes"])).lower():
                continue
            applications.append(item.copy())
        return sorted(applications, key=lambda item: item["updatedAt"], reverse=True)

    def create_application(self, user_id: str, values: dict) -> dict:
        status = values.get("status", "planned")
        if status not in APPLICATION_STATUSES:
            raise ValueError("未知的求职进度。")
        now = _now()
        application = {
            "id": str(uuid4()),
            "userId": user_id,
            "company": values["company"],
            "role": values["role"],
            "city": values.get("city", ""),
            "sourceUrl": values.get("sourceUrl", ""),
            "sourceType": values.get("sourceType", ""),
            "status": status,
            "deadline": values.get("deadline", ""),
            "nextAction": values.get("nextAction", ""),
            "nextActionAt": values.get("nextActionAt", ""),
            "notes": values.get("notes", ""),
            "createdAt": now,
            "updatedAt": now,
        }
        with self._lock:
            self.data["applications"][application["id"]] = application
            self._save()
        return application.copy()

    def update_application(self, user_id: str, application_id: str, values: dict) -> dict:
        with self._lock:
            item = self.data["applications"].get(application_id)
            if not item or item["userId"] != user_id:
                raise ValueError("投递记录不存在。")
            status = values.get("status", item["status"])
            if status not in APPLICATION_STATUSES:
                raise ValueError("未知的求职进度。")
            item["status"] = status
            for field in ("nextAction", "nextActionAt", "notes"):
                if field in values:
                    item[field] = values[field]
            item["updatedAt"] = _now()
            self._save()
            return item.copy()

    def delete_application(self, user_id: str, application_id: str) -> None:
        with self._lock:
            item = self.data["applications"].get(application_id)
            if not item or item["userId"] != user_id:
                raise ValueError("投递记录不存在。")
            del self.data["applications"][application_id]
            self._save()

    def save_research(self, user_id: str, values: dict) -> dict:
        now = _now()
        research = {
            "id": str(uuid4()),
            "userId": user_id,
            "kind": values.get("kind", "company-research"),
            "title": values["title"],
            "query": values.get("query", {}),
            "content": values.get("content", ""),
            "sources": values.get("sources", []),
            "createdAt": now,
        }
        with self._lock:
            self.data["researches"][research["id"]] = research
            self._save()
        return research.copy()

    def list_researches(self, user_id: str) -> list[dict]:
        records = [item.copy() for item in self.data["researches"].values() if item["userId"] == user_id]
        return sorted(records, key=lambda item: item["createdAt"], reverse=True)

    def research(self, user_id: str, research_id: str) -> dict | None:
        item = self.data["researches"].get(research_id)
        return item.copy() if item and item["userId"] == user_id else None

    def delete_research(self, user_id: str, research_id: str) -> None:
        with self._lock:
            item = self.data["researches"].get(research_id)
            if not item or item["userId"] != user_id:
                raise ValueError("核验记录不存在。")
            del self.data["researches"][research_id]
            self._save()

    def admin_summary(self) -> dict:
        applications = list(self.data["applications"].values())
        return {
            "profiles": len(self.data["profiles"]),
            "applications": len(applications),
            "activeApplications": application_summary(applications)["active"],
            "researches": len(self.data["researches"]),
        }


class MySqlCareerStore:
    def __init__(self, config: dict):
        import pymysql

        self._db = pymysql
        self.config = {**config, "charset": "utf8mb4", "cursorclass": pymysql.cursors.DictCursor, "autocommit": True}

    def _connect(self):
        return self._db.connect(**self.config)

    @staticmethod
    def _profile(row: dict | None, user_id: str) -> dict:
        if not row:
            return empty_profile(user_id)
        return {
            "userId": row["user_id"],
            "city": row["city"],
            "identity": row["identity"],
            "graduationYear": row["graduation_year"],
            "education": row["education"],
            "major": row["major"],
            "roles": row["roles"],
            "industries": row["industries"],
            "salary": row["salary"],
            "workStyle": row["work_style"],
            "updatedAt": _iso(row["updated_at"]),
        }

    @staticmethod
    def _application(row: dict) -> dict:
        return {
            "id": row["id"], "userId": row["user_id"], "company": row["company"], "role": row["role"],
            "city": row["city"], "sourceUrl": row["source_url"], "sourceType": row["source_type"],
            "status": row["status"], "deadline": str(row["deadline"] or ""),
            "nextAction": row["next_action"], "nextActionAt": str(row["next_action_at"] or ""),
            "notes": row["notes"], "createdAt": _iso(row["created_at"]), "updatedAt": _iso(row["updated_at"]),
        }

    @staticmethod
    def _research(row: dict) -> dict:
        return {
            "id": row["id"], "userId": row["user_id"], "kind": row["kind"], "title": row["title"],
            "query": json.loads(row["query_json"] or "{}"), "content": row["content"],
            "sources": json.loads(row["sources_json"] or "[]"), "createdAt": _iso(row["created_at"]),
        }

    def profile(self, user_id: str) -> dict:
        with self._connect() as connection, connection.cursor() as cursor:
            cursor.execute("SELECT * FROM career_profiles WHERE user_id=%s", (user_id,))
            return self._profile(cursor.fetchone(), user_id)

    def save_profile(self, user_id: str, values: dict) -> dict:
        now = datetime.now(timezone.utc)
        fields = [str(values.get(field, "")) for field in PROFILE_FIELDS]
        with self._connect() as connection, connection.cursor() as cursor:
            cursor.execute(
                """INSERT INTO career_profiles (user_id,city,identity,graduation_year,education,major,roles,industries,salary,work_style,updated_at)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON DUPLICATE KEY UPDATE city=VALUES(city),identity=VALUES(identity),graduation_year=VALUES(graduation_year),education=VALUES(education),major=VALUES(major),roles=VALUES(roles),industries=VALUES(industries),salary=VALUES(salary),work_style=VALUES(work_style),updated_at=VALUES(updated_at)""",
                (user_id, *fields, now),
            )
        return self.profile(user_id)

    def list_applications(self, user_id: str, status: str = "", query: str = "") -> list[dict]:
        sql = "SELECT * FROM career_applications WHERE user_id=%s"
        params: list = [user_id]
        if status:
            sql += " AND status=%s"
            params.append(status)
        if query.strip():
            sql += " AND CONCAT(company,' ',role,' ',city,' ',notes) LIKE %s"
            params.append(f"%{query.strip()}%")
        sql += " ORDER BY updated_at DESC"
        with self._connect() as connection, connection.cursor() as cursor:
            cursor.execute(sql, tuple(params))
            return [self._application(row) for row in cursor.fetchall()]

    def create_application(self, user_id: str, values: dict) -> dict:
        status = values.get("status", "planned")
        if status not in APPLICATION_STATUSES:
            raise ValueError("未知的求职进度。")
        application_id = str(uuid4())
        now = datetime.now(timezone.utc)
        with self._connect() as connection, connection.cursor() as cursor:
            cursor.execute(
                """INSERT INTO career_applications
                (id,user_id,company,role,city,source_url,source_type,status,deadline,next_action,next_action_at,notes,created_at,updated_at)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,NULLIF(%s,''),%s,NULLIF(%s,''),%s,%s,%s)""",
                (application_id, user_id, values["company"], values["role"], values.get("city", ""),
                 values.get("sourceUrl", ""), values.get("sourceType", ""), status, values.get("deadline", ""),
                 values.get("nextAction", ""), values.get("nextActionAt", ""), values.get("notes", ""), now, now),
            )
            cursor.execute("SELECT * FROM career_applications WHERE id=%s", (application_id,))
            return self._application(cursor.fetchone())

    def update_application(self, user_id: str, application_id: str, values: dict) -> dict:
        with self._connect() as connection, connection.cursor() as cursor:
            cursor.execute("SELECT * FROM career_applications WHERE id=%s AND user_id=%s", (application_id, user_id))
            existing = cursor.fetchone()
            if not existing:
                raise ValueError("投递记录不存在。")
            status = values.get("status", existing["status"])
            if status not in APPLICATION_STATUSES:
                raise ValueError("未知的求职进度。")
            next_action = values.get("nextAction", existing["next_action"])
            next_action_at = values.get("nextActionAt", str(existing["next_action_at"] or ""))
            notes = values.get("notes", existing["notes"])
            cursor.execute(
                """UPDATE career_applications
                SET status=%s,next_action=%s,next_action_at=NULLIF(%s,''),notes=%s,updated_at=%s
                WHERE id=%s AND user_id=%s""",
                (status, next_action, next_action_at, notes,
                 datetime.now(timezone.utc), application_id, user_id),
            )
            cursor.execute("SELECT * FROM career_applications WHERE id=%s", (application_id,))
            return self._application(cursor.fetchone())

    def delete_application(self, user_id: str, application_id: str) -> None:
        with self._connect() as connection, connection.cursor() as cursor:
            if not cursor.execute("DELETE FROM career_applications WHERE id=%s AND user_id=%s", (application_id, user_id)):
                raise ValueError("投递记录不存在。")

    def save_research(self, user_id: str, values: dict) -> dict:
        research_id = str(uuid4())
        now = datetime.now(timezone.utc)
        with self._connect() as connection, connection.cursor() as cursor:
            cursor.execute(
                "INSERT INTO career_researches (id,user_id,kind,title,query_json,content,sources_json,created_at) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
                (research_id, user_id, values.get("kind", "company-research"), values["title"],
                 json.dumps(values.get("query", {}), ensure_ascii=False), values.get("content", ""),
                 json.dumps(values.get("sources", []), ensure_ascii=False), now),
            )
            cursor.execute("SELECT * FROM career_researches WHERE id=%s", (research_id,))
            return self._research(cursor.fetchone())

    def list_researches(self, user_id: str) -> list[dict]:
        with self._connect() as connection, connection.cursor() as cursor:
            cursor.execute("SELECT * FROM career_researches WHERE user_id=%s ORDER BY created_at DESC", (user_id,))
            return [self._research(row) for row in cursor.fetchall()]

    def research(self, user_id: str, research_id: str) -> dict | None:
        with self._connect() as connection, connection.cursor() as cursor:
            cursor.execute("SELECT * FROM career_researches WHERE id=%s AND user_id=%s", (research_id, user_id))
            row = cursor.fetchone()
            return self._research(row) if row else None

    def delete_research(self, user_id: str, research_id: str) -> None:
        with self._connect() as connection, connection.cursor() as cursor:
            if not cursor.execute("DELETE FROM career_researches WHERE id=%s AND user_id=%s", (research_id, user_id)):
                raise ValueError("核验记录不存在。")

    def admin_summary(self) -> dict:
        with self._connect() as connection, connection.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) count FROM career_profiles")
            profiles = cursor.fetchone()["count"]
            cursor.execute("SELECT COUNT(*) count FROM career_applications")
            applications = cursor.fetchone()["count"]
            cursor.execute("SELECT COUNT(*) count FROM career_applications WHERE status IN ('planned','applied','assessment','interview')")
            active = cursor.fetchone()["count"]
            cursor.execute("SELECT COUNT(*) count FROM career_researches")
            researches = cursor.fetchone()["count"]
        return {"profiles": int(profiles), "applications": int(applications), "activeApplications": int(active), "researches": int(researches)}
