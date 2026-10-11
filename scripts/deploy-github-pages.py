#!/usr/bin/env python3
"""Deploy ~/workspace/mario-kart-3d/game/ to GitHub Pages (user's own account).
Creates repo <login>/mario-kart-3d if needed, pushes all files in one commit,
enables Pages. Prints the public URL.
"""
import base64, json, os, sys, urllib.request
sys.path.insert(0, "/opt/hatch/skills/skill-creator/bin")
from dynamic_credentials import add_surrogate_to_request, read_json_response

CRED = "custom.github"
ALLOWED = ["api.github.com"]
API = "https://api.github.com"
GAME_DIR = os.path.expanduser("~/workspace/mario-kart-3d/game")
REPO_NAME = "mario-kart-3d"

def api(method, url, payload=None, ok=(200, 201, 204)):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("X-GitHub-Api-Version", "2022-11-28")
    req.add_header("User-Agent", "muse-github-skill/1.0")
    if data:
        req.add_header("Content-Type", "application/json")
    add_surrogate_to_request(req, CRED, allowed_hosts=ALLOWED)
    try:
        resp = urllib.request.urlopen(req, timeout=60)
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:300]
        raise RuntimeError(f"{method} {url} -> {e.code}: {body}")
    if resp.status == 204:
        return None
    return read_json_response(resp)

def main():
    me = api("GET", f"{API}/user")["login"]
    print("github login:", me, flush=True)
    try:
        api("POST", f"{API}/user/repos",
            {"name": REPO_NAME, "description": "3D 马里奥赛车风格浏览器游戏（Pi + 免费模型全自动开发）",
             "private": False, "auto_init": False})
        print("repo created", flush=True)
    except RuntimeError as e:
        if "422" in str(e):
            print("repo already exists, reusing", flush=True)
        else:
            raise

    # collect files
    files = []
    for root, _, names in os.walk(GAME_DIR):
        for n in names:
            full = os.path.join(root, n)
            rel = os.path.relpath(full, GAME_DIR)
            files.append((rel, full))
    files.sort()
    print(f"{len(files)} files", flush=True)

    tree = []
    for rel, full in files:
        with open(full, "rb") as f:
            b64 = base64.b64encode(f.read()).decode()
        blob = api("POST", f"{API}/repos/{me}/{REPO_NAME}/git/blobs",
                   {"content": b64, "encoding": "base64"})
        tree.append({"path": rel, "mode": "100644", "type": "blob", "sha": blob["sha"]})
        print("  blob", rel, flush=True)

    tree_resp = api("POST", f"{API}/repos/{me}/{REPO_NAME}/git/trees", {"tree": tree})
    commit = api("POST", f"{API}/repos/{me}/{REPO_NAME}/git/commits",
                 {"message": "Deploy 3D kart racer (P8 final)", "tree": tree_resp["sha"]})
    try:
        api("POST", f"{API}/repos/{me}/{REPO_NAME}/git/refs",
            {"ref": "refs/heads/main", "sha": commit["sha"]})
    except RuntimeError as e:
        if "422" in str(e):  # ref exists -> fast-forward
            api("PATCH", f"{API}/repos/{me}/{REPO_NAME}/git/refs/heads/main",
                {"sha": commit["sha"], "force": True})
        else:
            raise
    print("pushed", commit["sha"][:8], flush=True)

    try:
        pages = api("POST", f"{API}/repos/{me}/{REPO_NAME}/pages",
                    {"source": {"branch": "main", "path": "/"}})
        print("pages enabled:", pages.get("html_url"), flush=True)
    except RuntimeError as e:
        if "409" in str(e):
            pages = api("GET", f"{API}/repos/{me}/{REPO_NAME}/pages")
            print("pages already on:", pages.get("html_url"), flush=True)
        else:
            raise

if __name__ == "__main__":
    main()
