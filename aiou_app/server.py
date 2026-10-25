import os
from typing import Dict, List, Any, Optional
from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from aiou_app.config import STATIC_DIR, HOST, PORT
from aiou_app.catalog import build_or_load_catalog
from aiou_app.indexer import get_indexing_stats, index_all_books
from aiou_app.ocr_engine import get_ocr_engine_status
from aiou_app.ai_service import get_ai_service_status
from aiou_app.retriever import search_passages, get_page_full_text
from aiou_app.qa_engine import answer_question, solve_mcq, format_clipboard_text, solve_image_questions, solve_unified_mcq
from aiou_app.exam_engine import get_course_units, generate_exam_questions, generate_chapter_mcqs

app = FastAPI(
    title="AIOU Help — AI-Powered Book-Based Study Assistant",
    description="Educational AI assistant answering strictly from AIOU BS Islamic Studies study materials.",
    version="1.0.0"
)

# Enable CORS for local testing
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def vercel_path_middleware(request, call_next):
    """
    Ensures seamless routing both locally and on Vercel Serverless environment.
    If rewritten via vercel.json with ?path=..., maps path to scope['path'].
    """
    path_param = request.query_params.get("path")
    if path_param:
        clean_path = "/" + path_param.lstrip("/")
        if len(clean_path) > 1 and clean_path.endswith("/"):
            clean_path = clean_path[:-1]
        request.scope["path"] = clean_path
    else:
        cur_path = request.scope.get("path", "")
        if cur_path.endswith(".py") or "index.py" in cur_path:
            fwd = request.headers.get("x-forwarded-uri")
            if fwd and not fwd.endswith(".py"):
                raw_fwd = fwd.split("?")[0]
                if len(raw_fwd) > 1 and raw_fwd.endswith("/"):
                    raw_fwd = raw_fwd[:-1]
                request.scope["path"] = raw_fwd
    return await call_next(request)

# Mount static files
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# Request Models
class AskRequest(BaseModel):
    question: str
    semester_num: str
    course_code: Optional[str] = None
    mode: str = "explanation"  # "exact" or "explanation"

class MCQRequest(BaseModel):
    question: Optional[str] = None
    option_a: Optional[str] = None
    option_b: Optional[str] = None
    option_c: Optional[str] = None
    option_d: Optional[str] = None
    options: Optional[Dict[str, str]] = None
    raw_text: Optional[str] = None
    image_b64: Optional[str] = None
    mime_type: str = "image/jpeg"
    semester_num: str
    course_code: Optional[str] = None

class CopyRequest(BaseModel):
    data: Dict[str, Any]
    include_references: bool = True

class ExamPrepRequest(BaseModel):
    course_code: str
    count_per_chapter: int = 3  # 3, 4, or 5

class ChapterMCQRequest(BaseModel):
    course_code: str
    count_per_chapter: int = 10  # 10, 15, 20, or 25

class ImageAskRequest(BaseModel):
    image_b64: str
    semester_num: str
    course_code: Optional[str] = None
    mime_type: str = "image/jpeg"

class AssignmentRequest(BaseModel):
    semester_num: str
    course_code: str
    assignment_num: str = "1"  # "1" or "2"
    questions: Optional[List[str]] = None
    raw_text: Optional[str] = None
    image_b64: Optional[str] = None
    mime_type: str = "image/jpeg"

@app.get("/")
def get_index():
    index_file = STATIC_DIR / "index.html"
    if not index_file.exists():
        raise HTTPException(status_code=404, detail="Index file not found")
    return FileResponse(str(index_file))

@app.get("/style.css")
def get_style_css():
    css_file = STATIC_DIR / "style.css"
    if css_file.exists():
        return FileResponse(str(css_file), media_type="text/css")
    raise HTTPException(status_code=404, detail="style.css not found")

@app.get("/app.js")
def get_app_js():
    js_file = STATIC_DIR / "app.js"
    if js_file.exists():
        return FileResponse(str(js_file), media_type="application/javascript")
    raise HTTPException(status_code=404, detail="app.js not found")

@app.get("/api/catalog")
@app.get("/catalog")
def get_catalog_api():
    """Returns dynamic semesters and courses discovered from workspace folders."""
    try:
        catalog = build_or_load_catalog()
        return catalog
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/status")
@app.get("/status")
def get_status_api():
    """Returns comprehensive system status (indexing, OCR, AI providers)."""
    indexing_stats = get_indexing_stats()
    ocr_status = get_ocr_engine_status()
    ai_status = get_ai_service_status()
    
    return {
        "indexing": indexing_stats,
        "ocr": ocr_status,
        "ai": ai_status,
        "system": {
            "name": "AIOU Help",
            "version": "1.0.0",
            "status": "Operational"
        }
    }

@app.post("/api/ask")
@app.post("/ask")
def ask_question_api(req: AskRequest):
    """Processes student question strictly within selected semester and course books."""
    if not req.semester_num:
        raise HTTPException(status_code=400, detail="براہِ کرم پہلے سمسٹر کا انتخاب کریں۔ (Semester selection required)")
    
    result = answer_question(
        question=req.question,
        semester_num=req.semester_num,
        course_code=req.course_code,
        mode=req.mode
    )
    return result

