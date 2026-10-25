# -*- coding: utf-8 -*-
"""
AIOU Help — Cloud Asset Sync Engine
Uploads large past papers and keybooks to GitHub Releases for permanent, high-speed CDN delivery.
"""

import os
import re
import sys
import json
import time
import urllib.request
import urllib.parse
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')

BASE_DIR = Path(__file__).resolve().parent

def get_git_token():
    tok = os.environ.get("GITHUB_TOKEN")
    if tok:
        return tok
    try:
        import subprocess
        proc = subprocess.run(["git", "credential", "fill"], input="protocol=https\nhost=github.com\n", text=True, capture_output=True)
        for line in proc.stdout.splitlines():
            if line.startswith("password="):
                return line.split("=", 1)[1].strip()
    except Exception:
        pass
    return ""

TOKEN = get_git_token()
REPO = "hamid-ullah-514/aiou-help"
HEADERS = {
    "Authorization": f"token {TOKEN}",
    "User-Agent": "AIOU-Study-Portal",
    "Accept": "application/vnd.github.v3+json"
}

INDEX_PATHS = [
    BASE_DIR / "public" / "past_papers_index.json",
    BASE_DIR / "data" / "past_papers_index.json",
    BASE_DIR / "past_papers_index.json",
    BASE_DIR / "aiou_app" / "static" / "past_papers_index.json"
]

def load_catalog():
    for p in INDEX_PATHS:
        if p.exists():
            with open(p, "r", encoding="utf-8") as f:
                return json.load(f)
    raise FileNotFoundError("Could not find past_papers_index.json")

def save_catalog(data):
    for p in INDEX_PATHS:
        try:
            p.parent.mkdir(parents=True, exist_ok=True)
            with open(p, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"Warning: Could not save to {p}: {e}")

def get_or_create_release(tag: str, title: str):
    """Retrieves existing release by tag or creates a new one."""
    url = f"https://api.github.com/repos/{REPO}/releases/tags/{tag}"
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            return data
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise

    # Create new release
    create_url = f"https://api.github.com/repos/{REPO}/releases"
    payload = json.dumps({
        "tag_name": tag,
        "target_commitish": "main",
        "name": title,
        "body": f"Automated cloud asset storage for {title}",
        "draft": False,
        "prerelease": False
    }).encode('utf-8')

    req = urllib.request.Request(create_url, data=payload, headers={**HEADERS, "Content-Type": "application/json"})
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode('utf-8'))

def list_release_assets(release_id: int):
    """Lists all existing assets in a release."""
    url = f"https://api.github.com/repos/{REPO}/releases/{release_id}/assets?per_page=100"
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req) as resp:
            assets = json.loads(resp.read().decode('utf-8'))
            return {a["name"]: a["browser_download_url"] for a in assets}
    except Exception as e:
        print(f"Error listing assets for release {release_id}: {e}")
        return {}

def generate_safe_asset_name(paper: dict) -> str:
    """Generates a clean, unique asset name for GitHub Releases."""
    ext = paper.get("file_type", "pdf").lower()
    raw_name = Path(paper["filename"]).stem
    
    # Clean Latin characters and digits
    clean_latin = re.sub(r'[^a-zA-Z0-9_\-]', '_', raw_name)
    clean_latin = re.sub(r'_+', '_', clean_latin).strip('_')
    
    sem = paper.get("semester_num", "X")
    course = paper.get("course_code", "GEN")
    pid = paper.get("id", "item")
    
    if len(clean_latin) > 3 and not clean_latin.startswith('_'):
        short_name = clean_latin[:45]
        return f"AIOU_S{sem}_{course}_{pid}_{short_name}.{ext}"
    else:
        return f"AIOU_S{sem}_{course}_{pid}.{ext}"

def upload_asset(upload_url_template: str, file_path: Path, asset_name: str, max_retries: int = 3):
    """Uploads file to release upload URL."""
    base_upload_url = upload_url_template.split('{')[0]
    full_url = f"{base_upload_url}?name={urllib.parse.quote(asset_name)}"
    
    ext = file_path.suffix.lower()
    content_type = "application/pdf" if ext == ".pdf" else "application/octet-stream"
    file_bytes = file_path.read_bytes()
    file_len = len(file_bytes)
    
    for attempt in range(1, max_retries + 1):
        try:
            req = urllib.request.Request(
                full_url,
                data=file_bytes,
                headers={
                    **HEADERS,
                    "Content-Type": content_type,
                    "Content-Length": str(file_len)
                }
            )
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                return data.get("browser_download_url")
        except Exception as e:
            print(f"   [Attempt {attempt}/{max_retries}] Upload failed for {asset_name}: {e}")
            if attempt < max_retries:
                time.sleep(2 * attempt)
            else:
                return None

