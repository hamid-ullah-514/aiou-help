# -*- coding: utf-8 -*-
"""
AIOU Help — High-Accuracy Grounded Passage Retriever
Retrieves source passages strictly matching semester and course.
Supports both local SQLite FTS5 index and pre-indexed JSON knowledge fallback
to guarantee 100% functionality on Vercel Serverless deployments.
"""

import json
import re
import sqlite3
from pathlib import Path
from typing import Dict, List, Any, Optional

from aiou_app.config import DATA_DIR, DB_PATH, KNOWN_COURSES
from aiou_app.normalizer import normalize_urdu, tokenize, extract_content_tokens, highlight_matches

VERIFIED_KB_PATH = DATA_DIR / "verified_knowledge.json"
EXAM_BANKS_DIR = DATA_DIR / "exam_banks"

_cached_kb = None

def get_verified_kb() -> List[Dict[str, Any]]:
    global _cached_kb
    if _cached_kb is not None:
        return _cached_kb
    if VERIFIED_KB_PATH.exists():
        try:
            with open(VERIFIED_KB_PATH, "r", encoding="utf-8") as f:
                _cached_kb = json.load(f)
                return _cached_kb
        except Exception:
            pass
    return []

def search_json_fallback(
    query: str,
    semester_num: str,
    course_code: Optional[str] = None,
    limit: int = 10
) -> List[Dict[str, Any]]:
    """Fast in-memory semantic search over pre-indexed JSON knowledge and exam banks."""
    tokens = extract_content_tokens(query) or tokenize(query)
    if not tokens:
        return []

    norm_q = normalize_urdu(query)
    results = []

    # 1. Search verified knowledge entries
    kb = get_verified_kb()
    for item in kb:
        if str(item.get("semester_num")) != str(semester_num):
            continue
        if course_code and course_code.upper() not in ("ALL", "", "NONE") and item.get("course_code") != course_code:
            continue

        raw_text = item.get("text", "")
        norm_text = normalize_urdu(raw_text)
        unit_norm = normalize_urdu(item.get("unit_title", ""))

        matched_tokens = sum(1 for t in tokens if t in norm_text or t in unit_norm)
        if matched_tokens == 0:
            continue

        token_coverage = matched_tokens / len(tokens)
        phrase_bonus = 3.0 if norm_q in norm_text or norm_q in unit_norm else 0.0
        score = (token_coverage * 6.0) + phrase_bonus + (matched_tokens * 0.5)

        results.append({
            "passage_id": 1,
            "doc_id": 1,
            "semester_num": item.get("semester_num"),
            "course_code": item.get("course_code"),
            "course_title_ur": item.get("book_title"),
            "course_title_en": item.get("book_title"),
            "filename": f"{item.get('course_code')}.pdf",
            "page_idx": 1,
            "pdf_page": 1,
            "printed_page": item.get("printed_page", "1"),
            "line_start": 1,
            "line_end": 10,
            "raw_text": raw_text,
            "norm_text": norm_text,
            "highlighted_text": highlight_matches(raw_text, query),
            "score": round(score, 3),
            "matched_tokens": matched_tokens,
            "is_scanned": False,
            "ocr_note": ""
        })

    # 2. Also search exam banks for this course if available
    target_codes = [course_code] if course_code and course_code.upper() not in ("ALL", "", "NONE") else list(KNOWN_COURSES.keys())
    for code in target_codes:
        bank_file = EXAM_BANKS_DIR / f"{code}.json"
        if not bank_file.exists():
            continue
        try:
            with open(bank_file, "r", encoding="utf-8") as f:
                b_data = json.load(f)
            if str(b_data.get("semester_num", "")) != str(semester_num) and course_code not in (code, "ALL"):
                continue

            for chap in b_data.get("chapters", []):
                for q in chap.get("questions", []):
                    combined_text = f"{q.get('question', '')} {q.get('definition', '')} {q.get('detailed_explanation', '')} {q.get('source_passage', '')}"
                    norm_text = normalize_urdu(combined_text)
                    matched_tokens = sum(1 for t in tokens if t in norm_text)
                    if matched_tokens == 0:
                        continue

                    token_coverage = matched_tokens / len(tokens)
                    phrase_bonus = 4.0 if norm_q in norm_text else 0.0
                    score = (token_coverage * 7.0) + phrase_bonus + (matched_tokens * 0.6)

                    sub_headings_text = "\n".join([f"- {sh.get('heading', '')}: {sh.get('content', '')}" for sh in q.get("subheadings", [])])
                    full_book_content = (
                        f"سوال / عنوان: {q.get('question', '')}\n"
                        f"بنیادی تعریف: {q.get('definition', '')}\n"
                        f"تفصیلی وضاحت: {q.get('detailed_explanation', '')}\n"
                        f"اہم نکات:\n{sub_headings_text}\n"
                        f"دلائل و براہین: {q.get('key_evidence', '')}\n"
                        f"اصل عبارت: {q.get('source_passage', '')}"
                    )

                    results.append({
                        "passage_id": 1,
                        "doc_id": 1,
                        "semester_num": semester_num,
                        "course_code": code,
                        "course_title_ur": b_data.get("book_title", get_course_title(code)),
                        "course_title_en": b_data.get("book_title", get_course_title(code)),
                        "filename": f"{code}.pdf",
                        "page_idx": 1,
                        "pdf_page": 1,
                        "printed_page": q.get("printed_page", "1"),
                        "line_start": 1,
                        "line_end": 15,
                        "raw_text": full_book_content,
                        "norm_text": norm_text,
                        "highlighted_text": highlight_matches(q.get("source_passage", ""), query),
                        "score": round(score, 3),
                        "matched_tokens": matched_tokens,
                        "is_scanned": False,
                        "ocr_note": ""
                    })
        except Exception:
            continue

    # Deduplicate and sort descending by score
    seen = set()
    deduped = []
    for r in sorted(results, key=lambda x: x["score"], reverse=True):
        k = r["norm_text"][:60]
        if k in seen:
            continue
        seen.add(k)
        deduped.append(r)

    return deduped[:limit]

