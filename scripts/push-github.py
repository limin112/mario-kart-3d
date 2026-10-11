#!/usr/bin/env python3
"""Push local HEAD of ~/workspace/mario-kart-3d to GitHub repo
limin112/mario-kart-3d via the Git Database API (git HTTPS direct push
fails 401 through the surrogate; see GUIDANCE 2026-10-11 15:35).

Strategy: walk local HEAD tree; upload blobs/trees that the remote lacks
(compare SHAs), create one commit on top of remote head, update ref.
"""
import json, os, subprocess, sys, urllib.request, urllib.error
sys.path.insert(0, "/opt/hatch/skills/skill-creator/bin")
from dynamic_credentials import add_surrogate_to_request, read_json_response

CRED = "custom.github"
ALLOWED = ["api.github.com"]
API = "https://api.github.com"
OWNER = "limin112"
REPO = "mario-kart-3d"
REPO_DIR = os.path.expanduser("~/workspace/mario-kart-3d")

def api(method, url, payload=None, ok=(200, 201, 204), raw=False):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("X-GitHub-Api-Version", "2022-11-28")
    req.add_header("User-Agent", "pi-push/1.0")
    if data:
        req.add_header("Content-Type", "application/json")
    add_surrogate_to_request(req, CRED, allowed_hosts=ALLOWED)
    try:
        resp = urllib.request.urlopen(req, timeout=60)
    except urllib.error.HTTPError as e:
        if e.code not in ok:
            body = e.read().decode()[:200]
            raise RuntimeError(f"{method} {url} -> {e.code}: {body}")
        return None
    if raw:
        return resp.read()
    return read_json_response(resp)

def git(*args, binary=False):
    out = subprocess.run(["git", *args], cwd=REPO_DIR, check=True,
                         capture_output=True).stdout
    return out if binary else out.decode()

def remote_obj_exists(kind, sha):
    try:
        api("GET", f"{API}/repos/{OWNER}/{REPO}/git/{kind}/{sha}")
        return True
    except RuntimeError as e:
        if "-> 404" in str(e) or "-> 422" in str(e):
            return False
        raise

def upload_blob(sha):
    content = git("cat-file", "blob", sha, binary=True)
    import base64
    r = api("POST", f"{API}/repos/{OWNER}/{REPO}/git/blobs",
            {"content": base64.b64encode(content).decode(), "encoding": "base64"})
    if r and r["sha"] != sha:
        raise RuntimeError(f"blob sha mismatch for {sha}: got {r['sha']}")

def ensure_tree(local_sha, remote_sha):
    """Recursively make remote contain local tree; return local sha (== remote after)."""
    if local_sha == remote_sha:
        return local_sha
    entries = json.loads(git("ls-tree", local_sha))
    remote_entries = {}
    if remote_sha:
        try:
            rt = api("GET", f"{API}/repos/{OWNER}/{REPO}/git/trees/{remote_sha}")
            remote_entries = {e["path"]: e["sha"] for e in rt.get("tree", [])}
        except RuntimeError:
            pass
    out = []
    for e in entries:
        if e["type"] == "blob":
            if not remote_obj_exists("blobs", e["sha"]):
                upload_blob(e["sha"])
                print(f"  blob + {e['path']}", flush=True)
            out.append({"path": e["path"], "mode": e["mode"], "type": "blob", "sha": e["sha"]})
        elif e["type"] == "tree":
            ensure_tree(e["sha"], remote_entries.get(e["path"]))
            out.append({"path": e["path"], "mode": e["mode"], "type": "tree", "sha": e["sha"]})
        # skip symlinks/submodules (repo has none)
    # create trees bottom-up; if remote already has identical tree sha it exists
    if not remote_obj_exists("trees", local_sha):
        t = api("POST", f"{API}/repos/{OWNER}/{REPO}/git/trees", {"tree": out})
        if t["sha"] != local_sha:
            raise RuntimeError(f"tree sha mismatch for {local_sha}: got {t['sha']}")
    return local_sha

def main():
    head = git("rev-parse", "HEAD").strip()
    local_tree = git("rev-parse", "HEAD^{tree}").strip()
    msg = git("log", "-1", "--pretty=%B").strip()
    repo = api("GET", f"{API}/repos/{OWNER}/{REPO}")
    branch = repo["default_branch"]
    ref = api("GET", f"{API}/repos/{OWNER}/{REPO}/git/ref/heads/{branch}")
    remote_head = ref["object"]["sha"]
    remote_commit = api("GET", f"{API}/repos/{OWNER}/{REPO}/git/commits/{remote_head}")
    remote_tree = remote_commit["tree"]["sha"]
    if remote_tree == local_tree:
        print(f"up to date (remote {branch} == local HEAD tree)")
        return
    ensure_tree(local_tree, remote_tree)
    c = api("POST", f"{API}/repos/{OWNER}/{REPO}/git/commits",
            {"message": msg + "\n\n(via pi GitHub API push)", "tree": local_tree,
             "parents": [remote_head]})
    api("PATCH", f"{API}/repos/{OWNER}/{REPO}/git/refs/heads/{branch}",
        {"sha": c["sha"]}, ok=(200,))
    print(f"pushed {head[:8]} -> {branch} @ {c['sha'][:8]}")

if __name__ == "__main__":
    main()
