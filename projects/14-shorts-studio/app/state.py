r'''Episode state machine + spend ledger, persisted as out/state.json.

idea -> planned -> rendered -> captioned -> pending_review -> approved -> published
                                                            \-> rejected
Publishing only ever touches `approved`; nothing auto-approves.
'''
import json
from datetime import datetime, timezone
from pathlib import Path

ORDER = ["planned", "rendered", "captioned", "pending_review", "approved", "published"]
TERMINAL = {"rejected", "failed", "published"}


class StateError(RuntimeError):
    pass


class State:
    def __init__(self, path):
        self.path = Path(path)
        self.data = {"episodes": {}, "spend_usd": 0.0}
        if self.path.exists():
            self.data = json.loads(self.path.read_text())

    def save(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(self.data, indent=2, ensure_ascii=False) + "\n")

    def ensure(self, ep_id, **fields):
        self.data["episodes"].setdefault(ep_id, {"status": "planned", "history": []}).update(fields)

    def set_status(self, ep_id, status, note=""):
        episode = self.data["episodes"].get(ep_id)
        if not episode:
            raise StateError(f"Unknown episode {ep_id}")
        if status == "approved" and episode["status"] != "pending_review":
            raise StateError(f"{ep_id} is '{episode['status']}', only pending_review can be approved")
        episode["status"] = status
        episode["history"].append({"status": status, "at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "note": note})

    def with_status(self, status):
        return [i for i, e in self.data["episodes"].items() if e["status"] == status]

    def add_spend(self, usd):
        self.data["spend_usd"] = round(self.data["spend_usd"] + usd, 4)

    def used_titles(self):
        return [e["title"] for e in self.data["episodes"].values() if e.get("title")]

    def used_topics(self):
        return [e["topic"] for e in self.data["episodes"].values() if e.get("topic")]

    def next_number(self):
        return 1 + max([e.get("episode", 0) for e in self.data["episodes"].values()] + [0])


def estimate_cost(seconds, price_per_second):
    if price_per_second is None:
        raise StateError("Set veo.price_per_second_usd in channel.json from Google's current Veo pricing before using --execute.")
    return round(seconds * price_per_second, 4)