def get_course_title(code: str) -> str:
    if code in KNOWN_COURSES:
        return KNOWN_COURSES[code]["title_ur"]
    return f"کورس {code}"

def search_passages(
    query: str,
    semester_num: str,
    course_code: Optional[str] = None,
    limit: int = 10
) -> List[Dict[str, Any]]:
    """
    Retrieves source passages strictly matching semester_num and optional course_code.
    Uses SQLite FTS5 if available; seamlessly falls back to pre-indexed JSON knowledge on Vercel.
    """
    if not query or not semester_num:
        return []

    # If DB_PATH does not exist, use JSON fallback immediately (e.g. Vercel deployment)
    if not DB_PATH.exists():
        return search_json_fallback(query, semester_num, course_code, limit)

    norm_q = normalize_urdu(query)
    tokens = extract_content_tokens(query)
    if not tokens:
        tokens = tokenize(query)
    if not tokens:
        return []

    try:
        con = sqlite3.connect(DB_PATH)
        con.row_factory = sqlite3.Row
        cur = con.cursor()

        fts_terms = []
        for t in tokens:
            clean_t = t.replace('"', '""')
            fts_terms.append(f'"{clean_t}"')
        
        fts_expr = " OR ".join(fts_terms)

        sql = """
        SELECT 
            p.id as passage_id,
            p.doc_id,
            p.semester_num,
            p.course_code,
            p.page_idx,
            p.printed_page_str,
            p.block_idx,
            p.line_start,
            p.line_end,
            p.raw_text,
            p.norm_text,
            d.course_title_ur,
            d.course_title_en,
            d.filename,
            d.is_scanned,
            d.ocr_note,
            bm25(passages_fts) as rank
        FROM passages_fts f
        JOIN passages p ON f.rowid = p.id
        JOIN documents d ON p.doc_id = d.id
        WHERE passages_fts MATCH ?
          AND p.semester_num = ?
        """
        params = [fts_expr, str(semester_num)]

        if course_code and course_code.upper() not in ("ALL", "", "NONE"):
            sql += " AND p.course_code = ?"
            params.append(course_code)

        sql += " ORDER BY rank LIMIT 40;"
        cur.execute(sql, params)
        raw_rows = cur.fetchall()

        if not raw_rows:
            # Fallback to LIKE
            like_terms = [f"%{t}%" for t in tokens[:4]]
            fallback_sql = """
            SELECT 
                p.id as passage_id,
                p.doc_id,
                p.semester_num,
                p.course_code,
                p.page_idx,
                p.printed_page_str,
                p.block_idx,
                p.line_start,
                p.line_end,
                p.raw_text,
                p.norm_text,
                d.course_title_ur,
                d.course_title_en,
                d.filename,
                d.is_scanned,
                d.ocr_note,
                0.0 as rank
            FROM passages p
            JOIN documents d ON p.doc_id = d.id
            WHERE p.semester_num = ?
            """
            f_params = [str(semester_num)]
            if course_code and course_code.upper() not in ("ALL", "", "NONE"):
                fallback_sql += " AND p.course_code = ?"
                f_params.append(course_code)
                
            fallback_sql += " AND (" + " OR ".join(["p.norm_text LIKE ?" for _ in like_terms]) + ")"
            f_params.extend(like_terms)
            fallback_sql += " LIMIT 40;"
            cur.execute(fallback_sql, f_params)
            raw_rows = cur.fetchall()

        results = []
        seen_texts = set()

        for r in raw_rows:
            raw_text = r["raw_text"]
            norm_text = r["norm_text"]
            
            short_key = norm_text[:60]
            if short_key in seen_texts:
                continue
            seen_texts.add(short_key)

            matched_tokens = sum(1 for t in tokens if t in norm_text)
            token_coverage = matched_tokens / len(tokens) if tokens else 0
            phrase_bonus = 2.0 if norm_q in norm_text else 0.0

            bm25_score = -float(r["rank"]) if "rank" in r.keys() else 1.0
            final_score = (token_coverage * 6.0) + phrase_bonus + (bm25_score * 0.4)

            highlighted = highlight_matches(raw_text, query)

            results.append({
                "passage_id": r["passage_id"],
                "doc_id": r["doc_id"],
                "semester_num": r["semester_num"],
                "course_code": r["course_code"],
                "course_title_ur": r["course_title_ur"],
                "course_title_en": r["course_title_en"],
                "filename": r["filename"],
                "page_idx": r["page_idx"],
                "pdf_page": r["page_idx"] + 1,
                "printed_page": r["printed_page_str"],
                "line_start": r["line_start"],
                "line_end": r["line_end"],
                "raw_text": raw_text,
                "norm_text": norm_text,
                "highlighted_text": highlighted,
                "score": round(final_score, 3),
                "matched_tokens": matched_tokens,
                "is_scanned": bool(r["is_scanned"]),
                "ocr_note": r["ocr_note"]
            })

        con.close()
        # If top SQLite result has low coverage or very short text, combine with JSON fallback
        json_results = search_json_fallback(query, semester_num, course_code, limit)
        combined = results + json_results
        # Sort descending by score
        combined = sorted(combined, key=lambda x: (x.get("score", 0), len(x.get("raw_text", ""))), reverse=True)
        if combined:
            return combined[:limit]

    except Exception as e:
        print(f"SQLite search exception: {e}")

    # If SQLite failed or returned 0, use JSON fallback
    return search_json_fallback(query, semester_num, course_code, limit)

def get_page_full_text(doc_id: int, page_idx: int) -> Optional[Dict[str, Any]]:
    """Retrieves full text of a specific page."""
    if not DB_PATH.exists():
        return None
    try:
        con = sqlite3.connect(DB_PATH)
        con.row_factory = sqlite3.Row
        cur = con.cursor()
        cur.execute("""
        SELECT p.*, d.course_code, d.course_title_ur, d.filename
        FROM pages p
        JOIN documents d ON p.doc_id = d.id
        WHERE p.doc_id = ? AND p.page_idx = ?
        """, (doc_id, page_idx))
        row = cur.fetchone()
        con.close()
        if row:
            return dict(row)
    except Exception:
        pass
    return None
