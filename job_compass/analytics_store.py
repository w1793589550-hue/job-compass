import json
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import pymysql


SHANGHAI = ZoneInfo("Asia/Shanghai")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _date_key(value: datetime) -> str:
    return value.astimezone(SHANGHAI).strftime("%Y-%m-%d")


def _empty_data() -> dict:
    return {"version": 1, "visitors": {}, "daily": {}}


def _series(daily: dict, now: datetime, days: int = 14) -> list[dict]:
    today = now.astimezone(SHANGHAI).date()
    result = []
    for offset in range(days - 1, -1, -1):
        date = today - timedelta(days=offset)
        key = date.isoformat()
        period = daily.get(key, {})
        result.append({
            "date": key,
            "label": date.strftime("%m-%d"),
            "views": int(period.get("views", 0)),
            "visitors": len(period.get("visitors", [])),
        })
    return result


def chart_points(series: list[dict], key: str, width: int = 720, height: int = 220) -> str:
    values = [int(item.get(key, 0)) for item in series]
    maximum = max(values, default=0) or 1
    usable_width = width - 48
    usable_height = height - 48
    step = usable_width / max(len(values) - 1, 1)
    return " ".join(
        f"{24 + index * step:.1f},{20 + usable_height - value / maximum * usable_height:.1f}"
        for index, value in enumerate(values)
    )


class JsonAnalyticsStore:
    def __init__(self, file_path: Path):
        self.file_path = Path(file_path)
        self._lock = threading.RLock()
        try:
            loaded = json.loads(self.file_path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            loaded = {}
        self.data = {**_empty_data(), **loaded}
        for period in self.data["daily"].values():
            visitors = period.get("visitors", [])
            period["visitors"] = list(visitors) if isinstance(visitors, dict) else list(visitors)
            period.setdefault("views", 0)
            period.setdefault("paths", {})

    def _save(self) -> None:
        self.file_path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.file_path.with_suffix(self.file_path.suffix + ".tmp")
        temporary.write_text(json.dumps(self.data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        temporary.replace(self.file_path)

    def record(self, visitor_id: str, page_path: str, now: datetime | None = None) -> None:
        instant = now or _now()
        iso = instant.isoformat().replace("+00:00", "Z")
        day = _date_key(instant)
        with self._lock:
            visitor = self.data["visitors"].setdefault(visitor_id, {"firstSeen": iso, "lastSeen": iso, "views": 0})
            visitor["lastSeen"] = iso
            visitor["views"] += 1
            period = self.data["daily"].setdefault(day, {"views": 0, "visitors": [], "paths": {}})
            period["views"] += 1
            if visitor_id not in period["visitors"]:
                period["visitors"].append(visitor_id)
            period["paths"][page_path] = period["paths"].get(page_path, 0) + 1
            self._save()

    def summary(self, now: datetime | None = None) -> dict:
        instant = now or _now()
        today = self.data["daily"].get(_date_key(instant), {})
        daily = _series(self.data["daily"], instant)
        page_counts = {}
        total_views = 0
        for period in self.data["daily"].values():
            total_views += int(period.get("views", 0))
            for path, count in period.get("paths", {}).items():
                page_counts[path] = page_counts.get(path, 0) + int(count)
        return {
            "totals": {
                "views": total_views,
                "visitors": len(self.data["visitors"]),
                "todayViews": int(today.get("views", 0)),
                "todayVisitors": len(today.get("visitors", [])),
            },
            "daily": daily,
            "pageCounts": sorted(page_counts.items(), key=lambda item: item[1], reverse=True),
            "updatedAt": instant.isoformat().replace("+00:00", "Z"),
        }


class MySqlAnalyticsStore:
    def __init__(self, config: dict):
        self.config = {**config, "charset": "utf8mb4", "cursorclass": pymysql.cursors.DictCursor, "autocommit": True}

    def _connect(self):
        return pymysql.connect(**self.config)

    def record(self, visitor_id: str, page_path: str, now: datetime | None = None) -> None:
        instant = (now or _now()).replace(tzinfo=None)
        with self._connect() as connection, connection.cursor() as cursor:
            cursor.execute(
                """INSERT INTO analytics_visitors (visitor_id,first_seen,last_seen,views)
                   VALUES (%s,%s,%s,1)
                   ON DUPLICATE KEY UPDATE last_seen=VALUES(last_seen),views=views+1""",
                (visitor_id, instant, instant),
            )
            cursor.execute(
                "INSERT INTO analytics_page_views (visitor_id,page_path,viewed_at) VALUES (%s,%s,%s)",
                (visitor_id, page_path[:255], instant),
            )

    def summary(self, now: datetime | None = None) -> dict:
        instant = now or _now()
        local_today = instant.astimezone(SHANGHAI).replace(hour=0, minute=0, second=0, microsecond=0)
        next_day_utc = (local_today + timedelta(days=1)).astimezone(timezone.utc).replace(tzinfo=None)
        series_start = (local_today - timedelta(days=13)).astimezone(timezone.utc).replace(tzinfo=None)
        with self._connect() as connection, connection.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) count FROM analytics_page_views")
            total_views = int(cursor.fetchone()["count"])
            cursor.execute("SELECT COUNT(*) count FROM analytics_visitors")
            total_visitors = int(cursor.fetchone()["count"])
            cursor.execute("SELECT visitor_id,page_path,viewed_at FROM analytics_page_views WHERE viewed_at >= %s AND viewed_at < %s", (series_start, next_day_utc))
            rows = cursor.fetchall()
        daily_map = {}
        page_counts = {}
        for row in rows:
            timestamp = row["viewed_at"].replace(tzinfo=timezone.utc)
            key = _date_key(timestamp)
            period = daily_map.setdefault(key, {"views": 0, "visitors": set(), "paths": {}})
            period["views"] += 1
            period["visitors"].add(row["visitor_id"])
            path = row["page_path"]
            period["paths"][path] = period["paths"].get(path, 0) + 1
            page_counts[path] = page_counts.get(path, 0) + 1
        serializable = {key: {**value, "visitors": list(value["visitors"])} for key, value in daily_map.items()}
        today = serializable.get(local_today.date().isoformat(), {})
        return {
            "totals": {
                "views": total_views, "visitors": total_visitors,
                "todayViews": int(today.get("views", 0)), "todayVisitors": len(today.get("visitors", [])),
            },
            "daily": _series(serializable, instant),
            "pageCounts": sorted(page_counts.items(), key=lambda item: item[1], reverse=True),
            "updatedAt": instant.isoformat().replace("+00:00", "Z"),
        }
