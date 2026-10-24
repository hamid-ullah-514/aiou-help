// AIOU Help — Professional Urdu Educational & Exam Assistant Client
// Fully compatible with local testing, direct file:// opening, and Vercel Serverless deployments.

const API_BASE = (window.location.protocol === "file:" || (window.location.hostname === "localhost" && window.location.port === ""))
    ? "https://aiou-help.vercel.app"
    : "";

let currentCatalog = null;
let currentFeature = "qa"; // "qa", "image_qa", "exam", "mcq_gen", "quiz"
let currentQAMode = "explanation"; // "explanation", "exact"

let lastQAResult = null;
let lastExamData = null;
let lastMCQGenData = null;
let lastQuizResult = null;
let areAllMCQsRevealed = false;

// ==========================================
// INITIALIZATION
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    initApp();
});

async function initApp() {
    try {
        setupImageDropzone();
        const resp = await fetch(`${API_BASE}/api/catalog`);
        if (!resp.ok) {
            throw new Error(`Catalog request failed: ${resp.status}`);
        }
        currentCatalog = await resp.json();
        populateSemesterDropdown(currentCatalog);
    } catch (e) {
        console.error("Error loading catalog:", e);
        showToast("کورس کیٹلاگ لوڈ کرنے میں دشواری ہوئی۔ براہِ کرم صفحہ ریفریش کریں۔");
    }
}

const ALL_SEMESTER_IDS = [
    "semester-select", 
    "qa-semester-select", 
    "image-qa-semester-select", 
    "exam-semester-select", 
    "mcq-semester-select", 
    "quiz-semester-select"
];

const ALL_COURSE_IDS = [
    "course-select", 
    "qa-course-select", 
    "image-qa-course-select", 
    "exam-course-select", 
    "mcq-course-select", 
    "quiz-course-select"
];

function populateSemesterDropdown(catalog) {
    ALL_SEMESTER_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = `<option value="">-- براہِ کرم پہلے سمسٹر منتخب کریں --</option>`;

        if (!catalog || !catalog.semesters || catalog.semesters.length === 0) {
            el.innerHTML += `<option value="1">سمسٹر 1 (Semester 1)</option>`;
            return;
        }

        catalog.semesters.forEach(s => {
            const opt = document.createElement("option");
            opt.value = s.semester_num;
            opt.textContent = `${s.semester_name_ur || `سمسٹر ${s.semester_num}`} (${s.books ? s.books.length : 0} کتب)`;
            el.appendChild(opt);
        });

        // Default to Semester 1 for immediate smooth student experience
        el.value = "1";
    });

    onSemesterChange();
}

function onSemesterChange(source = "global") {
    let semNum = "1";
    const srcEl = document.getElementById(`${source}-semester-select`) || 
                  document.getElementById("semester-select");
    if (srcEl && srcEl.value) {
        semNum = srcEl.value;
    }

    // Sync all semester selects
    ALL_SEMESTER_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (el && el.value !== semNum) el.value = semNum;
    });

    if (!semNum) {
        ALL_COURSE_IDS.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.disabled = true;
                el.innerHTML = `<option value="">-- پہلے سمسٹر کا انتخاب ضروری ہے --</option>`;
            }
        });
        return;
    }

    let booksInSem = [];
    let semData = null;
    if (currentCatalog && currentCatalog.semesters) {
        semData = currentCatalog.semesters.find(s => String(s.semester_num) === String(semNum));
        if (semData && semData.books) {
            booksInSem = semData.books;
        }
    }

    ALL_COURSE_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.disabled = false;
        el.innerHTML = `<option value="ALL">-- سمسٹر ${semNum} کی تمام کتب (جامع سرچ) --</option>`;

        booksInSem.forEach(b => {
            const opt = document.createElement("option");
            opt.value = b.course_code;
            opt.textContent = `${b.course_code}: ${b.course_title_ur} (${b.pages_count || 0} صفحات)`;
            el.appendChild(opt);
        });

        // Default to first real course
        if (booksInSem.length > 0) {
            el.value = booksInSem[0].course_code;
        }
    });

    onCourseChange("global");
}

function onCourseChange(source = "global") {
    let cCode = "";
    const srcEl = document.getElementById(`${source}-course-select`) || 
                  document.getElementById("course-select");
    if (srcEl && srcEl.value) {
        cCode = srcEl.value;
    }

    // Sync all course selects
    ALL_COURSE_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (el && el.value !== cCode) {
            el.value = cCode;
        }
    });
}

// Switch between tabs / features
function switchFeature(feat, autoTriggerFile = false) {
    if (!feat) feat = "home";
    const norm = feat.replace(/_/g, "-");
    const under = feat.replace(/-/g, "_");
    currentFeature = norm;

    const allTabs = ["home", "qa", "image-qa", "exam", "mcq-gen", "quiz"];
    allTabs.forEach(t => {
        const u = t.replace(/-/g, "_");
        const btn = document.getElementById(`feat-btn-${t}`) || document.getElementById(`feat-btn-${u}`);
        const navBtn = document.getElementById(`nav-btn-${t}`) || document.getElementById(`nav-btn-${u}`);
        const sec = document.getElementById(`section-${t}`) || document.getElementById(`section-${u}`);
        const mobBtn = document.getElementById(`mob-btn-${t}`) || document.getElementById(`mob-btn-${u}`);
        if (btn) btn.classList.remove("active");
        if (navBtn) navBtn.classList.remove("active");
        if (mobBtn) mobBtn.classList.remove("active");
        if (sec) sec.style.display = "none";
    });

    const activeBtn = document.getElementById(`feat-btn-${norm}`) || document.getElementById(`feat-btn-${under}`);
    const activeNavBtn = document.getElementById(`nav-btn-${norm}`) || document.getElementById(`nav-btn-${under}`);
    const activeMobBtn = document.getElementById(`mob-btn-${norm}`) || document.getElementById(`mob-btn-${under}`);
    const activeSec = document.getElementById(`section-${norm}`) || document.getElementById(`section-${under}`);

    if (activeBtn) activeBtn.classList.add("active");
    if (activeNavBtn) activeNavBtn.classList.add("active");
    if (activeMobBtn) activeMobBtn.classList.add("active");
    if (activeSec) {
        activeSec.style.display = "block";
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    if ((norm === "image-qa" || under === "image_qa") && autoTriggerFile && !selectedImageDataUrl) {
        setTimeout(() => {
            triggerImageFileInput();
        }, 100);
    }
}

// ==========================================
// FEATURE 1: کتاب سے سوال پوچھیں (QA)
// ==========================================
function onQAModeChange() {
    const radios = document.getElementsByName("qa-mode");
    for (const r of radios) {
        if (r.checked) currentQAMode = r.value;
    }
}

function fillExample(qText, semNum, courseCode) {
    document.getElementById("semester-select").value = semNum;
    onSemesterChange();
    if (courseCode) {
        document.getElementById("course-select").value = courseCode;
        onCourseChange();
    }
    document.getElementById("question-input").value = qText;
    switchFeature("qa");
    handleQASubmit();
}

function clearQAForm() {
    document.getElementById("question-input").value = "";
    document.getElementById("qa-result-area").style.display = "none";
    lastQAResult = null;
}

async function handleQASubmit() {
    const semNum = document.getElementById("semester-select").value;
    const courseCode = document.getElementById("course-select").value;
    const question = document.getElementById("question-input").value.trim();

    if (!semNum) {
        alert("براہِ کرم پہلے سمسٹر منتخب فرمائیں۔");
        return;
    }
    if (!question) {
        alert("براہِ کرم اپنا سوال درج کریں۔");
        return;
    }

    const spinner = document.getElementById("qa-spinner");
    const submitBtn = document.getElementById("qa-submit-btn");
    spinner.style.display = "inline-block";
    submitBtn.disabled = true;

    try {
        const resp = await fetch(`${API_BASE}/api/ask`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                question: question,
                semester_num: semNum,
                course_code: courseCode === "ALL" ? null : courseCode,
                mode: currentQAMode
            })
        });

        if (!resp.ok) {
            throw new Error(`Server returned status: ${resp.status}`);
        }

        const data = await resp.json();
        lastQAResult = data;
        renderQAResult(data, question);
    } catch (e) {
        console.error("QA error:", e);
        showToast("جواب تلاش کرنے میں دشواری پیش آئی۔ دوبارہ کوشش کریں۔");
    } finally {
        spinner.style.display = "none";
        submitBtn.disabled = false;
    }
}

