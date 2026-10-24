import os
import re
import sqlite3
import time
from pathlib import Path
from typing import Dict, List, Any, Optional
try:
    import fitz
except ImportError:
    fitz = None

from aiou_app.config import DB_PATH, DATA_DIR
from aiou_app.catalog import build_or_load_catalog
from aiou_app.normalizer import normalize_urdu
from aiou_app.ocr_engine import get_ocr_engine_status, run_ocr_on_page

ROMAN_NUMERALS = {'i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii'}

def get_db_connection() -> sqlite3.Connection:
    """Returns a connection to the SQLite search index."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con

def init_db(con: sqlite3.Connection):
    """Initializes tables and FTS5 index if they don't exist."""
    cur = con.cursor()
    
    cur.execute("""
    CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        semester_num TEXT,
        course_code TEXT,
        course_title_ur TEXT,
        course_title_en TEXT,
        filename TEXT UNIQUE,
        full_path TEXT,
        pages_count INTEGER,
        is_scanned INTEGER,
        ocr_note TEXT,
        file_mtime REAL,
        file_size INTEGER,
        indexed_at REAL
    );
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS pages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        doc_id INTEGER,
        semester_num TEXT,
        course_code TEXT,
        page_idx INTEGER,
        printed_page_str TEXT,
        is_printed_verified INTEGER,
        raw_text TEXT,
        norm_text TEXT,
        FOREIGN KEY (doc_id) REFERENCES documents (id) ON DELETE CASCADE
    );
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS passages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        page_id INTEGER,
        doc_id INTEGER,
        semester_num TEXT,
        course_code TEXT,
        page_idx INTEGER,
        printed_page_str TEXT,
        block_idx INTEGER,
        line_start INTEGER,
        line_end INTEGER,
        raw_text TEXT,
        norm_text TEXT,
        FOREIGN KEY (doc_id) REFERENCES documents (id) ON DELETE CASCADE
    );
    """)

    cur.execute("CREATE INDEX IF NOT EXISTS idx_passages_sem_code ON passages(semester_num, course_code);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_passages_page ON passages(doc_id, page_idx);")

    # Virtual FTS5 table for lightning fast full text search
    cur.execute("""
    CREATE VIRTUAL TABLE IF NOT EXISTS passages_fts USING fts5(
        norm_text,
        semester_num UNINDEXED,
        course_code UNINDEXED,
        passage_id UNINDEXED,
        page_idx UNINDEXED,
        printed_page UNINDEXED,
        tokenize = 'unicode61'
    );
    """)
    
    con.commit()

def detect_printed_page(page_lines: List[str], page_idx: int, detected_offset: Optional[int]) -> tuple[str, bool, Optional[int]]:
    """
    Detects printed page number from top or bottom lines of a page.
    Returns: (printed_page_str, is_verified, updated_offset)
    """
    if not page_lines:
        if detected_offset is not None and (page_idx - detected_offset) > 0:
            return (str(page_idx - detected_offset), False, detected_offset)
        return (f"PDF {page_idx + 1}", False, detected_offset)

    first_line = page_lines[0].strip()
    last_line = page_lines[-1].strip()

    # Check for standalone digits or Roman numerals in first or last line
    for candidate in [first_line, last_line]:
        cand_clean = candidate.lower()
        if cand_clean in ROMAN_NUMERALS:
            return (cand_clean, True, detected_offset)
        
        # Standalone Arabic or Latin number (e.g. '12' or '۱۵')
        m = re.fullmatch(r'(\d{1,4})', candidate)
        if m:
            num = int(m.group(1))
            # Plausible page number
            if 1 <= num <= 1000 and abs((page_idx + 1) - num) < 60:
                new_offset = page_idx + 1 - num
                return (str(num), True, new_offset)

    # If not directly found on line, use verified offset if available
    if detected_offset is not None:
        calc_page = page_idx + 1 - detected_offset
        if calc_page > 0:
            return (str(calc_page), False, detected_offset)

    return (f"PDF {page_idx + 1}", False, detected_offset)

