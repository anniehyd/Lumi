"""Replay exported mail through a Lumi deployment's forwarding webhook.

Each input file is one message in Postmark's inbound JSON shape (From,
FromName, FromFull, Subject, MessageID, Date, TextBody). The recipient is
rewritten to the demo account's forwarding address, so the message takes the
same path a forwarded newsletter takes: store, detect, extract, score.
Duplicates (same MessageID) are acknowledged and skipped by the server, so
re-running is safe.

    INBOUND_WEBHOOK_SECRET=... DEMO_FORWARDING_TOKEN=... \
      python3 -I scripts/replay-inbound.py https://lumi-demo.fly.dev <dir-or-file>...

Needs only the standard library; -I keeps the interpreter from importing
anything from the input directories.
"""
import glob
import json
import os
import sys
import time
import urllib.error
import urllib.request

secret = os.environ.get("INBOUND_WEBHOOK_SECRET", "").strip()
token = os.environ.get("DEMO_FORWARDING_TOKEN", "").strip()
domain = os.environ.get("INBOUND_EMAIL_DOMAIN", "demo.lumi.local").strip()
if len(sys.argv) < 3 or not secret or not token:
    sys.exit(__doc__)
base = sys.argv[1].rstrip("/")

files: list[str] = []
for arg in sys.argv[2:]:
    files += glob.glob(os.path.join(arg, "*.json")) if os.path.isdir(arg) else [arg]

items = []
for f in files:
    try:
        p = json.load(open(f, encoding="utf-8"))
    except Exception as e:  # noqa: BLE001
        print("BAD", f, e)
        continue
    items.append((p.get("Date", ""), f, p))
items.sort()

tally = {"files": len(items), "stored": 0, "events": 0, "duplicate": 0, "skipped": 0, "failed": 0, "errors": 0}
t0 = time.time()
to = f"lumi+{token}@{domain}"
for date, f, p in items:
    p["To"] = p["OriginalRecipient"] = to
    p["ToFull"] = [{"Email": to, "Name": "", "MailboxHash": token}]
    req = urllib.request.Request(
        f"{base}/api/ingest/inbound",
        data=json.dumps(p).encode("utf-8"),
        method="POST",
        headers={"content-type": "application/json", "authorization": f"Bearer {secret}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            res = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        print("HTTP", e.code, os.path.basename(f), e.read()[:200])
        tally["errors"] += 1
        continue
    except Exception as e:  # noqa: BLE001
        print("ERR", os.path.basename(f), e)
        tally["errors"] += 1
        continue
    if res.get("skipped") == "duplicate":
        tally["duplicate"] += 1
        continue
    if "emailId" not in res:
        print("?", os.path.basename(f), res)
        continue
    tally["stored"] += 1
    n = res.get("eventsCreated") or 0
    tally["events"] += n
    note = f"  +{n} event(s)" if n else ""
    if res.get("skipped"):
        tally["skipped"] += 1
        note += f"  pre-filtered: {res['skipped']}"
    if res.get("failed"):
        tally["failed"] += 1
        note += "  FAILED"
    print(f"{date[:10]}  {str(p.get('Subject', ''))[:72]!r}{note}")
print(json.dumps(tally), f"in {time.time() - t0:.0f}s")