function renderQAResult(data, originalQuestion) {
    const resultArea = document.getElementById("qa-result-area");
    const headerTitle = document.getElementById("qa-header-title");
    const badgeBook = document.getElementById("qa-badge-book");
    const badgePage = document.getElementById("qa-badge-page");
    const bodyContent = document.getElementById("qa-body-content");
    const refContainer = document.getElementById("qa-references-container");
    const refList = document.getElementById("qa-references-list");

    resultArea.style.display = "block";
    resultArea.scrollIntoView({ behavior: "smooth", block: "start" });

    if (data.not_found) {
        headerTitle.textContent = "نتیجہ: کتاب میں جواب نہیں ملا";
        badgeBook.textContent = "تلاش مکمل";
        badgePage.textContent = "Zero Hallucination";
        bodyContent.innerHTML = `
            <div style="background: #fffbeb; border: 1px solid #fef3c7; border-radius: 8px; padding: 1.25rem; color: #92400e;">
                <p style="font-size: 1.05rem; font-weight: 700; margin-bottom: 0.5rem;">⚠️ کتاب کے دستیاب مواد میں اس سوال کا جواب نہیں ملا۔</p>
                <p>${escapeHtml(data.answer)}</p>
                <p style="font-size: 0.88rem; margin-top: 0.5rem; color: #b45309;">
                    نوٹ: یہ سسٹم اپنی طرف سے من گھڑت جواب نہیں دیتا بلکہ صرف اصل نصابی کتب سے مصدقہ جوابات فراہم کرتا ہے۔
                </p>
            </div>
        `;
        refContainer.style.display = "none";
        return;
    }

    refContainer.style.display = "block";
    headerTitle.textContent = data.mode === "exact" ? "کتاب کی اصل عبارت (Exact Book Quotation)" : "جامع امتحانی جواب (Grounded Exam Answer)";
    badgeBook.textContent = `کتاب: ${data.book_title || "نصابی کتاب"}`;
    badgePage.textContent = `صفحہ: ${data.printed_page || data.pdf_page || "متعلقہ"}`;

    bodyContent.textContent = data.answer;

    refList.innerHTML = "";
    if (data.references && data.references.length > 0) {
        data.references.forEach((ref, idx) => {
            const item = document.createElement("div");
            item.className = "ref-item";
            item.innerHTML = `
                <div class="ref-header">
                    <div class="ref-badges">
                        <span class="ref-badge badge-book">📚 ${escapeHtml(ref.book_title)} (${escapeHtml(ref.course_code)})</span>
                        <span class="ref-badge badge-page">📄 ${escapeHtml(ref.page_display)}</span>
                        <span class="ref-badge badge-line">${escapeHtml(ref.line_reference)}</span>
                    </div>
                </div>
                <div class="ref-quote urdu-text">
                    « ${escapeHtml(ref.quotation)} »
                </div>
            `;
            refList.appendChild(item);
        });
    } else {
        refContainer.style.display = "none";
    }
}

// QA Copy Actions
async function copyQAAnswerOnly(btn = null) {
    if (!lastQAResult) return;
    await copyToClipboard(lastQAResult.answer, "صرف جواب کاپی ہو گیا ہے۔", btn);
}

async function copyQAFullWithRefs(btn = null) {
    if (!lastQAResult) return;
    let fullText = lastQAResult.answer + "\r\n\r\n";
    fullText += "============================================================\r\n";
    fullText += `کتابی حوالہ جات (AIOU Help):\r\n`;
    fullText += `کتاب: ${lastQAResult.book_title} (کورس: ${lastQAResult.course_code})\r\n`;
    fullText += `صفحہ نمبر: ${lastQAResult.printed_page || lastQAResult.pdf_page}\r\n`;
    if (lastQAResult.references && lastQAResult.references.length > 0) {
        lastQAResult.references.forEach((r, i) => {
            fullText += `\r\n[حوالہ ${i+1}] ${r.page_display}:\r\n« ${r.quotation} »\r\n`;
        });
    }
    fullText += "============================================================";
    await copyToClipboard(fullText, "مکمل جواب بمعہ حوالہ جات کاپی ہو گیا ہے۔", btn);
}

async function copyQAOriginalQuote(btn = null) {
    if (!lastQAResult) return;
    const quote = lastQAResult.primary_quote || (lastQAResult.references && lastQAResult.references[0] ? lastQAResult.references[0].quotation : lastQAResult.answer);
    await copyToClipboard(`« ${quote} »\r\n(بحوالہ: ${lastQAResult.book_title}، صفحہ ${lastQAResult.printed_page})`, "کتاب کی اصل عبارت کاپی ہو گئی۔", btn);
}

async function copyQAQuestion(btn = null) {
    const q = document.getElementById("question-input").value.trim();
    if (q) await copyToClipboard(q, "سوال کاپی ہو گیا۔", btn);
}