def index_all_books(force: bool = False, on_progress=None) -> Dict[str, Any]:
    """
    Indexes all 27 books into SQLite database with page and block level tracking.
    Skips books already indexed with matching timestamp & size unless force=True.
    """
    catalog = build_or_load_catalog()
    con = get_db_connection()
    init_db(con)
    cur = con.cursor()

    ocr_status = get_ocr_engine_status()
    total_books = sum(len(s["books"]) for s in catalog["semesters"])
    processed = 0
    skipped = 0
    indexed_new = 0

    start_time = time.time()

    for sem in catalog["semesters"]:
        sem_num = sem["semester_num"]
        for book in sem["books"]:
            processed += 1
            fname = book["filename"]
            fpath = Path(book["full_path"])
            course_code = book["course_code"]
            course_title_ur = book["course_title_ur"]
            course_title_en = book["course_title_en"]
            is_scanned = book["is_scanned"]
            pages_count = book["pages_count"]

            mtime = fpath.stat().st_mtime
            size = fpath.stat().st_size

            # Check if existing in DB
            cur.execute("SELECT id, file_mtime, file_size FROM documents WHERE filename = ?", (fname,))
            existing = cur.fetchone()
            if not force and existing and existing["file_mtime"] == mtime and existing["file_size"] == size:
                skipped += 1
                if on_progress:
                    on_progress(processed, total_books, fname, "Skipped (already cached)")
                continue

            # Delete old records if re-indexing this file
            if existing:
                doc_id = existing["id"]
                cur.execute("DELETE FROM passages_fts WHERE doc_id = ?", (str(doc_id),))
                cur.execute("DELETE FROM passages WHERE doc_id = ?", (doc_id,))
                cur.execute("DELETE FROM pages WHERE doc_id = ?", (doc_id,))
                cur.execute("DELETE FROM documents WHERE id = ?", (doc_id,))

            ocr_note = ""
            if is_scanned:
                ocr_note = "کتاب اسکین شدہ فارمیٹ میں ہے۔ (Scanned PDF)"
                if not ocr_status["supports_urdu_ocr"]:
                    ocr_note += " نوٹ: مکمل عبارت کیلیے اردو OCR درکار ہے۔"

            cur.execute("""
            INSERT INTO documents (
                semester_num, course_code, course_title_ur, course_title_en,
                filename, full_path, pages_count, is_scanned, ocr_note,
                file_mtime, file_size, indexed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                sem_num, course_code, course_title_ur, course_title_en,
                fname, str(fpath), pages_count, 1 if is_scanned else 0,
                ocr_note, mtime, size, time.time()
            ))
            doc_id = cur.lastrowid

            if on_progress:
                on_progress(processed, total_books, fname, f"Indexing {pages_count} pages...")

            # Extract pages from PDF
            if fpath.suffix.lower() == '.pdf':
                try:
                    doc = fitz.open(fpath)
                    detected_offset = None
                    
                    page_rows = []
                    passage_rows = []
                    fts_rows = []

                    for pidx in range(len(doc)):
                        page = doc[pidx]
                        blocks = page.get_text("blocks")
                        
                        raw_page_text = page.get_text("text").strip()
                        norm_page_text = normalize_urdu(raw_page_text)
                        
                        # Detect page number
                        page_lines = [l.strip() for l in raw_page_text.splitlines() if l.strip()]
                        printed_pg_str, is_verified, detected_offset = detect_printed_page(
                            page_lines, pidx, detected_offset
                        )

                        page_rows.append((
                            doc_id, sem_num, course_code, pidx,
                            printed_pg_str, 1 if is_verified else 0,
                            raw_page_text, norm_page_text
                        ))

                        # Process individual blocks
                        line_counter = 1
                        for b_idx, block in enumerate(blocks):
                            b_text = block[4].strip()
                            # Filter out empty or pure punctuation blocks
                            if len(b_text) < 2:
                                continue
                                
                            b_norm = normalize_urdu(b_text)
                            b_lines = b_text.splitlines()
                            line_start = line_counter
                            line_end = line_counter + len(b_lines) - 1
                            line_counter += len(b_lines)

                            # Only index meaningful passages
                            if len(b_norm) > 10:
                                passage_rows.append((
                                    doc_id, sem_num, course_code, pidx,
                                    printed_pg_str, b_idx, line_start, line_end,
                                    b_text, b_norm
                                ))

                    doc.close()

                    # Batch insert pages
                    cur.executemany("""
                    INSERT INTO pages (
                        doc_id, semester_num, course_code, page_idx,
                        printed_page_str, is_printed_verified, raw_text, norm_text
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """, page_rows)

                    # Query back page_ids for this doc
                    cur.execute("SELECT id, page_idx FROM pages WHERE doc_id = ?", (doc_id,))
                    page_id_map = {row["page_idx"]: row["id"] for row in cur.fetchall()}

                    # Prepare passage records with page_id
                    passage_insert_rows = []
                    for p in passage_rows:
                        # p: (doc_id, sem_num, course_code, pidx, printed_pg_str, b_idx, line_start, line_end, b_text, b_norm)
                        pg_id = page_id_map.get(p[3], 0)
                        passage_insert_rows.append((
                            pg_id, p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7], p[8], p[9]
                        ))

                    cur.executemany("""
                    INSERT INTO passages (
                        page_id, doc_id, semester_num, course_code, page_idx,
                        printed_page_str, block_idx, line_start, line_end,
                        raw_text, norm_text
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, passage_insert_rows)

                    # Now populate FTS
                    cur.execute("""
                    INSERT INTO passages_fts (
                        rowid, norm_text, semester_num, course_code, passage_id, page_idx, printed_page
                    ) SELECT id, norm_text, semester_num, course_code, id, page_idx, printed_page_str
                      FROM passages WHERE doc_id = ?
                    """, (doc_id,))

                    con.commit()
                    indexed_new += 1
                except Exception as e:
                    con.rollback()
                    print(f"Error indexing {fname}: {e}")

    con.close()
    elapsed = round(time.time() - start_time, 2)
    return {
        "total_books": total_books,
        "processed": processed,
        "indexed_new": indexed_new,
        "skipped": skipped,
        "elapsed_seconds": elapsed,
        "db_path": str(DB_PATH)
    }

def get_indexing_stats() -> Dict[str, Any]:
    """Returns statistics about current search index."""
    if not DB_PATH.exists():
        return {"indexed": False, "documents_count": 0, "passages_count": 0}
        
    con = get_db_connection()
    cur = con.cursor()
    try:
        cur.execute("SELECT COUNT(*) FROM documents;")
        docs = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM pages;")
        pages = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM passages;")
        passages = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM passages_fts;")
        fts_count = cur.fetchone()[0]
        con.close()
        return {
            "indexed": docs > 0,
            "documents_count": docs,
            "pages_count": pages,
            "passages_count": passages,
            "fts_indexed_passages": fts_count,
            "db_size_mb": round(DB_PATH.stat().st_size / (1024 * 1024), 2)
        }
    except Exception as e:
        con.close()
        return {"indexed": False, "error": str(e)}