def sync_semesters(target_semesters=None, max_files=None):
    """Syncs non-static papers of specified semesters to GitHub Releases."""
    catalog = load_catalog()
    papers = catalog.get("papers", [])
    
    # Also check the file 1901 Keybook in v1.0-papers
    v1_rel = get_or_create_release("v1.0-papers", "AIOU BS Islamic Studies Past Papers & Keybooks Library")
    v1_assets = list_release_assets(v1_rel["id"])
    
    processed = 0
    updated_count = 0

    for sem_num in ["2", "4", "5", "3", "1"]:
        if target_semesters and sem_num not in target_semesters:
            continue
            
        sem_papers = [p for p in papers if p["semester_num"] == sem_num and not p.get("is_static")]
        # Sort keybooks first, then larger files
        sem_papers = sorted(sem_papers, key=lambda x: (x.get("category_key") != "key_book", -x.get("size_mb", 0)))
        
        if not sem_papers:
            continue
            
        print(f"\n==================================================")
        print(f"Processing Semester {sem_num}: {len(sem_papers)} non-static papers")
        print(f"==================================================")
        
        tag = f"v1.0-papers-sem{sem_num}"
        title = f"AIOU BS Islamic Studies - Semester {sem_num} Papers & Keybooks"
        release = get_or_create_release(tag, title)
        upload_template = release["upload_url"]
        existing_assets = list_release_assets(release["id"])
        
        # Merge existing assets from v1.0-papers if any
        all_known_assets = {**v1_assets, **existing_assets}
        
        for p in sem_papers:
            if max_files and processed >= max_files:
                break
                
            fpath = BASE_DIR / p["rel_path"]
            if not fpath.exists():
                print(f"Skipping missing local file: {p['rel_path']}")
                continue
                
            asset_name = generate_safe_asset_name(p)
            
            # Special check for 1901 Maqasid Shariah Keybook already uploaded
            if "1901" in p["filename"] and "Keybook" in p["filename"] and "1901_Maqasid_Shariah_Keybook_Semester_4.pdf" in v1_assets:
                dl_url = v1_assets["1901_Maqasid_Shariah_Keybook_Semester_4.pdf"]
                print(f"✓ Found existing uploaded: {p['clean_title']} ({p['size_formatted']})")
                p["download_url"] = dl_url
                p["view_url"] = dl_url
                p["cloud_source"] = "github_release"
                p["is_available"] = True
                updated_count += 1
                continue

            if asset_name in all_known_assets:
                dl_url = all_known_assets[asset_name]
                print(f"✓ Asset already in release: {asset_name}")
                p["download_url"] = dl_url
                p["view_url"] = dl_url
                p["cloud_source"] = "github_release"
                p["is_available"] = True
                updated_count += 1
                continue
                
            print(f"-> Uploading ({p['size_formatted']}): {p['clean_title']} ...")
            start_t = time.time()
            dl_url = upload_asset(upload_template, fpath, asset_name)
            elapsed = time.time() - start_t
            
            if dl_url:
                speed_mbps = (p['size_mb'] / elapsed) if elapsed > 0 else 0
                print(f"   ✓ Uploaded in {elapsed:.1f}s ({speed_mbps:.2f} MB/s) -> {dl_url}")
                p["download_url"] = dl_url
                p["view_url"] = dl_url
                p["cloud_source"] = "github_release"
                p["is_available"] = True
                all_known_assets[asset_name] = dl_url
                updated_count += 1
                processed += 1
                save_catalog(catalog)
            else:
                print(f"   ✗ Upload failed for {p['clean_title']}")

    save_catalog(catalog)
    print(f"\n==================================================")
    print(f"Sync complete! Updated {updated_count} papers in catalog.")
    print(f"==================================================")

if __name__ == "__main__":
    targets = sys.argv[1:] if len(sys.argv) > 1 else None
    sync_semesters(targets)