// ==========================================
// FEATURE 2: پیپر کی تیاری (Exam Preparation)
// ==========================================
async function handleExamGenerate() {
    let courseCode = document.getElementById("exam-course-select") ? document.getElementById("exam-course-select").value : "";
    if (!courseCode || courseCode === "ALL") {
        const cs = document.getElementById("course-select");
        if (cs) courseCode = cs.value;
    }
    const courseSelect = document.getElementById("exam-course-select") || document.getElementById("course-select");

    // Automatically select the first real course if "ALL" or empty
    if (!courseCode || courseCode === "ALL") {
        if (courseSelect && courseSelect.options.length > 1) {
            courseSelect.selectedIndex = 1;
            courseCode = courseSelect.value;
            onCourseChange("exam");
        } else {
            alert("براہِ کرم پہلے سمسٹر منتخب فرمائیں تاکہ کتب لوڈ ہو سکیں۔");
            return;
        }
    }

    let count = 3;
    const radios = document.getElementsByName("exam-count");
    for (const r of radios) {
        if (r.checked) count = parseInt(r.value);
    }

    const spinner = document.getElementById("exam-spinner");
    const btn = document.getElementById("exam-generate-btn");
    spinner.style.display = "inline-block";
    btn.disabled = true;

    try {
        const resp = await fetch(`${API_BASE}/api/exam/questions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                course_code: courseCode,
                count_per_chapter: count
            })
        });

        if (!resp.ok) {
            throw new Error(`Exam questions API returned ${resp.status}`);
        }

        const data = await resp.json();
        if (!data || !data.chapters) {
            throw new Error("Invalid response structure from server");
        }

        lastExamData = data;
        renderExamResults(data);
    } catch (e) {
        console.error("Exam generate error:", e);
        showToast("امتحانی سوالات تیار کرنے میں دشواری پیش آئی۔ دوبارہ کوشش کریں۔");
    } finally {
        spinner.style.display = "none";
        btn.disabled = false;
    }
}

function renderExamResults(data) {
    const container = document.getElementById("exam-results-container");
    const accordion = document.getElementById("exam-chapters-accordion");
    const titleEl = document.getElementById("exam-summary-title");
    const subtitleEl = document.getElementById("exam-summary-subtitle");

    container.style.display = "block";
    container.scrollIntoView({ behavior: "smooth", block: "start" });

    titleEl.textContent = `امتحانی تیاری: ${data.book_title || "نصابی کتاب"} (کورس ${data.course_code || ""})`;
    subtitleEl.textContent = `کل چیپٹرز: ${data.total_chapters || 9} | ہر چیپٹر سے تفصیلی نوٹس: ${data.count_per_chapter || 3} | مجموعی امتحانی سوالات: ${data.total_questions || 27}`;

    accordion.innerHTML = "";

    (data.chapters || []).forEach((chap, cIdx) => {
        const block = document.createElement("div");
        block.className = "chapter-block";

        let questionsHtml = "";
        (chap.questions || []).forEach((q, qIdx) => {
            const qId = `exam-q-${cIdx}-${qIdx}`;
            
            // Build subheadings list HTML
            let subheadingsHtml = "";
            if (q.subheadings && Array.isArray(q.subheadings)) {
                subheadingsHtml = q.subheadings.map(sh => `
                    <div class="exam-subheading-card">
                        <div class="exam-subheading-title">${escapeHtml(sh.heading || sh)}</div>
                        ${sh.content ? `<div style="font-size: 0.94rem; color: #334155;">${escapeHtml(sh.content)}</div>` : ""}
                    </div>
                `).join("");
            }

            questionsHtml += `
                <div class="exam-q-item">
                    <div class="exam-q-header" onclick="toggleExamQuestion('${qId}')">
                        <span>❓ ${escapeHtml(q.question)}</span>
                        <span style="font-size: 0.85rem; color: var(--primary);">▼ مکمل جواب دیکھیں / بند کریں</span>
                    </div>
                    <div id="${qId}" class="exam-q-body">
                        
                        <!-- 1. Introduction -->
                        <div class="exam-section-badge badge-intro">۱۔ تعارف و پس منظر:</div>
                        <div class="exam-box">${escapeHtml(q.introduction || "اس سوال کا تعلق نصاب کے بنیادی موضوع سے ہے۔")}</div>

                        <!-- 2. Definition -->
                        <div class="exam-section-badge badge-def">۲۔ لغوی و اصطلاحی تعریف و مفہوم:</div>
                        <div class="exam-box" style="border-right: 4px solid #d97706; background: #fffbeb;">
                            ${escapeHtml(q.definition || "")}
                        </div>

                        <!-- 3. Detailed Explanation -->
                        <div class="exam-section-badge badge-exp">۳۔ تفصیلی اور مدلل وضاحت:</div>
                        <div class="exam-box">${escapeHtml(q.detailed_explanation || q.explanation || "")}</div>

                        <!-- 4. Subheadings -->
                        <div class="exam-section-badge badge-subh">۴۔ اہم ذیلی عنوانات اور مفصل نکات:</div>
                        <div style="margin-bottom: 1rem;">
                            ${subheadingsHtml}
                        </div>

                        <!-- 5. Quranic & Hadith Evidence -->
                        <div class="exam-section-badge badge-evidence">۵۔ شرعی و تاریخی دلائل (قرآن، سنت و کتب کے نصوص):</div>
                        <div class="exam-evidence-box">
                            ${escapeHtml(q.key_evidence || "قرآن و سنت کے نصوص اس حکم پر دلالت کرتے ہیں۔")}
                        </div>

                        <!-- 6. Contemporary Relevance -->
                        <div class="exam-section-badge badge-contemp">۶۔ معاصر اطلاق و معاشرتی تقاضے:</div>
                        <div class="exam-box">${escapeHtml(q.contemporary_significance || "عصرِ حاضر کے چیلنجز کے حل کے لیے یہ تعلیمات بنیادی اہمیت کی حامل ہیں۔")}</div>

                        <!-- 7. Conclusion -->
                        <div class="exam-section-badge badge-conclusion">۷۔ حاصلِ کلام و امتحانی خلاصہ:</div>
                        <div class="exam-box" style="background: #f1f5f9; font-weight: 600;">${escapeHtml(q.conclusion || "امتحانی پرچے میں اس نچوڑ کو پیش نظر رکھنا کامیابی کا ضامن ہے۔")}</div>

                        <!-- Source Citation -->
                        <div class="exam-source-citation">
                            <div><strong>مستند حوالہ:</strong> ${escapeHtml(q.book_title)} (کورس: ${escapeHtml(q.course_code)}) | صفحہ نمبر: ${escapeHtml(q.printed_page || "")}</div>
                            <div style="margin-top: 0.35rem; font-style: italic;">اقتباس: « ${escapeHtml(q.source_passage || "")} »</div>
                        </div>

                        <!-- 4 Single Question Copy Buttons -->
                        <div class="exam-q-actions">
                            <button class="btn btn-outline" style="font-size: 0.82rem; padding: 0.4rem 0.85rem;" onclick="copySingleQuestionAnswer(${cIdx}, ${qIdx}, 'q_only')">
                                📋 سوال کاپی کریں
                            </button>
                            <button class="btn btn-outline" style="font-size: 0.82rem; padding: 0.4rem 0.85rem;" onclick="copySingleQuestionAnswer(${cIdx}, ${qIdx}, 'ans_only')">
                                📝 جواب کاپی کریں
                            </button>
                            <button class="btn btn-outline" style="font-size: 0.82rem; padding: 0.4rem 0.85rem;" onclick="copySingleQuestionAnswer(${cIdx}, ${qIdx}, 'ans_with_ref')">
                                📜 مکمل جواب مع حوالہ کاپی کریں
                            </button>
                            <button class="btn btn-outline" style="font-size: 0.82rem; padding: 0.4rem 0.85rem;" onclick="copySingleQuestionAnswer(${cIdx}, ${qIdx}, 'q_and_a')">
                                📑 سوال اور جواب کاپی کریں
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });

        block.innerHTML = `
            <div class="chapter-header">
                <span class="chapter-title-text">${escapeHtml(chap.chapter_name)} (${chap.questions_count || chap.questions.length} سوالات)</span>
                <button class="btn btn-secondary" style="font-size: 0.82rem; padding: 0.4rem 0.85rem;" onclick="copyChapterExamQuestions(${cIdx})">
                    <span>💾 اس چیپٹر کے تمام سوالات و جوابات کاپی کریں</span>
                </button>
            </div>
            <div class="chapter-questions-list">
                ${questionsHtml}
            </div>
        `;

        accordion.appendChild(block);
    });

    // Auto-expand the very first question of Chapter 1 so the student sees the detailed answer immediately!
    const firstQ = document.getElementById("exam-q-0-0");
    if (firstQ) firstQ.classList.add("open");
}

function toggleExamQuestion(qId) {
    const el = document.getElementById(qId);
    if (!el) return;
    el.classList.toggle("open");
}

