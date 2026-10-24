import os
import re
import json
from pathlib import Path
from typing import Dict, List, Any
try:
    import fitz
except ImportError:
    fitz = None

from aiou_app.config import BASE_DIR, CATALOG_CACHE_PATH, KNOWN_COURSES

SEMESTER_LABEL_MAP = {
    "1": "سمسٹر 1 (Semester 1)",
    "2": "سمسٹر 2 (Semester 2)",
    "3": "سمسٹر 3 (Semester 3)",
    "4": "سمسٹر 4 (Semester 4)",
    "5": "سمسٹر 5 (Semester 5)"
}

def detect_semester_number(folder_name: str) -> str:
    """Extracts semester number from folder name like '1st semster book' -> '1'."""
    m = re.search(r'(\d+)', folder_name)
    if m:
        return m.group(1)
    return folder_name

def extract_course_code_from_filename(filename: str) -> str:
    """Extracts course code like '1902.pdf' -> '1902', '4931 Urdu Version.pdf' -> '4931'."""
    m = re.search(r'(\d{4})', filename)
    if m:
        return m.group(1)
    return "UNKNOWN"

def build_or_load_catalog(force_refresh: bool = False) -> Dict[str, Any]:
    """
    Discovers all semester folders and book files from real directory.
    Caches results to disk.
    """
    if not force_refresh and CATALOG_CACHE_PATH.exists():
        try:
            with open(CATALOG_CACHE_PATH, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass

    catalog = {
        "program": "BS Islamic Studies 2.5-Year Program (AIOU)",
        "program_ur": "بی ایس اسلامیات 2.5 سالہ پروگرام (علامہ اقبال اوپن یونیورسٹی)",
        "semesters": []
    }

    # Find semester folders
    sem_dirs = []
    for item in os.listdir(BASE_DIR):
        p = BASE_DIR / item
        if p.is_dir() and ('semster' in item.lower() or 'semester' in item.lower()):
            sem_dirs.append(p)
            
    # Sort folders naturally (1st, 2nd, 3rd...)
    sem_dirs = sorted(sem_dirs, key=lambda p: int(re.search(r'\d+', p.name).group(0)) if re.search(r'\d+', p.name) else 99)

    for sdir in sem_dirs:
        sem_num = detect_semester_number(sdir.name)
        sem_label = SEMESTER_LABEL_MAP.get(sem_num, f"سمسٹر {sem_num} (Semester {sem_num})")
        
        books_list = []
        for f in sorted(os.listdir(sdir)):
            if not f.lower().endswith(('.pdf', '.docx', '.doc')):
                continue
                
            fpath = sdir / f
            file_size_mb = round(fpath.stat().st_size / (1024 * 1024), 2)
            course_code = extract_course_code_from_filename(f)
            
            # Lookup metadata
            info = KNOWN_COURSES.get(course_code, {})
            course_title_ur = info.get("title_ur", f"کورس {course_code}")
            course_title_en = info.get("title_en", f"Course {course_code}")
            
            # Quick check if scanned or has selectable text
            pages_count = 0
            has_text = False
            is_scanned = False
            
            if f.lower().endswith('.pdf') and fitz is not None:
                try:
                    doc = fitz.open(fpath)
                    pages_count = len(doc)
                    # Check first 5 pages for text
                    sample_txt = ""
                    for i in range(min(5, pages_count)):
                        sample_txt += doc[i].get_text()
                    has_text = len(sample_txt.strip()) > 40
                    is_scanned = not has_text
                    doc.close()
                except Exception as e:
                    has_text = False
                    is_scanned = True
            
            books_list.append({
                "course_code": course_code,
                "course_title_ur": course_title_ur,
                "course_title_en": course_title_en,
                "filename": f,
                "relative_path": str(fpath.relative_to(BASE_DIR)),
                "full_path": str(fpath),
                "size_mb": file_size_mb,
                "pages_count": pages_count,
                "has_selectable_text": has_text,
                "is_scanned": is_scanned
            })
            
        catalog["semesters"].append({
            "semester_id": f"semester_{sem_num}",
            "semester_num": sem_num,
            "semester_name_ur": sem_label,
            "folder_name": sdir.name,
            "books_count": len(books_list),
            "books": books_list
        })

    # Save to cache
    CATALOG_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(CATALOG_CACHE_PATH, 'w', encoding='utf-8') as f:
        json.dump(catalog, f, ensure_ascii=False, indent=2)

    return catalog
