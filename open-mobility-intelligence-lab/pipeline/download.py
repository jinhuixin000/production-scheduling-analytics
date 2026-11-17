"""Download the official NYC TLC source files (idempotent) and record SHA-256 checksums."""
from __future__ import annotations

import hashlib
import json
import urllib.request
import zipfile
from datetime import datetime, timezone

from config import RAW_DIR, SOURCES


def sha256(path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    manifest_path = RAW_DIR / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    for key, src in SOURCES.items():
        dest = RAW_DIR / src["file"]
        if not dest.exists():
            print(f"downloading {src['url']}")
            urllib.request.urlretrieve(src["url"], dest)
            manifest.pop(key, None)
        if key not in manifest:
            manifest[key] = {
                "title": src["title"],
                "url": src["url"],
                "file": src["file"],
                "bytes": dest.stat().st_size,
                "sha256": sha256(dest),
                "retrieved_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            }
        print(f"{src['file']}: {manifest[key]['bytes']:,} bytes sha256={manifest[key]['sha256'][:16]}…")
    zdir = RAW_DIR / "zones"
    if not any(zdir.rglob("*.shp")) if zdir.exists() else True:
        with zipfile.ZipFile(RAW_DIR / SOURCES["zone_shapes"]["file"]) as z:
            z.extractall(zdir)
    manifest_path.write_text(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