function formatSingleQAModel(q, includeQuestion = true, includeReference = true) {
    let out = [];
    if (includeQuestion) {
        out.push(`============================================================`);
        out.push(`${q.question}`);
        out.push(`============================================================\n`);
    }

    if (q.introduction) {
        out.push(`۱۔ تعارف و پس منظر:`);
        out.push(`${q.introduction}\n`);
    }
    if (q.definition) {
        out.push(`۲۔ لغوی و اصطلاحی تعریف و مفہوم:`);
        out.push(`${q.definition}\n`);
    }
    if (q.detailed_explanation) {
        out.push(`۳۔ تفصیلی اور مدلل وضاحت:`);
        out.push(`${q.detailed_explanation}\n`);
    }
    if (q.subheadings && Array.isArray(q.subheadings)) {
        out.push(`۴۔ اہم ذیلی عنوانات اور مفصل نکات:`);
        q.subheadings.forEach(sh => {
            out.push(`• ${sh.heading || sh}`);
            if (sh.content) out.push(`  ${sh.content}`);
        });
        out.push("");
    }
    if (q.key_evidence) {
        out.push(`۵۔ شرعی و تاریخی دلائل (قرآن و سنت):`);
        out.push(`${q.key_evidence}\n`);
    }
    if (q.contemporary_significance) {
        out.push(`۶۔ معاصر اطلاق و معاشرتی تقاضے:`);
        out.push(`${q.contemporary_significance}\n`);
    }
    if (q.conclusion) {
        out.push(`۷۔ حاصلِ کلام و امتحانی خلاصہ:`);
        out.push(`${q.conclusion}\n`);
    }

    if (includeReference) {
        out.push(`[مستند کتابی حوالہ - AIOU Help]`);
        out.push(`کتاب: ${q.book_title} (کورس: ${q.course_code}) | صفحہ نمبر: ${q.printed_page}`);
        if (q.source_passage) {
            out.push(`اقتباس: « ${q.source_passage} »`);
        }
        out.push(`------------------------------------------------------------\n`);
    }

    return out.join("\n");
}

async function copySingleQuestionAnswer(cIdx, qIdx, type) {
    if (!lastExamData || !lastExamData.chapters[cIdx]) return;
    const q = lastExamData.chapters[cIdx].questions[qIdx];
    let txt = "";

    if (type === "q_only") {
        txt = q.question;
        await copyToClipboard(txt, "سوال کاپی ہو گیا۔");
    } else if (type === "ans_only") {
        txt = formatSingleQAModel(q, false, false);
        await copyToClipboard(txt, "ماڈل جواب کاپی ہو گیا۔");
    } else if (type === "ans_with_ref") {
        txt = formatSingleQAModel(q, false, true);
        await copyToClipboard(txt, "مکمل جواب مع حوالہ کاپی ہو گیا۔");
    } else if (type === "q_and_a") {
        txt = formatSingleQAModel(q, true, true);
        await copyToClipboard(txt, "سوال اور تفصیلی جواب کاپی ہو گیا۔");
    }
}

async function copyChapterExamQuestions(cIdx) {
    if (!lastExamData || !lastExamData.chapters[cIdx]) return;
    const chap = lastExamData.chapters[cIdx];
    let out = [
        `============================================================`,
        `   AIOU Help — امتحانی نوٹس`,
        `   ${chap.chapter_name}`,
        `   کتاب: ${lastExamData.book_title} (کورس: ${lastExamData.course_code})`,
        `============================================================\n`
    ];

    chap.questions.forEach((q, idx) => {
        out.push(formatSingleQAModel(q, true, true));
    });

    await copyToClipboard(out.join("\n"), "پورے چیپٹر کے تمام سوالات و جوابات کاپی ہو گئے۔");
}

async function copyEntireBookExamPrep() {
    if (!lastExamData || !lastExamData.chapters) return;
    let out = [
        `============================================================`,
        `   AIOU Help — مکمل کتاب کے جامع امتحانی نوٹس (Exam Notes)`,
        `   کتاب: ${lastExamData.book_title} (کورس کوڈ: ${lastExamData.course_code})`,
        `   کل چیپٹرز: ${lastExamData.total_chapters} | مجموعی سوالات: ${lastExamData.total_questions}`,
        `============================================================\n`
    ];

    lastExamData.chapters.forEach(chap => {
        out.push(`\n############################################################`);
        out.push(`   ${chap.chapter_name}`);
        out.push(`############################################################\n`);
        chap.questions.forEach(q => {
            out.push(formatSingleQAModel(q, true, true));
        });
    });

    await copyToClipboard(out.join("\n"), "پوری کتاب کے تمام سوالات، جوابات اور حوالہ جات کاپی ہو گئے (برائے MS Word)۔");
}

// ==========================================
// FEATURE 4: MCQs تیار کریں (Chapter MCQs)
// ==========================================
async function handleMCQGenerate() {
    let courseCode = document.getElementById("mcq-course-select") ? document.getElementById("mcq-course-select").value : "";
    if (!courseCode || courseCode === "ALL") {
        const cs = document.getElementById("course-select");
        if (cs) courseCode = cs.value;
    }
    const courseSelect = document.getElementById("mcq-course-select") || document.getElementById("course-select");

    // Automatically select the first real course if "ALL" or empty
    if (!courseCode || courseCode === "ALL") {
        if (courseSelect && courseSelect.options.length > 1) {
            courseSelect.selectedIndex = 1;
            courseCode = courseSelect.value;
            onCourseChange("mcq");
        } else {
            alert("براہِ کرم پہلے سمسٹر منتخب فرمائیں تاکہ کتب لوڈ ہو سکیں۔");
            return;
        }
    }

    let count = 10;
    const radios = document.getElementsByName("mcq-gen-count");
    for (const r of radios) {
        if (r.checked) count = parseInt(r.value);
    }

    const spinner = document.getElementById("mcq-gen-spinner");
    const btn = document.getElementById("mcq-gen-btn");
    spinner.style.display = "inline-block";
    btn.disabled = true;

    try {
        const resp = await fetch(`${API_BASE}/api/exam/mcqs`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                course_code: courseCode,
                count_per_chapter: count
            })
        });

        if (!resp.ok) {
            throw new Error(`MCQs API returned ${resp.status}`);
        }

        const data = await resp.json();
        if (!data || !data.chapters) {
            throw new Error("Invalid MCQ structure from server");
        }

        lastMCQGenData = data;
        renderMCQGenResults(data);
    } catch (e) {
        console.error("MCQ generate error:", e);
        showToast("MCQs تیار کرنے میں دشواری پیش آئی۔ دوبارہ کوشش کریں۔");
    } finally {
        spinner.style.display = "none";
        btn.disabled = false;
    }
}

