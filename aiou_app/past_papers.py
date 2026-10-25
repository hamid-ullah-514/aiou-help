import os
import re
import json
import io
import zipfile
import urllib.parse
from pathlib import Path
from typing import Dict, List, Any, Optional

from aiou_app.config import BASE_DIR, KNOWN_COURSES

DATA_DIR = BASE_DIR / "data"
PUBLIC_DIR = BASE_DIR / "public"
INDEX_FILE_DATA = DATA_DIR / "past_papers_index.json"
INDEX_FILE_PUBLIC = PUBLIC_DIR / "past_papers_index.json"

SEMESTER_FOLDER_MAP = {
    "1": "1st semester",
    "2": "2nd semester",
    "3": "3rd semester",
    "4": "4th semester",
    "5": "5th semester"
}

SEMESTER_LABEL_MAP = {
    "1": "سمسٹر 1 (Semester 1)",
    "2": "سمسٹر 2 (Semester 2)",
    "3": "سمسٹر 3 (Semester 3)",
    "4": "سمسٹر 4 (Semester 4)",
    "5": "سمسٹر 5 (Semester 5)"
}

YEARS_FILTER = {"2020", "2021", "2022", "2023", "2024", "2025", "2026", "2027", "2028"}

def detect_course_code_from_filename(filename: str, fallback_sem: str = "1") -> str:
    """Extracts course code (3 or 4 digits) from filename."""
    # Look for patterns like (1919), 1902, Code 1901, Course_Code_1908
    m = re.findall(r'(?<!\d)(\d{3,4})(?!\d)', filename)
    if m:
        candidate_codes = [c for c in m if c not in YEARS_FILTER]
        # Prefer known courses
        for c in candidate_codes:
            if c in KNOWN_COURSES:
                return c
        if candidate_codes:
            return candidate_codes[0]
    return "GENERAL"

def clean_and_categorize_paper(filename: str, course_code: str, sem_num: str) -> Dict[str, Any]:
    """Generates clean Urdu title, season/year, and category for a paper."""
    name_no_ext = re.sub(r'\.(pdf|docx?)$', '', filename, flags=re.I).strip()
    
    # Season & Year detection
    season_ur = ""
    m_season = re.search(r'(spring|autumn|خزاں|بہار)[\s_-]*(\d{2,4})?', name_no_ext, flags=re.I)
    if m_season:
        s_type = m_season.group(1).lower()
        s_year = m_season.group(2) or ""
        if len(s_year) == 2:
            s_year = "20" + s_year
        if "spring" in s_type or "بہار" in s_type:
            season_ur = f"بہار {s_year}".strip()
        else:
            season_ur = f"خزاں {s_year}".strip()
    elif re.search(r'\b(202\d)\b', name_no_ext):
        yr = re.search(r'\b(202\d)\b', name_no_ext).group(1)
        season_ur = f"سال {yr}"

    # Category detection
    nl = name_no_ext.lower()
    cat_key = "past_paper"
    cat_ur = "سابقہ امتحانی پرچہ"
    icon = "📄"

    if "solved" in nl or "حل شدہ" in nl or "solution" in nl or "ans" in nl:
        cat_key = "solved_paper"
        cat_ur = "حل شدہ امتحانی پرچہ"
        icon = "✍️"
    elif "guess" in nl or "guss" in nl or "گیس" in nl:
        cat_key = "guess_paper"
        cat_ur = "امتحانی گیس پیپر"
        icon = "🎯"
    elif "keybook" in nl or "key book" in nl or "کی بک" in nl or "خلاصہ" in nl or "notes" in nl:
        cat_key = "key_book"
        cat_ur = "کی بک و اہم نوٹس"
        icon = "📚"
    elif "quiz" in nl or "mcq" in nl or "معروضی" in nl:
        cat_key = "quiz_mcq"
        cat_ur = "کوئز و معروضی پرچہ"
        icon = "❓"
    elif "assignment" in nl or "مشق" in nl:
        cat_key = "assignment"
        cat_ur = "اسائنمنٹ حل شدہ سوالات"
        icon = "📝"

    # Clean display title
    clean_title = name_no_ext
    # Remove telephone numbers like 03087611772, 03076673113
    clean_title = re.sub(r'03\d{2}[-\s]?\d{7}', '', clean_title)
    clean_title = re.sub(r'\(03\d{2}[-\s]?\d{7}\)', '', clean_title)
    # Remove redundant prefixes
    clean_title = re.sub(r'[-_\s]+', ' ', clean_title).strip()

    course_info = KNOWN_COURSES.get(course_code, {})
    course_title_ur = course_info.get("title_ur", f"کورس {course_code}")

    return {
        "clean_title": clean_title,
        "season_ur": season_ur,
        "category_key": cat_key,
        "category_ur": cat_ur,
        "category_icon": icon,
        "course_title_ur": course_title_ur
    }

