import os
import json
import urllib.request
import urllib.error
from typing import Dict, List, Any, Optional

from aiou_app.config import GEMINI_API_KEY, OPENAI_API_KEY

def get_ai_service_status() -> Dict[str, Any]:
    """Returns status of external AI providers."""
    return {
        "has_gemini": bool(GEMINI_API_KEY),
        "has_openai": bool(OPENAI_API_KEY),
        "active_provider": "gemini" if GEMINI_API_KEY else ("openai" if OPENAI_API_KEY else "local_source_engine"),
        "is_configured": bool(GEMINI_API_KEY or OPENAI_API_KEY),
        "message_ur": (
            "بیرونی AI ماڈل منسلک ہے۔ (External AI Connected)"
            if (GEMINI_API_KEY or OPENAI_API_KEY)
            else "مقامی تصدیق شدہ سورس انجن فعال ہے۔ (Local Source Grounded Engine Active - Zero hallucination)"
        )
    }

def call_gemini_grounded(
    prompt: str,
    passages: List[Dict[str, Any]],
    mode: str = "explanation"
) -> Optional[str]:
    """
    Calls Gemini API with strict grounding exclusively on provided book passages.
    """
    if not GEMINI_API_KEY:
        return None

    # Construct context from passages
    context_blocks = []
    for idx, p in enumerate(passages[:5]):
        pg_str = p.get('printed_page', f"PDF {p.get('pdf_page')}")
        context_blocks.append(
            f"[Passage {idx+1} | Book: {p.get('course_title_ur')} (Code {p.get('course_code')}) | Page: {pg_str} | Lines: {p.get('line_start')}-{p.get('line_end')}]\n{p.get('raw_text')}"
        )
    context_text = "\n\n".join(context_blocks)

    system_instruction = (
        "You are AIOU Help, a strictly grounded educational study assistant for AIOU BS Islamic Studies program.\n"
        "STRICT RULES:\n"
        "1. You MUST answer EXCLUSIVELY using the provided context passages below.\n"
        "2. Do NOT use any external or general AI knowledge.\n"
        "3. Preserve the original terminology and Islamic terms.\n"
        "4. In your Urdu response, clearly distinguish direct quotation from explanation.\n"
        "5. If the context does not contain enough evidence, state:\n"
        "معذرت، منتخب شدہ کتاب یا کورس کے دستیاب مواد میں اس سوال کا مستند جواب نہیں ملا۔ براہِ کرم سوال یا منتخب کردہ کورس کوڈ چیک کریں۔\n"
    )

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_API_KEY}"
    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {
                        "text": f"{system_instruction}\n\nCONTEXT PASSAGES FROM BOOKS:\n{context_text}\n\nSTUDENT QUESTION / TASK:\n{prompt}"
                    }
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.1,
            "maxOutputTokens": 1024
        }
    }

    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            candidates = data.get("candidates", [])
            if candidates:
                parts = candidates[0].get("content", {}).get("parts", [])
                if parts:
                    return parts[0].get("text", "").strip()
    except Exception as e:
        print("Gemini API call notice:", e)
        return None
    return None