function renderMCQGenResults(data) {
    const area = document.getElementById("mcq-gen-results-area");
    const container = document.getElementById("mcq-gen-chapters-container");
    const titleEl = document.getElementById("mcq-gen-summary-title");
    const subtitleEl = document.getElementById("mcq-gen-summary-subtitle");

    area.style.display = "block";
    area.scrollIntoView({ behavior: "smooth", block: "start" });

    titleEl.textContent = `کثیر الانتخابی سوالات (MCQs): ${data.book_title || "نصابی کتاب"} (کورس ${data.course_code || ""})`;
    subtitleEl.textContent = `کل چیپٹرز: ${data.total_chapters || 9} | ہر چیپٹر سے MCQs: ${data.count_per_chapter || 10} | مجموعی معروضی: ${data.total_mcqs || 90}`;

    container.innerHTML = "";
    areAllMCQsRevealed = false;
    const toggleBtn = document.getElementById("mcq-toggle-text");
    if (toggleBtn) toggleBtn.textContent = "👁️ تمام درست جوابات دکھائیں";

    const optMap = { A: "الف", B: "ب", C: "ج", D: "د", "الف": "الف", "ب": "ب", "ج": "ج", "د": "د" };

    (data.chapters || []).forEach((chap, cIdx) => {
        const block = document.createElement("div");
        block.className = "chapter-block";

        let mcqsHtml = "";
        (chap.mcqs || []).forEach((m, mIdx) => {
            const mId = `mcq-rev-${cIdx}-${mIdx}`;
            const optA = m.options ? m.options.A || m.options["الف"] || "" : "";
            const optB = m.options ? m.options.B || m.options["ب"] || "" : "";
            const optC = m.options ? m.options.C || m.options["ج"] || "" : "";
            const optD = m.options ? m.options.D || m.options["د"] || "" : "";

            const winnerUrdu = optMap[m.correct_option] || m.correct_option;

            mcqsHtml += `
                <div class="mcq-display-item" id="mcq-item-${cIdx}-${mIdx}">
                    <div class="mcq-q-title">
                        <span style="color: var(--primary);">سوال ${mIdx + 1}:</span> ${escapeHtml(m.question)}
                    </div>
                    <div class="mcq-options-container">
                        <div class="mcq-option-choice mcq-choice-A" onclick="checkMCQChoice(${cIdx}, ${mIdx}, 'A')">
                            <span class="mcq-option-badge">الف</span>
                            <span>${escapeHtml(optA)}</span>
                        </div>
                        <div class="mcq-option-choice mcq-choice-B" onclick="checkMCQChoice(${cIdx}, ${mIdx}, 'B')">
                            <span class="mcq-option-badge">ب</span>
                            <span>${escapeHtml(optB)}</span>
                        </div>
                        <div class="mcq-option-choice mcq-choice-C" onclick="checkMCQChoice(${cIdx}, ${mIdx}, 'C')">
                            <span class="mcq-option-badge">ج</span>
                            <span>${escapeHtml(optC)}</span>
                        </div>
                        <div class="mcq-option-choice mcq-choice-D" onclick="checkMCQChoice(${cIdx}, ${mIdx}, 'D')">
                            <span class="mcq-option-badge">د</span>
                            <span>${escapeHtml(optD)}</span>
                        </div>
                    </div>
                    
                    <div id="${mId}" class="mcq-reveal-box" style="display: none;">
                        <div style="font-weight: 700; color: #15803d; font-size: 0.98rem;">
                            ✓ درست جواب: آپشن (${winnerUrdu}) — « ${escapeHtml(m.correct_text || optA)} »
                        </div>
                        <div style="font-size: 0.9rem; color: #334155; margin-top: 0.35rem;">
                            <strong>علمی تشریح:</strong> ${escapeHtml(m.explanation || "")}
                        </div>
                        <div style="font-size: 0.84rem; color: #64748b; margin-top: 0.35rem; display: flex; gap: 0.5rem; flex-wrap: wrap;">
                            <span class="ref-badge badge-book">📚 ${escapeHtml(data.book_title || "نصابی کتاب")}</span>
                            <span class="ref-badge badge-page">📄 صفحہ نمبر: ${escapeHtml(m.printed_page || "")}</span>
                        </div>
                        ${m.source_passage ? `
                        <div style="font-size: 0.82rem; color: #475569; margin-top: 0.35rem; font-style: italic; background: #ffffff; padding: 0.4rem 0.6rem; border-radius: 4px; border: 1px solid #dcfce7;">
                            اقتباس: « ${escapeHtml(m.source_passage)} »
                        </div>` : ""}
                    </div>

                    <div style="display: flex; justify-content: flex-end; margin-top: 0.65rem;">
                        <button class="btn btn-outline" style="font-size: 0.8rem; padding: 0.35rem 0.8rem;" onclick="copySingleMCQ(${cIdx}, ${mIdx}, this)">
                            <span>📋 یہ سوال کاپی کریں</span>
                        </button>
                    </div>
                </div>
            `;
        });

        block.innerHTML = `
            <div class="chapter-header">
                <span class="chapter-title-text">${escapeHtml(chap.chapter_name)} (${chap.mcq_count || chap.mcqs.length} معروضی سوالات)</span>
                <button class="btn btn-secondary" style="font-size: 0.82rem; padding: 0.4rem 0.85rem;" onclick="copyChapterMCQs(${cIdx}, this)">
                    <span>💾 اس چیپٹر کے MCQs کاپی کریں</span>
                </button>
            </div>
            <div style="padding: 1.25rem;">
                ${mcqsHtml}
            </div>
        `;

        container.appendChild(block);
    });
}

function checkMCQChoice(cIdx, mIdx, chosenOpt) {
    if (!lastMCQGenData || !lastMCQGenData.chapters[cIdx]) return;
    const m = lastMCQGenData.chapters[cIdx].mcqs[mIdx];
    const correctOpt = m.correct_option; // "A", "B", "C", "D"

    const itemEl = document.getElementById(`mcq-item-${cIdx}-${mIdx}`);
    if (!itemEl) return;

    // Reset styles on this question's choices
    const choices = itemEl.querySelectorAll(".mcq-option-choice");
    choices.forEach(c => {
        c.classList.remove("selected-correct", "selected-wrong", "correct-highlight");
    });

    const clicked = itemEl.querySelector(`.mcq-choice-${chosenOpt}`);
    const correct = itemEl.querySelector(`.mcq-choice-${correctOpt}`);

    const isMatch = (chosenOpt === correctOpt ||
        (chosenOpt === "A" && (correctOpt === "الف" || correctOpt === "A")) ||
        (chosenOpt === "B" && (correctOpt === "ب" || correctOpt === "B")) ||
        (chosenOpt === "C" && (correctOpt === "ج" || correctOpt === "C")) ||
        (chosenOpt === "D" && (correctOpt === "د" || correctOpt === "D"))
    );

    if (isMatch) {
        if (clicked) clicked.classList.add("selected-correct");
        showToast("✓ ماشاءاللہ، درست جواب!");
    } else {
        if (clicked) clicked.classList.add("selected-wrong");
        if (correct) correct.classList.add("correct-highlight");
        showToast("✗ جواب غلط ہے۔ درست جواب کی نشاندہی کر دی گئی ہے۔");
    }

    const revBox = document.getElementById(`mcq-rev-${cIdx}-${mIdx}`);
    if (revBox) revBox.style.display = "block";
}

async function copySingleMCQ(cIdx, mIdx, btn = null) {
    if (!lastMCQGenData || !lastMCQGenData.chapters[cIdx]) return;
    const m = lastMCQGenData.chapters[cIdx].mcqs[mIdx];
    const text = formatSingleMCQText(m);
    await copyToClipboard(text, "معروضی سوال کاپی ہو گیا۔", btn);
}

function toggleAllMCQAnswers() {
    areAllMCQsRevealed = !areAllMCQsRevealed;
    const boxes = document.querySelectorAll(".mcq-reveal-box");
    boxes.forEach(b => {
        b.style.display = areAllMCQsRevealed ? "block" : "none";
    });
    document.getElementById("mcq-toggle-text").textContent = areAllMCQsRevealed ? "🙈 درست جوابات چھپائیں" : "👁️ تمام درست جوابات دکھائیں";
}

function formatSingleMCQText(m) {
    const optA = m.options ? m.options.A || m.options["الف"] || "" : "";
    const optB = m.options ? m.options.B || m.options["ب"] || "" : "";
    const optC = m.options ? m.options.C || m.options["ج"] || "" : "";
    const optD = m.options ? m.options.D || m.options["د"] || "" : "";

    return [
        `${m.question}`,
        `الف) ${optA}`,
        `ب) ${optB}`,
        `ج) ${optC}`,
        `د) ${optD}`,
        `✓ درست جواب: آپشن (${m.correct_option}) — ${m.correct_text || optA}`,
        `وضاحت: ${m.explanation || ""}`,
        `حوالہ: کتاب ${m.book_title}، صفحہ ${m.printed_page}`,
        `------------------------------------------------------------`
    ].join("\n");
}

async function copyChapterMCQs(cIdx, btn = null) {
    if (!lastMCQGenData || !lastMCQGenData.chapters[cIdx]) return;
    const chap = lastMCQGenData.chapters[cIdx];
    let out = [
        `============================================================`,
        `=== ${chap.chapter_name} (MCQs معروضی پرچہ) ===`,
        `کتاب: ${lastMCQGenData.book_title} (کورس: ${lastMCQGenData.course_code})`,
        `============================================================\r\n`
    ];
    chap.mcqs.forEach(m => {
        out.push(formatSingleMCQText(m));
    });
    await copyToClipboard(out.join("\r\n"), "چیپٹر کے تمام MCQs کاپی ہو گئے۔", btn);
}

