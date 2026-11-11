"""Fetch dependency, vulnerability and maintainer-activity data for critical open-source projects.

Snapshot retrieved 2026-11-11 from three free, credential-light public sources:

- Debian 13 "trixie" (13.7) main/amd64 package index — who depends on each project:
  https://deb.debian.org/debian/dists/trixie/main/binary-amd64/Packages.xz
- OSV.dev vulnerability API, Debian ecosystem (one DEBIAN-CVE-* record per CVE Debian tracks
  against a source package): https://api.osv.dev/v1/query
- GitHub REST API — commits on each project's default branch in the 12 months before the
  snapshot, and bytes of code per language: https://api.github.com/repos/{owner}/{repo}/commits

Selection. The plan was to pick projects from the OpenSSF Criticality Score dataset
(gs://ossf-criticality-score/), but on 2026-11-11 every object in that bucket returned HTTP 403
("The billing account for the owning project is disabled"), and BigQuery would need paid
credentials. Instead, CANDIDATES below is a pool of 21 projects routinely named in
critical-open-source discussions (Alpha-Omega, Sovereign Tech Agency, post-Heartbleed and
post-xz reviews). A candidate is kept only if Debian trixie ships it and at least
MIN_DEBIAN_DEPENDENTS other Debian binary packages depend on it directly. That cut drops
Log4j, core-js and NTPsec, whose users mostly live outside Debian (Maven, npm) or are
end-user installs, not libraries.

Nothing raw is committed: Packages.xz is ~10 MB. Re-fetch everything with

    GITHUB_TOKEN=... python -m pipeline.extract_open_source

(the token is optional but the unauthenticated GitHub limit, 60 requests/hour, is too low for
the commit history of systemd or NumPy). Results drift as projects commit and CVEs are
published, so the committed CSV is the snapshot the scenario is built from.
"""

from __future__ import annotations

import csv
import json
import lzma
import os
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).parent
OUT_CSV = HERE / "data" / "open-source-infrastructure.csv"

SNAPSHOT = "2026-11-11"
ACTIVITY_SINCE = "2025-11-11T00:00:00Z"
ACTIVITY_UNTIL = "2026-11-11T00:00:00Z"
CVE_SINCE = "2016-11-11"  # "last 10 years"
CORE_COMMITS = 12  # a "core contributor" made at least one commit a month on average
MIN_DEBIAN_DEPENDENTS = 40

PACKAGES_URL = "https://deb.debian.org/debian/dists/trixie/main/binary-amd64/Packages.xz"
OSV_URL = "https://api.osv.dev/v1/query"
GITHUB = "https://api.github.com"

# (id, display name, Debian source package, GitHub repo — an official mirror where upstream
# hosts elsewhere: libxml2 on GNOME GitLab, GnuPG and SQLite on their own servers).
CANDIDATES = [
    ("curl", "curl", "curl", "curl/curl"),
    ("openssl", "OpenSSL", "openssl", "openssl/openssl"),
    ("zlib", "zlib", "zlib", "madler/zlib"),
    ("libxml2", "libxml2", "libxml2", "GNOME/libxml2"),
    ("xz-utils", "XZ Utils", "xz-utils", "tukaani-project/xz"),
    ("openssh", "OpenSSH", "openssh", "openssh/openssh-portable"),
    ("sqlite", "SQLite", "sqlite3", "sqlite/sqlite"),
    ("libpng", "libpng", "libpng1.6", "pnggroup/libpng"),
    ("expat", "Expat", "expat", "libexpat/libexpat"),
    ("gnupg", "GnuPG", "gnupg2", "gpg/gnupg"),
    ("sudo", "sudo", "sudo", "sudo-project/sudo"),
    ("systemd", "systemd", "systemd", "systemd/systemd"),
    ("zstd", "Zstandard (zstd)", "libzstd", "facebook/zstd"),
    ("pcre2", "PCRE2", "pcre2", "PCRE2Project/pcre2"),
    ("libjpeg-turbo", "libjpeg-turbo", "libjpeg-turbo", "libjpeg-turbo/libjpeg-turbo"),
    ("numpy", "NumPy", "numpy", "numpy/numpy"),
    ("requests", "Requests", "requests", "psf/requests"),
    ("urllib3", "urllib3", "python-urllib3", "urllib3/urllib3"),
    ("log4j", "Apache Log4j", "apache-log4j2", "apache/logging-log4j2"),
    ("core-js", "core-js", "node-core-js", "zloirock/core-js"),
    ("ntpsec", "NTPsec", "ntpsec", "ntpsec/ntpsec"),
]

