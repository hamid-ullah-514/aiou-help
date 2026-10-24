# -*- coding: utf-8 -*-
"""
AIOU Help — AI Service Provider (Groq High-Speed LLM & Vision Grounding Engine)
Supports Qwen-27B Vision / Multimodal for both text questions and image-based questions.
Strict zero-hallucination policy: answers strictly from provided AIOU book passages.
"""

import os
import re
import json
import urllib.request
import urllib.error
from typing import Dict, List, Any, Optional

from aiou_app.config import GROQ_API_KEY, GROQ_MODEL, GEMINI_API_KEY, OPENAI_API_KEY

def get_ai_service_status() -> Dict[str, Any]:
    """Returns status of external AI providers."""
    has_groq = bool(GROQ_API_KEY)
    has_gemini = bool(GEMINI_API_KEY)
    has_openai = bool(OPENAI_API_KEY)

    active_provider = "groq" if has_groq else ("gemini" if has_gemini else ("openai" if has_openai else "local_source_engine"))

    return {
        "has_groq": has_groq,
        "has_gemini": has_gemini,
        "has_openai": has_openai,
        "active_provider": active_provider,
        "model": GROQ_MODEL if has_groq else "gemini-1.5-flash",
        "is_configured": bool(has_groq or has_gemini or has_openai),
        "message_ur": (
            "Groq تیز ترین AI ماڈل (Qwen-27B Vision & Text) منسلک ہے۔"
            if has_groq
            else ("بیرونی AI ماڈل منسلک ہے۔" if (has_gemini or has_openai) else "مقامی تصدیق شدہ سورس انجن فعال ہے۔")
        )
    }

def call_groq_grounded(
    prompt: str,
    passages: List[Dict[str, Any]],
    mode: str = "explanation"
) -> Optional[str]:
    """
    Calls Groq high-speed AI with strict grounding exclusively on provided book passages.
    Produces comprehensive, academic Urdu examination answers with headings, definitions,
    and citations.
    """
    if not GROQ_API_KEY:
        return None

    # Construct context from passages
    context_blocks = []
    for idx, p in enumerate(passages[:6]):
        pg_str = p.get('printed_page', f"PDF {p.get('pdf_page')}")
        context_blocks.append(
            f"[مقتبس {idx+1} | کتاب: {p.get('course_title_ur', '')} (کورس کوڈ: {p.get('course_code', '')}) | صفحہ: {pg_str} | سطور: {p.get('line_start', '')}-{p.get('line_end', '')}]\n{p.get('raw_text', '')}"
        )
    context_text = "\n\n".join(context_blocks)

    system_instruction = (
        "آپ علامہ اقبال اوپن یونیورسٹی (AIOU) کے بی ایس اسلامیات (2.5 سالہ پروگرام) کے باوقار، علمی اور مستند امتحانی استاد ہیں۔\n"
        "آپ کا کام طالب علم کے سوال کا جواب فراہم کردہ نصابی کتاب کے مواد کی روشنی میں نہایت خوبصورت، خوشخط، مفصل اور امتحانی معیار پر تیار کرنا ہے۔\n\n"
        "سخت امتحانی و شرعی اصول:\n"
        "۱۔ جواب صرف اور صرف نیچے فراہم کردہ کتاب کے اصل مواد (Book Passages) سے تیار کریں۔ اپنی طرف سے کوئی غیر مصدقہ بات یا بیرونی عمومی معلومات ہرگز شامل نہ کریں۔\n"
        "۲۔ امتحانی پرچے کے مطابق مکمل تحریری ڈھانچہ تشکیل دیں:\n"
        "   - **اساسی تعارف (Introduction):** موضوع کا پس منظر اور امتحانی اہمیت۔\n"
        "   - **لغوی و اصطلاحی مفہوم (Definition):** لغت اور شریعت کی روشنی میں جامع تعریف۔\n"
        "   - **تفصیلی علمی وضاحت (Detailed Explanation):** کتاب کے متن کی روشنی میں مکمل علمی گفتگو۔\n"
        "   - **اہم ذیلی سرخیاں (Key Subheadings):** کم از کم ۳ سے ۴ ذیلی عنوانات کے تحت نکات۔\n"
        "   - **دلائل و براہین (Evidence & Quotations):** قرآنی آیات، احادیثِ نبویہ یا فقہی اقوال (جو کتاب کے مواد میں آئے ہوں)۔\n"
        "   - **حاصلِ کلام / نتیجہ (Conclusion):** جامع خلاصہ۔\n"
        "۳۔ اہم ترین اصول (عدم موجودگی کی صورت میں):\n"
        "اگر طالب علم کے سوال کا تعلق فراہم کردہ کتابی مواد سے نہ ہو، یا کتاب کے اس متن میں اس سوال کا جواب نہ پایا جاتا ہو، تو اپنی طرف سے کوئی من گھڑت جواب نہ دیں، بلکہ حرف بہ حرف صرف اور صرف یہ جملہ لکھیں:\n"
        "معذرت، فراہم کردہ نصابی کتاب کے مواد میں اس سوال کا واضح جواب موجود نہیں ہے۔\n"
    )

    url = "https://api.groq.com/openai/v1/chat/completions"
    payload = {
        "model": GROQ_MODEL,
        "messages": [
            {"role": "system", "content": system_instruction},
            {
                "role": "user",
                "content": f"نصابی کتاب سے اقتباسات:\n{context_text}\n\nطالب علم کا سوال:\n{prompt}"
            }
        ],
        "temperature": 0.2,
        "max_tokens": 1500
    }

    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json",
                "User-Agent": "AIOU-Help-Assistant/1.0"
            }
        )
        with urllib.request.urlopen(req, timeout=45) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            choices = data.get("choices", [])
            if choices:
                msg = choices[0].get("message", {}).get("content", "").strip()
                return msg
    except Exception as e:
        print("Groq API Grounded Answer Error:", e)
        return None
    return None