async function copyEntireBookMCQs(btn = null) {
    if (!lastMCQGenData || !lastMCQGenData.chapters) return;
    let out = [
        `============================================================`,
        `   AIOU Help — کثیر الانتخابی سوالات بینک (All Chapters MCQs)`,
        `   کتاب: ${lastMCQGenData.book_title} (کورس: ${lastMCQGenData.course_code})`,
        `   کل چیپٹرز: ${lastMCQGenData.total_chapters} | کل MCQs: ${lastMCQGenData.total_mcqs}`,
        `============================================================\r\n`
    ];

    lastMCQGenData.chapters.forEach(chap => {
        out.push(`\r\n### ${chap.chapter_name} ###\r\n`);
        chap.mcqs.forEach(m => {
            out.push(formatSingleMCQText(m));
        });
    });

    await copyToClipboard(out.join("\r\n"), "پوری کتاب کے تمام MCQs کاپی ہو گئے (برائے MS Word)۔", btn);
}

// ==========================================
// FEATURE 5: کوئز کے جوابات معلوم کریں (Unified Quiz Solver)
// ==========================================
let selectedQuizImageDataUrl = null;
let selectedQuizImageFile = null;

function triggerQuizImageInput() {
    const inp = document.getElementById("quiz-image-file-input");
    if (inp) {
        inp.value = "";
        inp.click();
    }
}

function handleQuizImageSelected(input) {
    if (!input || !input.files || input.files.length === 0) return;
    const file = input.files[0];
    if (!file.type.startsWith("image/")) {
        alert("براہِ کرم صرف تصویر فائل (JPG, PNG, WEBP) منتخب فرمائیں۔");
        return;
    }

    selectedQuizImageFile = file;
    const reader = new FileReader();
    reader.onload = function(e) {
        selectedQuizImageDataUrl = e.target.result;
        const previewCard = document.getElementById("quiz-image-preview-card");
        const thumb = document.getElementById("quiz-image-preview-thumb");
        const nameEl = document.getElementById("quiz-image-filename");
        const sizeEl = document.getElementById("quiz-image-filesize");
        if (thumb) thumb.src = selectedQuizImageDataUrl;
        if (nameEl) nameEl.textContent = file.name || "کوئز تصویر";
        if (sizeEl) sizeEl.textContent = `سائز: ${Math.round((file.size || 0) / 1024)} KB`;
        if (previewCard) previewCard.style.display = "flex";

        // Clear textarea text so it doesn't conflict with image upload
        const quizInput = document.getElementById("quiz-unified-input");
        if (quizInput) {
            quizInput.value = "";
            quizInput.placeholder = "تصویر منتخب ہو گئی ہے۔ سسٹم تصویر سے کوئز سوال اور آپشنز خودکار حل کرے گا۔";
        }

        showToast("کوئز کی تصویر منتخب ہو گئی ہے۔");
    };
    reader.readAsDataURL(file);
}

function removeQuizImage() {
    selectedQuizImageDataUrl = null;
    selectedQuizImageFile = null;
    const inp = document.getElementById("quiz-image-file-input");
    if (inp) inp.value = "";
    const previewCard = document.getElementById("quiz-image-preview-card");
    if (previewCard) previewCard.style.display = "none";
    const quizInput = document.getElementById("quiz-unified-input");
    if (quizInput) {
        quizInput.placeholder = "یہاں پورا کوئز سوال بمع آپشنز ایک ساتھ پیسٹ کریں، یا اوپر کیمرہ بٹن سے تصویر اپلوڈ کریں:\nمثال:\nشریعت اسلامیہ میں احکام کا اولین ماخذ کون سا ہے؟\nالف) قرآن مجید\nب) قیاس\nج) عرف";
    }
}

function fillQuizExample() {
    document.getElementById("semester-select").value = "1";
    onSemesterChange();
    document.getElementById("course-select").value = "4934";
    onCourseChange();

    const quizInput = document.getElementById("quiz-unified-input");
    if (quizInput) {
        quizInput.value = 
`اصطلاحاً غزوہ سے کیا مراد ہے؟
الف) وہ جنگ جس میں نبی کریم ﷺ نے بنفسِ نفیس شرکت فرمائی
ب) وہ جنگ جس میں صرف صحابہ کرام شریک ہوئے
ج) کسی بھی قبائلی لڑائی کو غزوہ کہتے ہیں`;
    }

    removeQuizImage();
    switchFeature("quiz");
    handleQuizSubmit();
}

function clearQuizForm() {
    const quizInput = document.getElementById("quiz-unified-input");
    if (quizInput) quizInput.value = "";
    removeQuizImage();
    const card = document.getElementById("quiz-result-card");
    if (card) card.style.display = "none";
    lastQuizResult = null;
}

