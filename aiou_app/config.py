import os
from pathlib import Path

# Base directories
BASE_DIR = Path(__file__).resolve().parent.parent
APP_DIR = BASE_DIR / "aiou_app"
DATA_DIR = BASE_DIR / "data"
STATIC_DIR = BASE_DIR / "public"

DB_NAME = os.environ.get("AIOU_DB_NAME", "aiou_" + "search.db")
DB_PATH = DATA_DIR / DB_NAME
CATALOG_CACHE_PATH = DATA_DIR / "catalog_cache.json"

# Load local .env file if present
env_file = BASE_DIR / ".env"
if env_file.exists():
    try:
        with open(env_file, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    k, v = k.strip(), v.strip().strip("'").strip('"')
                    if k and k not in os.environ:
                        os.environ[k] = v
    except Exception:
        pass

# Server configuration
HOST = os.environ.get("AIOU_HOST", "127.0.0.1")
PORT = int(os.environ.get("AIOU_PORT", "8000"))

# AI API Keys (Read securely from environment variables)
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "").strip()
GROQ_MODEL = os.environ.get("GROQ_MODEL", "qwen/qwen3.8-27b").strip()
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "").strip()
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "").strip()

# Course Metadata Mapping (official AIOU course codes and titles)
KNOWN_COURSES = {
    "1901": {"title_ur": "تاریخ دعوت و عزیمت (1901 / 2630)", "title_en": "History of Dawah & Azimat"},
    "1902": {"title_ur": "مطالعہ مذاہبِ عالم", "title_en": "Study of World Religions"},
    "1904": {"title_ur": "تصوف اور اخلاق و تربیت", "title_en": "Tasawwuf & Ethics"},
    "1905": {"title_ur": "عربی ادب", "title_en": "Arabic Literature"},
    "1906": {"title_ur": "اسلامی معاشیات و فقہ المعاملات", "title_en": "Islamic Economics & Fiqh-ul-Muamalat"},
    "1907": {"title_ur": "اسلام کا سیاسی نظام", "title_en": "Political System of Islam"},
    "1908": {"title_ur": "مطالعہ کتب فقہ (فقہ اسلامی)", "title_en": "Study of Fiqh Books [Scanned]"},
    "1912": {"title_ur": "تاریخ تصوف و سلوک", "title_en": "History of Tasawwuf"},
    "1913": {"title_ur": "اسلام کا اقتصادی نظام", "title_en": "Economic System of Islam"},
    "1915": {"title_ur": "اسلامی قانون اور انسانی حقوق", "title_en": "Islamic Law & Human Rights"},
    "1916": {"title_ur": "عہد جدید میں اسلامی ادارے", "title_en": "Islamic Institutions in Modern Age"},
    "1918": {"title_ur": "مطالعہ نصوص (قرآن، حدیث، فقہ)", "title_en": "Study of Islamic Texts (Quran, Hadith, Fiqh)"},
    "1919": {"title_ur": "قواعد و انشاء (عربی گرامر)", "title_en": "Arabic Grammar & Composition"},
    "1921": {"title_ur": "فلسفہ اور علم الکلام", "title_en": "Philosophy & Ilm-ul-Kalam"},
    "1922": {"title_ur": "اصول تحقیق و تدوین", "title_en": "Research Methodology & Editing"},
    "1951": {"title_ur": "تاریخ تفسیر و اصول تفسیر", "title_en": "History & Principles of Tafseer"},
    "1953": {"title_ur": "علوم القرآن - I", "title_en": "Quranic Sciences - I"},
    "1981": {"title_ur": "تقابل ادیان (مذاہبِ عالم)", "title_en": "Comparative Religions"},
    "2900": {"title_ur": "مطالعہ قرآن حکیم (اسلامیات)", "title_en": "Study of the Holy Quran [Scanned]"},
    "2951": {"title_ur": "تاریخ حدیث و اصول حدیث", "title_en": "History & Principles of Hadith"},
    "2953": {"title_ur": "اصول فقہ (2953 / 3952)", "title_en": "Principles of Islamic Jurisprudence"},
    "3900": {"title_ur": "تاریخ فقہ (3900 / 9488)", "title_en": "History of Fiqh [Scanned]"},
    "3903": {"title_ur": "حقوق الرسول ﷺ", "title_en": "Rights of the Holy Prophet (PBUH)"},
    "4931": {"title_ur": "تاریخ اسلام", "title_en": "History of Islam"},
    "4934": {"title_ur": "سیرت النبی ﷺ کا موضوعاتی مطالعہ", "title_en": "Thematic Study of Seerat-un-Nabi (PBUH)"},
    "4935": {"title_ur": "فہم قرآن (تجوید، ترجمہ اور تفسیر)", "title_en": "Understanding the Quran"},
    "4951": {"title_ur": "بین المذاہب و مسالک ہم آہنگی اور رواداری کے راہنما اصول", "title_en": "Interfaith & Sectarian Harmony Principles"}
}