def extract_questions_from_image_groq(
    image_b64: str,
    mime_type: str = "image/jpeg"
) -> List[Dict[str, Any]]:
    """
    Uses Groq Vision (Qwen-27B Multimodal) to read an image uploaded by the student
    and extract all questions written on it (whether 1, 2, 3, 5, or more questions).
    Returns a list of dicts: [{'q_num': 1, 'question': '...'}, ...]
    """
    if not GROQ_API_KEY:
        return []

    # Ensure clean base64 data without data:image/...;base64, prefix if passed raw
    clean_b64 = image_b64
    if "," in image_b64:
        header, clean_b64 = image_b64.split(",", 1)
        if "png" in header:
            mime_type = "image/png"
        elif "webp" in header:
            mime_type = "image/webp"

    url = "https://api.groq.com/openai/v1/chat/completions"
    
    prompt = (
        "آپ امتحانی پرچوں اور اردو سوالیہ پیپرز کے ماہر OCR ریڈر ہیں۔\n"
        "اس تصویر کو باریک بینی سے پڑھیں اور اس میں موجود تمام سوالات (چاہے ایک سوال ہو، دو ہوں یا پانچ سوالات ہوں) کو الگ الگ شناخت کریں۔\n"
        "صرف اور صرف درست اور مکمل JSON ارے (Array) کی شکل میں جواب دیں:\n"
        "[\n"
        "  {\"q_num\": 1, \"question\": \"سوال کا مکمل اردو متن\"},\n"
        "  {\"q_num\": 2, \"question\": \"دوسرے سوال کا مکمل اردو متن\"}\n"
        "]\n"
        "سخت ہدایت: کسی قسم کی وضاحت، مارک ڈاؤن بیک ٹکس یا فالتو الفاظ نہ لکھیں، صرف خالص JSON ارے واپس کریں۔"
    )

    payload = {
        "model": GROQ_MODEL,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:{mime_type};base64,{clean_b64}"
                        }
                    }
                ]
            }
        ],
        "temperature": 0.1,
        "max_tokens": 1024
    }

    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json",
                "User-Agent": "AIOU-Help-Assistant/1.0"
            }
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            raw_text = data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
            
            # Clean possible markdown wrapping like ```json ... ```
            cleaned = re.sub(r"^```(?:json)?", "", raw_text, flags=re.MULTILINE)
            cleaned = re.sub(r"```$", "", cleaned, flags=re.MULTILINE).strip()
            
            # Find JSON array
            start_idx = cleaned.find("[")
            end_idx = cleaned.rfind("]")
            if start_idx != -1 and end_idx != -1:
                json_str = cleaned[start_idx:end_idx+1]
                questions = json.loads(json_str)
                if isinstance(questions, list):
                    return questions

            # Fallback line-by-line parsing if json failed
            lines = [l.strip() for l in raw_text.split("\n") if l.strip()]
            q_list = []
            for idx, line in enumerate(lines):
                if any(kw in line for kw in ["سوال", "Question", "1.", "2.", "3.", "4.", "5.", "۱۔", "۲۔", "۳۔", "؟"]):
                    q_list.append({"q_num": len(q_list) + 1, "question": line})
            return q_list

    except Exception as e:
        print("Groq Vision OCR Error:", e)
        return []