def scan_and_build_past_papers_index(force_refresh: bool = False) -> Dict[str, Any]:
    """Scans all 5 semester folders and builds a unified past papers catalog."""
    if not force_refresh:
        for candidate in [INDEX_FILE_DATA, INDEX_FILE_PUBLIC, BASE_DIR / "past_papers_index.json"]:
            if candidate.exists():
                try:
                    with open(candidate, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        if data and "semesters" in data and len(data.get("papers", [])) > 0:
                            return data
                except Exception:
                    pass

    try:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    except Exception:
        pass

    papers = []
    courses_by_sem = {}
    stats_by_category = {}

    idx = 1
    for sem_num, folder_name in SEMESTER_FOLDER_MAP.items():
        sdir = BASE_DIR / folder_name
        courses_by_sem[sem_num] = {}
        if not sdir.exists():
            continue

        for item in sorted(os.listdir(sdir)):
            if not item.lower().endswith(('.pdf', '.docx', '.doc')):
                continue

            fpath = sdir / item
            if not fpath.is_file():
                continue

            size_bytes = fpath.stat().st_size
            size_mb = round(size_bytes / (1024 * 1024), 2)
            ext = fpath.suffix.lower().replace('.', '')

            course_code = detect_course_code_from_filename(item, sem_num)
            meta = clean_and_categorize_paper(item, course_code, sem_num)

            # Record course
            if course_code not in courses_by_sem[sem_num]:
                courses_by_sem[sem_num][course_code] = {
                    "course_code": course_code,
                    "course_title_ur": meta["course_title_ur"],
                    "papers_count": 0
                }
            courses_by_sem[sem_num][course_code]["papers_count"] += 1

            cat_k = meta["category_key"]
            stats_by_category[cat_k] = stats_by_category.get(cat_k, 0) + 1

            paper_id = f"pp_{sem_num}_{course_code}_{idx:04d}"
            rel_path = f"{folder_name}/{item}"

            static_file = BASE_DIR / "public" / "past_papers" / folder_name / item
            is_static = static_file.exists() and static_file.is_file()

            quoted_path = urllib.parse.quote(rel_path)
            quoted_item = urllib.parse.quote(item)
            quoted_folder = urllib.parse.quote(folder_name)

            if is_static:
                v_url = f"/past_papers/{quoted_folder}/{quoted_item}"
                d_url = f"/past_papers/{quoted_folder}/{quoted_item}"
            else:
                v_url = f"/api/pastpapers/file?path={quoted_path}&download=0"
                d_url = f"/api/pastpapers/file?path={quoted_path}&download=1"

            papers.append({
                "id": paper_id,
                "filename": item,
                "clean_title": meta["clean_title"],
                "semester_num": sem_num,
                "semester_name_ur": SEMESTER_LABEL_MAP.get(sem_num, f"سمسٹر {sem_num}"),
                "course_code": course_code,
                "course_title_ur": meta["course_title_ur"],
                "season_ur": meta["season_ur"],
                "category_key": meta["category_key"],
                "category_ur": meta["category_ur"],
                "category_icon": meta["category_icon"],
                "size_mb": size_mb,
                "size_formatted": f"{size_mb} MB" if size_mb >= 1.0 else f"{round(size_bytes / 1024, 1)} KB",
                "file_type": ext,
                "rel_path": rel_path,
                "is_static": is_static,
                "view_url": v_url,
                "download_url": d_url
            })
            idx += 1

    # Structure semester metadata
    semesters_summary = []
    for s_num in ["1", "2", "3", "4", "5"]:
        c_list = list(courses_by_sem.get(s_num, {}).values())
        # Sort courses: known courses first, then numeric order
        c_list = sorted(c_list, key=lambda x: x["course_code"])
        s_papers = [p for p in papers if p["semester_num"] == s_num]
        semesters_summary.append({
            "semester_num": s_num,
            "semester_name_ur": SEMESTER_LABEL_MAP.get(s_num, f"سمسٹر {s_num}"),
            "courses": c_list,
            "papers_count": len(s_papers)
        })

    catalog_data = {
        "success": True,
        "total_papers": len(papers),
        "total_semesters": len(semesters_summary),
        "semesters": semesters_summary,
        "categories_stats": stats_by_category,
        "papers": papers
    }

    # Save to both data/ and public/
    try:
        with open(INDEX_FILE_DATA, "w", encoding="utf-8") as f:
            json.dump(catalog_data, f, ensure_ascii=False, indent=2)
        with open(INDEX_FILE_PUBLIC, "w", encoding="utf-8") as f:
            json.dump(catalog_data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"Warning: Could not save past papers index: {e}")

    return catalog_data

def get_past_papers_catalog() -> Dict[str, Any]:
    """Returns full past papers catalog."""
    return scan_and_build_past_papers_index()

def filter_past_papers(
    semester_num: Optional[str] = None,
    course_code: Optional[str] = None,
    category: Optional[str] = None,
    search_query: Optional[str] = None
) -> List[Dict[str, Any]]:
    """Filters past papers efficiently."""
    catalog = get_past_papers_catalog()
    papers = catalog.get("papers", [])

    if semester_num and str(semester_num).strip():
        sem_str = str(semester_num).strip()
        papers = [p for p in papers if p["semester_num"] == sem_str]

    if course_code and str(course_code).strip() and str(course_code).upper() != "ALL":
        c_str = str(course_code).strip()
        papers = [p for p in papers if p["course_code"] == c_str]

    if category and str(category).strip() and str(category).upper() != "ALL":
        cat_str = str(category).strip()
        papers = [p for p in papers if p["category_key"] == cat_str]

    if search_query and str(search_query).strip():
        q = str(search_query).strip().lower()
        papers = [
            p for p in papers
            if q in p["clean_title"].lower()
            or q in p["filename"].lower()
            or q in p["course_code"].lower()
            or q in p["course_title_ur"].lower()
            or q in p.get("season_ur", "").lower()
        ]

    return papers

def get_paper_file_path(rel_path: str) -> Optional[Path]:
    """Resolves relative file path safely across local directories and public static folder."""
    # Unquote and sanitize path to prevent directory traversal
    clean_p = urllib.parse.unquote(rel_path).replace("\\", "/").lstrip("/")
    if ".." in clean_p:
        return None

    # 1. Check in root directory (local development with all files)
    full_path = BASE_DIR / clean_p
    if full_path.exists() and full_path.is_file():
        return full_path

    # 2. Check in public/past_papers/ (cloud deployed static files)
    static_path = BASE_DIR / "public" / "past_papers" / clean_p
    if static_path.exists() and static_path.is_file():
        return static_path

    return None

def create_batch_zip(paper_ids: List[str]) -> Optional[io.BytesIO]:
    """Creates an in-memory zip archive of the specified papers."""
    catalog = get_past_papers_catalog()
    papers_map = {p["id"]: p for p in catalog.get("papers", [])}

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        added_count = 0
        for pid in paper_ids:
            p_data = papers_map.get(pid)
            if not p_data:
                continue
            fpath = get_paper_file_path(p_data["rel_path"])
            if fpath and fpath.exists():
                # Clean arcname
                arc_name = f"{p_data['course_code']}_{p_data['filename']}"
                zf.write(fpath, arcname=arc_name)
                added_count += 1
        if added_count == 0:
            return None

    zip_buffer.seek(0)
    return zip_buffer
