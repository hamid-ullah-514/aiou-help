import re
from typing import List, Set

# Regex for Arabic/Urdu diacritics (Harakat / Tashkeel)
AERAB_PATTERN = re.compile(r'[\u064B-\u065F\u0670\u06D6-\u06ED\u0610-\u061A]')

# Character normalization table
CHAR_MAP = {
    'ك': 'ک',
    'ي': 'ی',
    'ى': 'ی',
    'ئ': 'ی',
    'ؤ': 'و',
    'أ': 'ا',
    'إ': 'ا',
    'آ': 'ا',
    'ٱ': 'ا',
    'ة': 'ہ',
    'ۃ': 'ہ',
    'ه': 'ہ',
    'ھ': 'ہ',
    'ے': 'ی',
    '–': '-',
    '—': '-',
    '“': '"',
    '”': '"',
    '‘': "'",
    '’': "'",
    '،': ',',
    '؛': ';',
    '؟': '?'
}

# Common Urdu Stop Words
URDU_STOP_WORDS = {
    'کا', 'کے', 'کی', 'کو', 'سے', 'میں', 'نے', 'پر', 'اور', 'ہے', 'ہیں', 'تھا', 'تھی', 'تھے',
    'کیا', 'کہ', 'یہ', 'وہ', 'ان', 'اس', 'انکی', 'اسکی', 'ہو', 'ہوتا', 'ہوتی', 'ہوتے', 'ہوا',
    'گئی', 'گیا', 'گئے', 'تک', 'اب', 'جب', 'تب', 'کون', 'کس', 'کن', 'کیوں', 'کیسے', 'سب',
    'بھی', 'ہی', 'تو', 'پھر', 'کر', 'کرنا', 'کرتے', 'کرتی', 'کرنے', 'والی', 'والے', 'والا',
    'جس', 'جن', 'اہلل', 'بیان', 'کریں', 'کیجیے', 'کیجئے', 'مراد', 'بتائیں', 'لکھیں', 'تحریر'
}

# Common InPage / Nastaleeq inverted glyph pairs in legacy AIOU print drivers
INPAGE_LIGATURE_MAP = {
    "سیرت": "ریست",
    "غزوہ": "زغوہ",
    "غزوات": "زغوات",
    "مطالعہ": "اطمہعل",
    "مذاہب": "ذماہب",
    "عالم": "اعمل",
    "بین": "نیب",
    "عہد": "دہع",
    "جدید": "دجدی",
    "کورس": "وکرس",
    "تاریخ": "اتری",
    "حدیث": "دحیث",
    "قرآن": "رآن",
    "تفسیر": "ریسفت",
    "اصول": "اوصل",
    "فقہ": "قف",
    "رسول": "روسل",
    "صحابہ": "احصہب",
    "محمد": "دمحم",
    "نبی": "ایبنل",
    "تعریف": "رعتفی",
    "تعارف": "اعترف",
    "مفہوم": "وہفمم",
    "مراد": "رماد",
    "اصطلاح": "االطصاح",
    "اصطلاحا": "االطصاح",
    "طیبہ": "ہبیط",
    "پاکیزہ": "اپزیکہ",
    "زندگی": "زدنگ",
    "شامل": "اشلم",
    "انسان": "ااسنن",
    "اقتصادی": "ااصتقدی",
    "نظام": "اظنم",
    "خصوصیات": "وصخایصت",
    "معاشیات": "اعمایشت",
    "معیشت": "تشمعی",
    "سیاسی": "ایسیس",
    "فلسفہ": "ہفسلف",
    "کلام": "الکلم",
    "تقابل": "اقلبت",
    "ادیان": "اداین",
    "قانون": "اقونن",
    "انسانی": "ااسنین",
    "کتاب": "اتکب",
    "شرکت": "رشتک",
    "فرمائی": "رفامی",
    "فرمایا": "رفامای",
    "خود": "وخد",
    "شریک": "رشکیں",
    "حضور": "وضحر",
    "مہمات": "امہمت",
    "اسلام": "االسم",
    "حقوق": "وقحق",
    "تحقیق": "قیقحت",
    "تدوین": "دتونی",
    "نصوص": "وصنص",
    "مسالک": "اسمکل",
    "ہم آہنگی": "مہٓایگنہ",
    "رواداری": "رواداری",
    "راہنما": "رامنہ"
}

INPAGE_REVERSE_MAP = {v: k for k, v in INPAGE_LIGATURE_MAP.items()}

def remove_diacritics(text: str) -> str:
    """Strips all vowels/diacritics from Arabic/Urdu text."""
    if not text:
        return ""
    text = AERAB_PATTERN.sub('', text)
    text = text.replace('\u0640', '')
    return text

def normalize_urdu(text: str, keep_spaces: bool = True) -> str:
    """Standardizes Urdu characters and strips diacritics."""
    if not text:
        return ""
    
    text = remove_diacritics(text)
    for src, dst in CHAR_MAP.items():
        text = text.replace(src, dst)
        
    if keep_spaces:
        text = re.sub(r'\s+', ' ', text).strip()
    return text

def tokenize(text: str) -> List[str]:
    """Tokenizes normalized text into searchable words."""
    norm = normalize_urdu(text)
    tokens = re.findall(r'[\w\u0600-\u06FF]+', norm, re.UNICODE)
    return [t for t in tokens if len(t) > 1]

def extract_content_tokens(text: str) -> List[str]:
    """Extracts meaningful content tokens, excluding stop words and single characters."""
    tokens = tokenize(text)
    expanded = set()
    for t in tokens:
        if t in URDU_STOP_WORDS or len(t) <= 1:
            continue
        expanded.add(t)
        if t in INPAGE_LIGATURE_MAP:
            expanded.add(normalize_urdu(INPAGE_LIGATURE_MAP[t]))
        if t in INPAGE_REVERSE_MAP:
            expanded.add(normalize_urdu(INPAGE_REVERSE_MAP[t]))
    return list(expanded)

def highlight_matches(text: str, query: str) -> str:
    """Highlights matching keywords in text."""
    if not text or not query:
        return text
    
    q_tokens = extract_content_tokens(query)
    if not q_tokens:
        return text
    
    q_tokens = sorted(set(q_tokens), key=len, reverse=True)
    pattern = '|'.join(re.escape(t) for t in q_tokens)
    if not pattern:
        return text
        
    try:
        regex = re.compile(f'({pattern})', re.IGNORECASE)
        return regex.sub(r'<mark>\1</mark>', text)
    except Exception:
        return text