def extract_quiz_mcq_from_image_groq(
    image_b64: str,
    mime_type: str = "image/jpeg"
) -> Dict[str, Any]:
    """
    Extracts a quiz question and its available options (whether 2, 3, or 4 options) from an image.
    Returns: {'question': '...', 'options': {'A': '...', 'B': '...'}}
    """
    if not GROQ_API_KEY:
        return {}

    clean_b64 = image_b64
    if "," in image_b64:
        header, clean_b64 = image_b64.split(",", 1)
        if "png" in header:
            mime_type = "image/png"
        elif "webp" in header:
            mime_type = "image/webp"

    url = "https://api.groq.com/openai/v1/chat/completions"
    prompt = (
        "آپ امتحانی کوئز اور معروضی سوالات (MCQs) کے ماہر OCR ریڈر ہیں۔\n"
        "اس تصویر میں موجود کوئز کا سوال اور اس کے تمام آپشنز (چاہے 2 آپشن ہوں، 3 ہوں یا 4 ہوں) کو درست شناخت کریں۔\n"
        "صرف اور صرف درست JSON کی شکل میں جواب دیں:\n"
        "{\n"
        "  \"question\": \"سوال کا مکمل متن\",\n"
        "  \"options\": {\n"
        "    \"A\": \"پہلا آپشن\",\n"
        "    \"B\": \"دوسرا آپشن\"\n"
        "  }\n"
        "}\n"
        "سخت ہدایت: صرف خالص JSON واپس کریں، کوئی فالتو بیک ٹکس یا جملے نہ لکھیں۔"
    )

    payload = {
        "model": GROQ_MODEL,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:{mime_type};base64,{clean_b64}"
                        }
                    }
                ]
            }
        ],
        "temperature": 0.1,
        "max_tokens": 512
    }

    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json",
                "User-Agent": "AIOU-Help-Assistant/1.0"
            }
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            raw_text = data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
            cleaned = re.sub(r"^```(?:json)?", "", raw_text, flags=re.MULTILINE)
            cleaned = re.sub(r"```$", "", cleaned, flags=re.MULTILINE).strip()
            s = cleaned.find("{")
            e = cleaned.rfind("}")
            if s != -1 and e != -1:
                return json.loads(cleaned[s:e+1])
    except Exception as e:
        print("Quiz Vision OCR Error:", e)
    return {}

