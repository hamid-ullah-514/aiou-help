# -*- coding: utf-8 -*-
"""
AIOU Help — Comprehensive Verification & Deployment Readiness Test Suite
Verifies all 4 primary features, detailed answer completeness, copy formatting,
API status codes, and Vercel cloud deployment compliance.
"""

import sys
import os
import json
import unittest
from pathlib import Path
from fastapi.testclient import TestClient

sys.stdout.reconfigure(encoding='utf-8')

# Ensure root directory is in sys.path
BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from aiou_app.server import app

client = TestClient(app)

class TestAIOUHelpComplete(unittest.TestCase):

    def test_01_root_and_assets(self):
        """Test root serves index.html and static assets properly."""
        r = client.get("/")
        self.assertEqual(r.status_code, 200)
        self.assertIn("AIOU Help", r.text)
        self.assertIn("علامہ اقبال اوپن یونیورسٹی", r.text)
        self.assertIn('dir="rtl"', r.text)

        r_css = client.get("/style.css")
        self.assertEqual(r_css.status_code, 200)
        self.assertIn("--primary", r_css.text)

        r_js = client.get("/app.js")
        self.assertEqual(r_js.status_code, 200)
        self.assertIn("handleExamGenerate", r_js.text)
        self.assertIn("copyToClipboard", r_js.text)

    def test_02_catalog_completeness(self):
        """Test catalog discovers all 5 semesters and all 27 courses."""
        r = client.get("/api/catalog")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIn("semesters", data)
        semesters = data["semesters"]
        self.assertEqual(len(semesters), 5, "Must have exactly 5 semesters")

        total_books = sum(len(s.get("books", [])) for s in semesters)
        self.assertEqual(total_books, 27, "Must have exactly 27 authentic books")

    def test_03_feature_1_ask_question_grounded(self):
        """Test Feature 1: Ask question retrieves authentic book citations."""
        r = client.post("/api/ask", json={
            "question": "غزوہ کی تعریف اور اس کا مفہوم بیان کریں",
            "semester_num": "1",
            "course_code": "4934",
            "mode": "explanation"
        })
        self.assertEqual(r.status_code, 200)
        res = r.json()
        self.assertTrue(res.get("success"), "Should succeed for grounded query")
        self.assertEqual(res.get("course_code"), "4934")
        self.assertIn("سیرت", res.get("book_title"))
        self.assertTrue(len(res.get("answer", "")) > 100)
        self.assertTrue(len(res.get("references", [])) > 0)

    def test_04_feature_1_exact_mode(self):
        """Test Feature 1 exact quote mode returns verbatim book text."""
        r = client.post("/api/ask", json={
            "question": "غزوہ",
            "semester_num": "1",
            "course_code": "4934",
            "mode": "exact"
        })
        self.assertEqual(r.status_code, 200)
        res = r.json()
        self.assertEqual(res.get("mode"), "exact")
        self.assertTrue(len(res.get("primary_quote", "")) > 10)

    def test_05_feature_1_anti_hallucination(self):
        """Test Feature 1 rejects ungrounded / irrelevant queries without hallucination."""
        r = client.post("/api/ask", json={
            "question": "کوانٹم مکینکس اور نیوکلیئر فزکس کے جدید تجربات اور اصول",
            "semester_num": "1",
            "course_code": "4934",
            "mode": "explanation"
        })
        self.assertEqual(r.status_code, 200)
        res = r.json()
        self.assertTrue(res.get("not_found"), "Must return not_found for out-of-syllabus query")
        self.assertIn("مستند جواب نہیں ملا", res.get("answer"))

    def test_06_feature_2_exam_prep_course_1902(self):
        """Test Feature 2: Course 1902 generates 9 chapters with complete, readable model answers."""
        r = client.post("/api/exam/questions", json={
            "course_code": "1902",
            "count_per_chapter": 3
        })
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data.get("course_code"), "1902")
        self.assertIn("مذاہب", data.get("book_title"))
        self.assertEqual(data.get("total_chapters"), 9)
        self.assertEqual(data.get("total_questions"), 27)

        # Inspect Question 1 of Chapter 1
        chap1 = data["chapters"][0]
        self.assertEqual(len(chap1["questions"]), 3)
        q1 = chap1["questions"][0]

        # Verify all 7 parts of the educational model answer are complete and non-empty
        self.assertTrue(len(q1.get("introduction", "")) > 50, "Introduction must be detailed")
        self.assertTrue(len(q1.get("definition", "")) > 30, "Definition must be detailed")
        self.assertTrue(len(q1.get("detailed_explanation", "")) > 80, "Detailed explanation must be present")
        self.assertTrue(len(q1.get("subheadings", [])) >= 3, "Must have at least 3 subheadings")
        self.assertTrue(len(q1.get("key_evidence", "")) > 20, "Evidence citations must be present")
        self.assertTrue(len(q1.get("conclusion", "")) > 30, "Conclusion must be present")
        self.assertTrue(len(q1.get("printed_page", "")) > 0, "Printed page must be specified")

    def test_07_feature_2_exam_prep_counts(self):
        """Test Feature 2 with 4 and 5 questions per chapter."""
        r4 = client.post("/api/exam/questions", json={"course_code": "4934", "count_per_chapter": 4})
        self.assertEqual(r4.status_code, 200)
        d4 = r4.json()
        self.assertEqual(d4["total_questions"], 36)

        r5 = client.post("/api/exam/questions", json={"course_code": "1913", "count_per_chapter": 5})
        self.assertEqual(r5.status_code, 200)
        d5 = r5.json()
        self.assertEqual(d5["total_questions"], 45)

    def test_08_feature_3_chapter_mcqs_generation(self):
        """Test Feature 3: Chapter MCQs generated with 4 options and verified answers."""
        r = client.post("/api/exam/mcqs", json={
            "course_code": "1902",
            "count_per_chapter": 10
        })
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data.get("course_code"), "1902")
        self.assertEqual(data.get("total_chapters"), 9)
        self.assertEqual(data.get("total_mcqs"), 90)

        chap1 = data["chapters"][0]
        self.assertEqual(len(chap1["mcqs"]), 10)
        m1 = chap1["mcqs"][0]
        self.assertIn("question", m1)
        self.assertIn("A", m1.get("options", {}))
        self.assertIn("B", m1.get("options", {}))
        self.assertIn("C", m1.get("options", {}))
        self.assertIn("D", m1.get("options", {}))
        self.assertIn(m1.get("correct_option"), ("A", "B", "C", "D"))
        self.assertTrue(len(m1.get("explanation", "")) > 10)
        self.assertTrue(len(m1.get("printed_page", "")) > 0)

    def test_09_feature_3_mcq_counts(self):
        """Test Feature 3 with 15, 20, 25 MCQs per chapter."""
        for count, expected_total in [(15, 135), (20, 180), (25, 225)]:
            r = client.post("/api/exam/mcqs", json={"course_code": "4934", "count_per_chapter": count})
            self.assertEqual(r.status_code, 200)
            d = r.json()
            self.assertEqual(d["total_mcqs"], expected_total)

    def test_10_feature_4_quiz_lookup_solver(self):
        """Test Feature 4: Quiz Answer Lookup correctly identifies verified answer."""
        r = client.post("/api/mcq", json={
            "question": "اصطلاحاً غزوہ سے کیا مراد ہے؟",
            "option_a": "وہ جنگ جس میں نبی کریم ﷺ نے بنفسِ نفیس شرکت فرمائی",
            "option_b": "وہ جنگ جس میں صرف صحابہ کرام شریک ہوئے",
            "option_c": "کوئی بھی معمولی قبائلی جھڑپ",
            "option_d": "شہر کے گرد خندق کھودنا",
            "semester_num": "1",
            "course_code": "4934"
        })
        self.assertEqual(r.status_code, 200)
        res = r.json()
        self.assertTrue(res.get("success"))
        self.assertEqual(res.get("correct_option"), "A", "Correct option must be A for Ghazwa")
        self.assertIn("شرکت", res.get("correct_text", ""))
        self.assertIn("4934", res.get("course_code", ""))

    def test_11_vercel_deployment_files(self):
        """Test all Vercel deployment files exist and are valid."""
        v_json_path = BASE_DIR / "vercel.json"
        self.assertTrue(v_json_path.exists(), "vercel.json must exist")
        with open(v_json_path, "r", encoding="utf-8") as f:
            v_cfg = json.load(f)
            self.assertIn("rewrites", v_cfg)

        api_entry = BASE_DIR / "api" / "index.py"
        self.assertTrue(api_entry.exists(), "api/index.py must exist")

        req_txt = BASE_DIR / "requirements.txt"
        self.assertTrue(req_txt.exists(), "requirements.txt must exist")
        with open(req_txt, "r", encoding="utf-8") as f:
            req_content = f.read()
            self.assertIn("fastapi", req_content)
            self.assertIn("uvicorn", req_content)

        gitignore = BASE_DIR / ".gitignore"
        self.assertTrue(gitignore.exists(), ".gitignore must exist")
        with open(gitignore, "r", encoding="utf-8") as f:
            gi_content = f.read()
            self.assertIn("aiou_search.db", gi_content)
            self.assertIn("*.pdf", gi_content)

        env_example = BASE_DIR / ".env.example"
        self.assertTrue(env_example.exists(), ".env.example must exist")

    def test_12_json_banks_coverage(self):
        """Test all 27 courses have pre-compiled Exam and MCQ banks in data/."""
        exam_dir = BASE_DIR / "data" / "exam_banks"
        mcq_dir = BASE_DIR / "data" / "mcq_banks"

        self.assertTrue(exam_dir.exists())
        self.assertTrue(mcq_dir.exists())

        exam_files = list(exam_dir.glob("*.json"))
        mcq_files = list(mcq_dir.glob("*.json"))

        self.assertEqual(len(exam_files), 27, "Must have exam banks for all 27 courses")
        self.assertEqual(len(mcq_files), 27, "Must have MCQ banks for all 27 courses")

if __name__ == "__main__":
    unittest.main()
