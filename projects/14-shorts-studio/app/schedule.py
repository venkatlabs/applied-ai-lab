from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo


def build_schedule(channel, episode_ids, start=None):
    info = channel["channel"]
    zone = ZoneInfo(info["timezone"])
    slots = [time(*map(int, t.split(":"))) for t in info["post_times"]]
    per_day = min(info.get("videos_per_day", 1), len(slots))
    day = start or (datetime.now(zone).date() + timedelta(days=1))
    if isinstance(day, str):
        day = date.fromisoformat(day)
    rows, index = [], 0
    while index < len(episode_ids):
        for slot in slots[:per_day]:
            if index >= len(episode_ids):
                break
            local = datetime.combine(day, slot, tzinfo=zone)
            rows.append({
                "id": episode_ids[index],
                "local": local.isoformat(),
                "publishAt": local.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            })
            index += 1
        day += timedelta(days=1)
    return rows