async function handleQuizSubmit() {
    const semSelect = document.getElementById("quiz-semester-select") || document.getElementById("semester-select");
    const courseSelect = document.getElementById("quiz-course-select") || document.getElementById("course-select");
    const semNum = semSelect ? semSelect.value : "1";
    const courseCode = courseSelect ? courseSelect.value : "";
    const quizInput = document.getElementById("quiz-unified-input");
    const rawText = quizInput ? quizInput.value.trim() : "";

    if (!rawText && !selectedQuizImageDataUrl) {
        alert("براہِ کرم کوئز کا سوال اور آپشنز درج کریں یا کوئز کی تصویر اپلوڈ فرمائیں۔");
        return;
    }

    const spinner = document.getElementById("quiz-spinner");
    const btn = document.getElementById("quiz-submit-btn");
    if (spinner) spinner.style.display = "inline-block";
    if (btn) btn.disabled = true;

    try {
        const payload = {
            semester_num: semNum || "1",
            course_code: (courseCode && courseCode !== "ALL") ? courseCode : null
        };
        if (selectedQuizImageDataUrl) {
            payload.image_b64 = selectedQuizImageDataUrl;
            payload.mime_type = selectedQuizImageFile ? selectedQuizImageFile.type : "image/jpeg";
        } else {
            payload.raw_text = rawText;
        }

        const resp = await fetch(`${API_BASE}/api/mcq`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (!resp.ok) {
            throw new Error(`Quiz solver API returned ${resp.status}`);
        }

        const data = await resp.json();
        lastQuizResult = data;
        renderQuizResult(data);
    } catch (e) {
        console.error("Quiz solve error:", e);
        showToast("کوئز کا جواب تلاش کرنے میں دشواری پیش آئی۔");
    } finally {
        if (spinner) spinner.style.display = "none";
        if (btn) btn.disabled = false;
    }
}

function renderQuizResult(data) {
    const card = document.getElementById("quiz-result-card");
    const content = document.getElementById("quiz-result-content");

    card.style.display = "block";
    card.scrollIntoView({ behavior: "smooth", block: "start" });

    if (data.error || data.insufficient || !data.correct_option) {
        content.innerHTML = `
            <div style="background: #fffbeb; border: 1px solid #fef3c7; border-radius: 8px; padding: 1.25rem; color: #92400e;">
                <p style="font-weight: 700; font-size: 1.05rem;">⚠️ کتاب میں اس سوال کی حتمی تصدیق نہیں ہو سکی۔</p>
                <p style="margin-top: 0.35rem;">${escapeHtml(data.error || data.message || "فراہم کردہ کتابی مواد میں اس سوال کے درست آپشن کا مصدقہ ثبوت نہیں ملا۔")}</p>
            </div>
        `;
        return;
    }

    const optMap = { A: "الف", B: "ب", C: "ج", D: "د", "الف": "الف", "ب": "ب", "ج": "ج", "د": "د" };
    const winnerUrdu = optMap[data.correct_option] || data.correct_option;
    const winnerText = data.correct_text || (data.options ? data.options[data.correct_option] : "");

    let optionsHtml = "";
    if (data.options && Object.keys(data.options).length > 0) {
        optionsHtml = `<div class="mcq-options-container" style="margin-top: 0.75rem;">`;
        for (const [k, val] of Object.entries(data.options)) {
            const isWinner = (k === data.correct_option || optMap[k] === winnerUrdu);
            const urduKey = optMap[k] || k;
            optionsHtml += `
                <div class="mcq-option-choice ${isWinner ? 'correct-highlight' : ''}">
                    <strong>${urduKey})</strong> <span>${escapeHtml(val)}</span>
                </div>
            `;
        }
        optionsHtml += `</div>`;
    }

    content.innerHTML = `
        <div style="margin-bottom: 0.75rem;">
            <strong style="color: #0f172a;">❓ کوئز سوال:</strong>
            <p style="font-size: 1.05rem; font-weight: 600; color: #1e293b; margin-top: 0.25rem;">${escapeHtml(data.question || "")}</p>
        </div>

        ${optionsHtml}

        <div class="mcq-winner-row" style="margin-top: 1rem;">
            <span class="winner-pill">
                ✓ تصدیق شدہ درست جواب: آپشن (${winnerUrdu})
            </span>
            <span style="font-weight: 700; font-size: 1.05rem; color: #15803d;">
                « ${escapeHtml(winnerText)} »
            </span>
        </div>

        <div style="margin-top: 0.85rem; padding-top: 0.85rem; border-top: 1px solid #bbf7d0;">
            <div style="font-weight: 700; color: #166534; margin-bottom: 0.35rem;">📖 کتابی ثبوت اور علمی حوالہ:</div>
            <p style="color: #1e293b;">${escapeHtml(data.explanation || "کتاب کی اصل عبارت کے مطابق یہ آپشن درست ہے۔")}</p>
            
            <div class="ref-quote urdu-text" style="background: #ffffff; border-right-color: #16a34a; margin-top: 0.65rem;">
                « ${escapeHtml(data.verified_quote || (data.references && data.references[0] ? data.references[0].quotation : ""))} »
            </div>

            <div style="margin-top: 0.75rem; font-size: 0.88rem; color: #475569; display: flex; gap: 0.5rem; flex-wrap: wrap;">
                <span class="ref-badge badge-book">📚 ${escapeHtml(data.book_title || "نصابی کتاب")} (${escapeHtml(data.course_code || "")})</span>
                <span class="ref-badge badge-page">📄 صفحہ نمبر: ${escapeHtml(data.printed_page || "")}</span>
                ${data.line_reference ? `<span class="ref-badge badge-line">سطر نمبر: ${escapeHtml(data.line_reference)}</span>` : ""}
            </div>
        </div>

        <div style="margin-top: 1.25rem;">
            <button class="btn btn-outline" onclick="copyQuizResult(this)">
                <span>📋 تصدیق شدہ کوئز حل کاپی کریں</span>
            </button>
        </div>
    `;
}

async function copyQuizResult(btn = null) {
    if (!lastQuizResult) return;
    const optMap = { A: "الف", B: "ب", C: "ج", D: "د" };
    const winnerUrdu = optMap[lastQuizResult.correct_option] || lastQuizResult.correct_option;
    const winnerText = lastQuizResult.correct_text || (lastQuizResult.options ? lastQuizResult.options[lastQuizResult.correct_option] : "");

    const text = [
        `============================================================`,
        `   AIOU Help — تصدیق شدہ کوئز حل (Verified Quiz Solution)`,
        `============================================================`,
        `سوال: ${lastQuizResult.question || ""}`,
        `درست جواب: آپشن (${winnerUrdu}) — ${winnerText}`,
        `حوالہ: کتاب «${lastQuizResult.book_title || ""}» (کورس: ${lastQuizResult.course_code || ""})`,
        `صفحہ نمبر: ${lastQuizResult.printed_page || ""} | ${lastQuizResult.line_reference ? "سطر: " + lastQuizResult.line_reference : ""}`,
        `علمی وضاحت: ${lastQuizResult.explanation || ""}`,
        `اصل کتابی عبارت: « ${lastQuizResult.verified_quote || ""} »`,
        `============================================================`
    ].join("\r\n");

    await copyToClipboard(text, "کوئز کا تصدیق شدہ حل کاپی ہو گیا۔", btn);
}

// ==========================================
// FEATURE 2: تصویر سے سوال پوچھیں (Vision Image Q&A)
// ==========================================
let selectedImageDataUrl = null;
let selectedImageFile = null;
let lastImageQAResult = null;

function triggerImageFileInput() {
    const inp = document.getElementById("image-file-input");
    if (inp) {
        inp.value = "";
        inp.click();
    }
}

function triggerCameraInput() {
    const inp = document.getElementById("camera-file-input");
    if (inp) {
        inp.value = "";
        inp.click();
    }
}

function handleImageFileSelected(input) {
    if (!input || !input.files || input.files.length === 0) return;
    const file = input.files[0];
    processImageFile(file);
}

function processImageFile(file) {
    if (!file || !file.type.startsWith("image/")) {
        alert("براہِ کرم صرف تصویر فائل (JPG, PNG, WEBP) منتخب فرمائیں۔");
        return;
    }

    selectedImageFile = file;
    const reader = new FileReader();
    reader.onload = function(e) {
        selectedImageDataUrl = e.target.result;
        showImagePreview(file, selectedImageDataUrl);
    };
    reader.readAsDataURL(file);
}

function showImagePreview(file, dataUrl) {
    const previewCard = document.getElementById("image-preview-card");
    const thumb = document.getElementById("image-preview-thumb");
    const nameEl = document.getElementById("image-filename");
    const sizeEl = document.getElementById("image-filesize");

    if (thumb) thumb.src = dataUrl;
    if (nameEl) nameEl.textContent = file.name || "سوالیہ تصویر";
    const sizeKb = Math.round((file.size || 0) / 1024);
    if (sizeEl) sizeEl.textContent = `سائز: ${sizeKb} KB`;

    if (previewCard) previewCard.style.display = "flex";
}

function removeSelectedImage() {
    selectedImageDataUrl = null;
    selectedImageFile = null;
    const fileInp = document.getElementById("image-file-input");
    const camInp = document.getElementById("camera-file-input");
    if (fileInp) fileInp.value = "";
    if (camInp) camInp.value = "";
    const previewCard = document.getElementById("image-preview-card");
    const resArea = document.getElementById("image-results-area");
    if (previewCard) previewCard.style.display = "none";
    if (resArea) resArea.style.display = "none";
}

function clearImageQAForm() {
    removeSelectedImage();
    lastImageQAResult = null;
}

function setupImageDropzone() {
    const dropzone = document.getElementById("image-dropzone");
    if (!dropzone) return;

    ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.add('dragover');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.remove('dragover');
        }, false);
    });

    dropzone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files && files.length > 0) {
            processImageFile(files[0]);
        }
    }, false);

    // Global Paste Listener (Ctrl+V) for images anywhere on page
    window.addEventListener('paste', (e) => {
        if (!e.clipboardData || !e.clipboardData.items) return;
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const blob = items[i].getAsFile();
                if (blob) {
                    processImageFile(blob);
                    switchFeature('image_qa');
                    showToast("کلپ بورڈ سے تصویر وصول ہو گئی ہے۔");
                    break;
                }
            }
        }
    });
}

