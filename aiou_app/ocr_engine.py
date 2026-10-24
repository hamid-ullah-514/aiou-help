import os
import io
from typing import Dict, Any, Optional

try:
    import fitz
except ImportError:
    fitz = None

try:
    from PIL import Image
except ImportError:
    Image = None

try:
    import winocr
    HAS_WINOCR = True
except ImportError:
    HAS_WINOCR = False

def get_ocr_engine_status() -> Dict[str, Any]:
    """Returns availability and supported languages of OCR engines."""
    available_langs = []
    if HAS_WINOCR:
        try:
            available_langs = [l.language_tag for l in winocr.OcrEngine.available_recognizer_languages]
        except Exception:
            available_langs = ["en-US"]
            
    has_urdu = any('ur' in lang.lower() or 'ar' in lang.lower() for lang in available_langs)
    
    return {
        "has_winocr": HAS_WINOCR,
        "available_languages": available_langs,
        "supports_urdu_ocr": has_urdu,
        "recommended_note": (
            "اردو OCR پیک فعال نہیں ہے۔ ونڈوز میں اردو لینگویج پیک یا بیرونی ماڈل درکار ہے۔"
            if not has_urdu else "اردو OCR فعال ہے۔"
        )
    }

def run_ocr_on_page(page: fitz.Page, lang: str = "en-US") -> Dict[str, Any]:
    """
    Renders a PDF page to image and runs OCR via winocr if available.
    """
    if not HAS_WINOCR:
        return {
            "success": False,
            "text": "",
            "error": "OCR engine (winocr) is not available."
        }
        
    try:
        pix = page.get_pixmap(dpi=150)
        img = Image.open(io.BytesIO(pix.tobytes("png")))
        
        # Check available languages
        available = [l.language_tag for l in winocr.OcrEngine.available_recognizer_languages]
        target_lang = lang if lang in available else (available[0] if available else "en-US")
        
        res = winocr.recognize_pil_sync(img, lang=target_lang)
        text = res.get("text", "") if isinstance(res, dict) else getattr(res, "text", "")
        lines = res.get("lines", []) if isinstance(res, dict) else []
        
        return {
            "success": True,
            "text": text,
            "lines_count": len(lines),
            "language_used": target_lang
        }
    except Exception as e:
        return {
            "success": False,
            "text": "",
            "error": str(e)
        }