@app.post("/api/ask_image")
@app.post("/ask_image")
def ask_image_api(req: ImageAskRequest):
    """
    Extracts all questions from the uploaded image and answers each strictly grounded in book materials.
    Handles 1 to 5+ questions on an exam paper or assignment photo.
    """
    if not req.semester_num:
        raise HTTPException(status_code=400, detail="براہِ کرم پہلے سمسٹر کا انتخاب فرمائیں۔")
    if not req.image_b64:
        raise HTTPException(status_code=400, detail="براہِ کرم سوالیہ پرچے کی تصویر فراہم کریں۔")

    result = solve_image_questions(
        image_b64=req.image_b64,
        semester_num=req.semester_num,
        course_code=req.course_code,
        mime_type=req.mime_type
    )
    return result

@app.post("/api/mcq")
@app.post("/mcq")
def solve_mcq_api(req: MCQRequest):
    """
    Answers Multiple-Choice Questions strictly verified against book evidence.
    Accepts:
    1. Single text containing question and options (whether 2, 3, or 4 options), OR
    2. Image photo of the quiz question, OR
    3. Separate fields (option_a, option_b, etc.). Never fails if D or C is missing!
    """
    if not req.semester_num:
        raise HTTPException(status_code=400, detail="براہِ کرم پہلے سمسٹر کا انتخاب کریں۔")

    opts = dict(req.options) if req.options else {}
    if req.option_a:
        opts["A"] = req.option_a
    if req.option_b:
        opts["B"] = req.option_b
    if req.option_c:
        opts["C"] = req.option_c
    if req.option_d:
        opts["D"] = req.option_d

    result = solve_unified_mcq(
        raw_text=req.raw_text,
        question=req.question,
        options=opts,
        image_b64=req.image_b64,
        semester_num=req.semester_num,
        course_code=req.course_code,
        mime_type=req.mime_type
    )
    return result

@app.post("/api/format_copy")
@app.post("/format_copy")
def format_copy_api(req: CopyRequest):
    """Formats answer and references for one-click clean copy to clipboard."""
    text = format_clipboard_text(req.data, include_references=req.include_references)
    return {"formatted_text": text}

@app.get("/api/chapters/{course_code}")
@app.get("/chapters/{course_code}")
def get_chapters_api(course_code: str):
    """Returns the list of chapters/units for a course."""
    units = get_course_units(course_code)
    return {"course_code": course_code, "units": units}

@app.post("/api/exam/questions")
@app.post("/exam/questions")
def generate_exam_questions_api(req: ExamPrepRequest):
    """Generates structured exam preparation questions and answers for each chapter."""
    if not req.course_code:
        raise HTTPException(status_code=400, detail="براہِ کرم کورس کوڈ منتخب کریں۔")
    count = req.count_per_chapter if req.count_per_chapter in (3, 4, 5) else 3
    result = generate_exam_questions(course_code=req.course_code, count_per_chapter=count)
    return result

@app.post("/api/exam/mcqs")
@app.post("/exam/mcqs")
def generate_chapter_mcqs_api(req: ChapterMCQRequest):
    """Generates 4-option MCQs for each chapter of the selected book."""
    if not req.course_code:
        raise HTTPException(status_code=400, detail="براہِ کرم کورس کوڈ منتخب کریں۔")
    count = req.count_per_chapter if req.count_per_chapter in (10, 15, 20, 25) else 10
    result = generate_chapter_mcqs(course_code=req.course_code, count_per_chapter=count)
    return result

@app.post("/api/assignment")
@app.post("/assignment")
def solve_assignment_api(req: AssignmentRequest):
    """
    Solves AIOU BS Islamic Studies assignments (1 to 5 questions).
    Produces 400-500 words per question with 10 distinct headings,
    unit citations, page references, and book quotations.
    """
    if not req.course_code:
        raise HTTPException(status_code=400, detail="براہِ کرم کورس کوڈ اور کتاب کا انتخاب فرمائیں۔")

    from aiou_app.assignment_engine import solve_assignment_batch
    result = solve_assignment_batch(
        course_code=req.course_code,
        semester_num=req.semester_num,
        assignment_num=req.assignment_num,
        questions=req.questions,
        raw_text=req.raw_text,
        image_b64=req.image_b64,
        mime_type=req.mime_type
    )
    return result

@app.get("/api")
@app.get("/api/health")
@app.get("/health")
def health_api():
    return {"status": "ok", "app": "AIOU Help"}

@app.get("/api/page/{doc_id}/{page_idx}")
@app.get("/page/{doc_id}/{page_idx}")
def get_page_api(doc_id: int, page_idx: int):
    """Retrieves full text of a specific page for in-depth student reading."""
    page_data = get_page_full_text(doc_id, page_idx)
    if not page_data:
        raise HTTPException(status_code=404, detail="Page not found")
    return page_data

@app.post("/api/reindex")
@app.post("/reindex")
def reindex_api():
    """Allows refreshing index if documents change without freezing interface."""
    res = index_all_books(force=False)
    return res