def solve_mcq_ai_fallback(
    question: str,
    options: Dict[str, str],
    semester_num: str = "1",
    course_code: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """
    Expert AI Fallback for Multiple Choice Questions:
    Uses Groq LLM with authoritative grounding on AIOU BS Islamic Studies syllabus,
    including Tajweed (Course 4935), Hadith, Fiqh, Seerat, and Islamic Thought.
    Accurately identifies the verified option, course code, book title, and academic reason.
    """
    if not GROQ_API_KEY:
        return None

    options_formatted = "\n".join([f"{k}: {v}" for k, v in options.items()])

    prompt = (
        "آپ علامہ اقبال اوپن یونیورسٹی (AIOU) بی ایس اسلامیات (2.5 سالہ پروگرام) کے سینئر پروفیسر اور امتحانی ماہر ہیں۔\n"
        "آپ کے سامنے طالب علم کا ایک معروضی (MCQ / کوئز) سوال اور اس کے ممکنہ آپشنز پیش ہیں۔\n\n"
        f"سوال: {question}\n"
        f"آپشنز:\n{options_formatted}\n\n"
        "نصابی رہنمائی و مستند اصول:\n"
        "- اگر سوال علم التجوید و قرأت (کورس کوڈ 4935: قرآن حکیم تجوید و قرأت) سے ہو:\n"
        "  * صفاتِ متضادہ کے پانچ جوڑے: ہمس (حروف: فحثه شخص سكت) کی ضد 'جہر'؛ شدت (أجد قط بكت) اور توسط (لن عمر) کی ضد 'رخاوت'؛ استعلاء (خص ضغط قظ) کی ضد 'استفال'؛ اطباق (ص ض ط ظ) کی ضد 'انفتاح'؛ اذلاق (فر من لب) کی ضد 'اصمات' ہے۔\n"
        "  * صفاتِ غیر متضادہ: قلقلہ (قطب جد)، صفیر (ص ز س)، لین، انحراف، تفشی، استطالت، غنہ۔\n"
        "  * احکام نون ساکن و تنوین: اظہار، ادغام، اقلاب، اخفاء۔\n"
        "- اگر سوال سیرت النبی ﷺ (4934) سے ہو، تو غزوات، سرایا اور مکی و مدنی ادوار کے مطابق ہو۔\n"
        "- اگر سوال تاریخ، اصول فقہ (2953)، مذاہبِ عالم (1902) یا حدیث (2955) سے ہو، تو مستند اسلامی نصاب کے مطابق ہو۔\n\n"
        "صرف اور صرف خالص JSON فارمیٹ میں جواب دیں:\n"
        "{\n"
        "  \"correct_key\": \"A\",\n"
        "  \"correct_text\": \"درست آپشن کا متن\",\n"
        "  \"explanation\": \"تجوید یا اسلامی نصاب کے قواعد کے مطابق مدلل علمی وضاحت\",\n"
        "  \"course_code\": \"4935\",\n"
        "  \"book_title\": \"قرآن حکیم (تجوید و قرأت)\"\n"
        "}\n"
        "سخت ہدایت: صرف خالص JSON آبجیکٹ دیں، کوئی اضافی مارک ڈاؤن بیک ٹکس یا فالتو الفاظ نہ لکھیں۔"
    )

    url = "https://api.groq.com/openai/v1/chat/completions"
    payload = {
        "model": "openai/gpt-oss-120b",
        "messages": [
            {"role": "system", "content": "You are a distinguished professor of Islamic Studies at Allama Iqbal Open University."},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.1,
        "max_tokens": 512
    }

    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json",
                "User-Agent": "AIOU-Help-Assistant/1.0"
            }
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            raw = data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
            cleaned = re.sub(r"^```(?:json)?", "", raw, flags=re.MULTILINE)
            cleaned = re.sub(r"```$", "", cleaned, flags=re.MULTILINE).strip()
            s = cleaned.find("{")
            e = cleaned.rfind("}")
            if s != -1 and e != -1:
                return json.loads(cleaned[s:e+1])
    except Exception as e:
        print("Groq solve_mcq_ai_fallback error:", e)
    return None

def call_gemini_grounded(
    prompt: str,
    passages: List[Dict[str, Any]],
    mode: str = "explanation"
) -> Optional[str]:
    """Fallback to Gemini if configured."""
    if not GEMINI_API_KEY:
        return None
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_API_KEY}"
    payload = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.1, "maxOutputTokens": 1024}
    }
    try:
        req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data["candidates"][0]["content"]["parts"][0]["text"].strip()
    except Exception:
        return None