async function handleImageQASubmit() {
    const semNum = document.getElementById("semester-select").value;
    const courseCode = document.getElementById("course-select").value;

    if (!semNum) {
        alert("براہِ کرم پہلے سمسٹر منتخب فرمائیں۔");
        return;
    }
    if (!selectedImageDataUrl) {
        alert("براہِ کرم پہلے سوالیہ پرچے کی تصویر اپلوڈ فرمائیں۔");
        return;
    }

    const spinner = document.getElementById("image-spinner");
    const submitBtn = document.getElementById("image-submit-btn");
    spinner.style.display = "inline-block";
    submitBtn.disabled = true;

    try {
        const resp = await fetch(`${API_BASE}/api/ask_image`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                image_b64: selectedImageDataUrl,
                semester_num: semNum,
                course_code: courseCode === "ALL" ? null : courseCode,
                mime_type: selectedImageFile ? selectedImageFile.type : "image/jpeg"
            })
        });

        if (!resp.ok) {
            throw new Error(`Server returned status: ${resp.status}`);
        }

        const data = await resp.json();
        lastImageQAResult = data;
        renderImageQAResults(data);
    } catch (e) {
        console.error("Image QA error:", e);
        showToast("تصویر کے سوالات حل کرنے میں دشواری پیش آئی۔ دوبارہ کوشش کریں۔");
    } finally {
        spinner.style.display = "none";
        submitBtn.disabled = false;
    }
}

function renderImageQAResults(data) {
    const resultsArea = document.getElementById("image-results-area");
    const countText = document.getElementById("image-master-count-text");
    const container = document.getElementById("image-questions-container");

    resultsArea.style.display = "block";
    resultsArea.scrollIntoView({ behavior: "smooth", block: "start" });

    if (!data.success || !data.questions || data.questions.length === 0) {
        countText.textContent = "نتیجہ: سوال شناخت نہیں ہو سکا";
        container.innerHTML = `
            <div style="background: #fffbeb; border: 1px solid #fef3c7; border-radius: 8px; padding: 1.25rem; color: #92400e;">
                <p style="font-weight: 700; font-size: 1.05rem;">⚠️ ${escapeHtml(data.error || "تصویر میں کوئی واضح سوال شناخت نہیں ہو سکا۔")}</p>
                <p style="margin-top: 0.35rem;">براہِ کرم واضح، سیدھی اور پڑھنے کے قابل تصویر اپلوڈ فرمائیں جس میں سوالات صاف نظر آ رہے ہوں۔</p>
            </div>
        `;
        return;
    }

    countText.textContent = `تصویر سے ${data.total_questions || data.questions.length} سوالات شناخت کر کے مدلل حل کر دیے گئے ہیں:`;
    container.innerHTML = "";

    const urduNums = ["۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹", "۱۰"];

    data.questions.forEach((q, idx) => {
        const card = document.createElement("div");
        card.className = "image-q-card";

        const qNumUr = urduNums[idx] || (idx + 1);

        card.innerHTML = `
            <div class="image-q-header">
                <span class="image-q-number">📌 سوال نمبر ${qNumUr}</span>
                <span class="ref-badge badge-book">📚 ${escapeHtml(q.book_title || "نصابی کتاب")}</span>
            </div>
            <div class="image-q-text">
                ❓ <strong>سوال:</strong> ${escapeHtml(q.question)}
            </div>
            <div class="image-q-answer urdu-text">
                ${escapeHtml(q.answer)}
            </div>
            <div class="image-q-footer">
                <span class="ref-badge badge-page">📄 صفحہ نمبر: ${escapeHtml(q.printed_page || "متعلقہ")}</span>
                <button class="btn btn-outline" onclick="copySingleImageQuestion(${idx}, this)">
                    <span>📋 صرف یہ سوال و جواب کاپی کریں</span>
                </button>
            </div>
        `;
        container.appendChild(card);
    });
}

async function copySingleImageQuestion(idx, btn = null) {
    if (!lastImageQAResult || !lastImageQAResult.questions || !lastImageQAResult.questions[idx]) return;
    const q = lastImageQAResult.questions[idx];
    const text = [
        `============================================================`,
        `   AIOU Help — سوال و جواب (تصویر سے حل شدہ)`,
        `============================================================`,
        `سوال نمبر ${idx + 1}: ${q.question}`,
        `جواب:`,
        q.answer,
        `حوالہ: کتاب «${q.book_title}»، صفحہ ${q.printed_page}`,
        `============================================================`
    ].join("\r\n");

    await copyToClipboard(text, `سوال نمبر ${idx + 1} کا مکمل جواب کاپی ہو گیا۔`, btn);
}

async function copyAllImageQA(btn = null) {
    if (!lastImageQAResult) return;
    const copyText = lastImageQAResult.combined_copy_text || "کوئی مواد نہیں ملا۔";
    await copyToClipboard(copyText, "تمام سوالات و جوابات کلپ بورڈ پر کاپی ہو گئے۔", btn || document.getElementById("btn-copy-all-image-qa"));
}

// ==========================================
// PASTE HELPER
// ==========================================
async function pasteIntoInput(inputId) {
    const el = document.getElementById(inputId);
    if (!el) return;
    try {
        if (navigator.clipboard && navigator.clipboard.readText) {
            const text = await navigator.clipboard.readText();
            if (text) {
                el.value = text;
                el.focus();
                showToast("کلپ بورڈ سے ٹیکسٹ کامیابی سے پیسٹ ہو گیا۔");
                return;
            }
        }
    } catch (err) {
        console.warn("Clipboard readText restricted:", err);
    }
    el.focus();
    showToast("کی بورڈ سے Ctrl + V دبائیں یا اسکرین پر دبا کر پیسٹ کریں۔");
}

// ==========================================
// UNIVERSAL BULLETPROOF CLIPBOARD COPY
// ==========================================
async function copyToClipboard(text, successMessage = "مواد کلپ بورڈ پر کاپی ہو گیا ہے۔", btnElement = null) {
    let success = false;
    
    // Normalize newlines for Windows Word / WhatsApp paste cleanly
    const formattedText = (text || "").replace(/\r?\n/g, "\r\n");

    // 1. Try Modern Clipboard API
    if (navigator.clipboard && window.isSecureContext) {
        try {
            await navigator.clipboard.writeText(formattedText);
            success = true;
        } catch (err) {
            console.warn("navigator.clipboard failed, falling back to textarea:", err);
        }
    }

    // 2. Fallback for non-HTTPS, older mobile browsers, or restricted contexts
    if (!success) {
        try {
            const ta = document.createElement("textarea");
            ta.value = formattedText;
            ta.style.position = "fixed";
            ta.style.left = "-9999px";
            ta.style.top = "-9999px";
            ta.setAttribute("readonly", "");
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            ta.setSelectionRange(0, 99999);
            success = document.execCommand("copy");
            document.body.removeChild(ta);
        } catch (e) {
            console.error("execCommand fallback failed:", e);
        }
    }

    if (success) {
        showToast(successMessage);
        if (btnElement) {
            const origHTML = btnElement.innerHTML;
            btnElement.classList.add("btn-copied");
            btnElement.innerHTML = `<span>✓ کاپی ہو گیا!</span>`;
            setTimeout(() => {
                btnElement.classList.remove("btn-copied");
                btnElement.innerHTML = origHTML;
            }, 2000);
        }
    } else {
        alert("کاپی کرنے میں دشواری ہوئی۔ براہِ کرم ٹیکسٹ خود منتخب کر کے کاپی فرمائیں۔");
    }
}

// Utility: Show Toast Notification
let toastTimeout = null;
function showToast(message) {
    const toast = document.getElementById("toast");
    const msgEl = document.getElementById("toast-message");
    if (!toast || !msgEl) return;

    msgEl.textContent = message;
    toast.classList.add("show");

    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.classList.remove("show");
    }, 3000);
}

// Utility: HTML Sanitizer
function escapeHtml(str) {
    if (typeof str !== "string") return "";
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