COLUMNS = [
    "id", "name", "debian_source", "github_repo", "debian_dependents", "cves_10y", "cves_all",
    "commits_12mo", "authors_12mo", "core_contributors_12mo", "top_author_share", "code_mb",
]


def fetch(url: str, data: bytes | None = None, token: str | None = None) -> bytes:
    req = urllib.request.Request(url, data=data, headers={"User-Agent": "allocation-sim-pipeline"})
    if data is not None:
        req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
        req.add_header("Accept", "application/vnd.github+json")
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def debian_dependents(sources: set[str]) -> dict[str, int]:
    """Binary packages (from a different source) whose Depends/Pre-Depends name a binary of each source."""
    text = lzma.decompress(fetch(PACKAGES_URL)).decode("utf-8")
    source_of, deps = {}, {}
    for stanza in text.split("\n\n"):
        fields, key = {}, None
        for line in stanza.splitlines():
            if line[:1] in (" ", "\t") and key:
                fields[key] += line
            elif ":" in line:
                key, value = line.split(":", 1)
                fields[key] = value.strip()
        if "Package" not in fields:
            continue
        pkg = fields["Package"]
        source_of[pkg] = fields.get("Source", pkg).split()[0]
        names = set()
        for field in ("Depends", "Pre-Depends"):
            for alternative in fields.get(field, "").replace("|", ",").split(","):
                if alternative.strip():
                    names.add(alternative.split()[0].split(":")[0])
        deps[pkg] = names
    dependents = defaultdict(set)
    for pkg, names in deps.items():
        for name in names:
            src = source_of.get(name)
            if src in sources and src != source_of[pkg]:
                dependents[src].add(pkg)
    return {s: len(dependents[s]) for s in sources}


def debian_cves(source: str) -> tuple[int, int]:
    """(CVEs published since CVE_SINCE, all CVEs) that Debian tracks against a source package."""
    vulns, token = [], None
    while True:
        body = {"package": {"name": source, "ecosystem": "Debian"}}
        if token:
            body["page_token"] = token
        page = json.loads(fetch(OSV_URL, json.dumps(body).encode()))
        vulns += page.get("vulns", [])
        token = page.get("next_page_token")
        if not token:
            break
    cves = {v["id"]: v.get("published", "")[:10] for v in vulns if v["id"].startswith("DEBIAN-CVE-")}
    return sum(1 for d in cves.values() if d >= CVE_SINCE), len(cves)


def github_activity(repo: str, token: str | None) -> dict[str, float]:
    """Non-merge commits on the default branch in the 12-month window, grouped by author."""
    authors: Counter[str] = Counter()
    page = 1
    while True:
        url = f"{GITHUB}/repos/{repo}/commits?since={ACTIVITY_SINCE}&until={ACTIVITY_UNTIL}&per_page=100&page={page}"
        batch = json.loads(fetch(url, token=token))
        for c in batch:
            if len(c.get("parents", [])) > 1:
                continue
            login = (c.get("author") or {}).get("login")
            who = login or c["commit"]["author"].get("name", "").strip().lower()
            if who.endswith("[bot]") or who in ("dependabot", "github-actions", "renovate"):
                continue
            authors[who] += 1
        if len(batch) < 100:
            break
        page += 1
    commits = sum(authors.values())
    code_bytes = sum(json.loads(fetch(f"{GITHUB}/repos/{repo}/languages", token=token)).values())
    return {
        "commits_12mo": commits,
        "authors_12mo": len(authors),
        "core_contributors_12mo": sum(1 for n in authors.values() if n >= CORE_COMMITS),
        "top_author_share": round(max(authors.values()) / commits, 3) if commits else 0.0,
        "code_mb": round(code_bytes / 1e6, 1),
    }


def main() -> None:
    token = os.environ.get("GITHUB_TOKEN")
    dependents = debian_dependents({c[2] for c in CANDIDATES})
    rows = []
    for app_id, name, source, repo in CANDIDATES:
        n = dependents[source]
        if n < MIN_DEBIAN_DEPENDENTS:
            print(f"skip {name}: {n} Debian dependents")
            continue
        cves_10y, cves_all = debian_cves(source)
        row = {"id": app_id, "name": name, "debian_source": source, "github_repo": repo,
               "debian_dependents": n, "cves_10y": cves_10y, "cves_all": cves_all,
               **github_activity(repo, token)}
        print(row)
        rows.append(row)
    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    with OUT_CSV.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    print(f"wrote {len(rows)} projects to {OUT_CSV.relative_to(HERE.parent)}")


if __name__ == "__main__":
    main()
