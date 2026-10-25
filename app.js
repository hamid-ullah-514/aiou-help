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

function smoothScrollToElement(elemOrId, offset = 80) {
    const el = typeof elemOrId === "string" ? document.getElementById(elemOrId) : elemOrId;
    if (!el) return;
    const y = el.getBoundingClientRect().top + window.pageYOffset - offset;
    window.scrollTo({
        top: Math.max(0, y),
        behavior: "smooth"
    });
}

// ==========================================
// INITIALIZATION
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    initApp();
});

async function initApp() {
    try {
        setupImageDropzone();
        initPastPapers();
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
    "assignment-semester-select",
    "exam-semester-select", 
    "mcq-semester-select", 
    "quiz-semester-select"
];

const ALL_COURSE_IDS = [
    "course-select", 
    "qa-course-select", 
    "image-qa-course-select", 
    "assignment-course-select",
    "exam-course-select", 
    "mcq-course-select", 
    "quiz-course-select"
];

function populateSemesterDropdown(catalog) {
    ALL_SEMESTER_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (el.tagName === "SELECT") {
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
        }

        // Default to Semester 1 for immediate smooth student experience
        el.value = "1";
    });

    onSemesterChange();
}

function onSemesterChange(source = "global") {
    let semNum = "1";
    const srcEl = document.getElementById(`${source}-semester-select`) || 
                  document.getElementById("assignment-semester-select") ||
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
                if (el.tagName === "SELECT") {
                    el.innerHTML = `<option value="">-- پہلے سمسٹر کا انتخاب ضروری ہے --</option>`;
                }
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

        if (el.tagName === "SELECT") {
            if (id === "assignment-course-select") {
                el.innerHTML = `<option value="">-- سمسٹر ${semNum} کی کتاب منتخب فرمائیں --</option>`;
            } else {
                el.innerHTML = `<option value="ALL">-- سمسٹر ${semNum} کی تمام کتب (جامع سرچ) --</option>`;
            }

            booksInSem.forEach(b => {
                const opt = document.createElement("option");
                opt.value = b.course_code;
                opt.textContent = `${b.course_code}: ${b.course_title_ur} (${b.pages_count || 0} صفحات)`;
                el.appendChild(opt);
            });
        }

        // Default to first real course
        if (booksInSem.length > 0) {
            el.value = booksInSem[0].course_code;
        }
    });

    onCourseChange(source);
}

function onCourseChange(source = "global") {
    let cCode = "";
    const srcEl = document.getElementById(`${source}-course-select`) || 
                  document.getElementById("assignment-course-select") ||
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

// Backward compatibility helpers
function syncSemesterSelection(val) {
    if (val) {
        const asgEl = document.getElementById("assignment-semester-select");
        if (asgEl) asgEl.value = val;
    }
    onSemesterChange("assignment");
}

function syncCourseSelection(val) {
    if (val) {
        const asgEl = document.getElementById("assignment-course-select");
        if (asgEl) asgEl.value = val;
    }
    onCourseChange("assignment");
}

function updateCourseDropdowns(semVal, targetId) {
    if (semVal) {
        const asgEl = document.getElementById("assignment-semester-select");
        if (asgEl) asgEl.value = semVal;
    }
    onSemesterChange("assignment");
}

// Switch between tabs / features
function switchFeature(feat, autoTriggerFile = false) {
    if (!feat) feat = "home";
    const norm = feat.replace(/_/g, "-");
    const under = feat.replace(/-/g, "_");
    currentFeature = norm;

    const allTabs = ["home", "qa", "image-qa", "assignment", "exam", "mcq-gen", "quiz"];
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
        smoothScrollToElement(activeSec, 75);
    }

    if (norm === "assignment" || under === "assignment") {
        const asgCourse = document.getElementById("assignment-course-select");
        if (asgCourse && (!asgCourse.options || asgCourse.options.length <= 1)) {
            onSemesterChange("assignment");
        }
    }

    if (norm === "exam" || under === "exam") {
        if (currentExamPrepMode === "past") {
            renderPastPapers();
        }
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
// FEATURE: ماضی کے امتحانی پرچہ جات (AIOU Past Papers PDFs)
// ==========================================
let pastPapersCatalog = null;
let currentExamPrepMode = "past"; // "past" or "book"
let currentPastCategoryFilter = "ALL";
let selectedPastPaperIds = new Set();
let activePdfModalPaper = null;

async function initPastPapers() {
    try {
        let resp = await fetch(`${API_BASE}/api/pastpapers/catalog`);
        if (!resp.ok) {
            resp = await fetch("past_papers_index.json");
        }
        if (resp.ok) {
            pastPapersCatalog = await resp.json();
            populatePastCourseDropdown();
            renderPastPapers();
            return;
        }
    } catch (e) {
        console.warn("Could not load past papers from API, trying fallback:", e);
    }

    try {
        let resp2 = await fetch("past_papers_index.json");
        if (resp2.ok) {
            pastPapersCatalog = await resp2.json();
            populatePastCourseDropdown();
            renderPastPapers();
        }
    } catch (err) {
        console.error("Fallback past papers fetch failed:", err);
    }
}

function switchExamPrepMode(mode) {
    currentExamPrepMode = mode;
    const pastBtn = document.getElementById("btn-mode-past-papers");
    const bookBtn = document.getElementById("btn-mode-book-prep");
    const pastView = document.getElementById("exam-prep-past-view");
    const bookView = document.getElementById("exam-prep-book-view");

    if (mode === "past") {
        if (pastBtn) pastBtn.classList.add("active");
        if (bookBtn) bookBtn.classList.remove("active");
        if (pastView) pastView.style.display = "block";
        if (bookView) bookView.style.display = "none";
        renderPastPapers();
        // Immediately smooth-scroll down to the past papers filters & semester selector
        setTimeout(() => smoothScrollToElement("past-filters-card", 75), 80);
    } else {
        if (bookBtn) bookBtn.classList.add("active");
        if (pastBtn) pastBtn.classList.remove("active");
        if (bookView) bookView.style.display = "block";
        if (pastView) pastView.style.display = "none";
        // Smoothly scroll down to the book prep options
        setTimeout(() => smoothScrollToElement("exam-prep-book-view", 75), 80);
    }
}

function openPastPapersDirectly() {
    switchFeature("exam");
    switchExamPrepMode("past");
    setTimeout(() => smoothScrollToElement("past-filters-card", 75), 150);
}

function onPastSemesterChange() {
    populatePastCourseDropdown();
    renderPastPapers();
    // Smooth scroll down to course selector
    setTimeout(() => smoothScrollToElement("past-course-select", 120), 120);
}

function populatePastCourseDropdown() {
    const semSelect = document.getElementById("past-semester-select");
    const courseSelect = document.getElementById("past-course-select");
    if (!semSelect || !courseSelect || !pastPapersCatalog) return;

    const semNum = semSelect.value || "1";
    courseSelect.innerHTML = `<option value="ALL">-- سمسٹر ${semNum} کی تمام کتب کے پرچے --</option>`;

    const semData = pastPapersCatalog.semesters ? pastPapersCatalog.semesters.find(s => String(s.semester_num) === String(semNum)) : null;
    if (semData && semData.courses) {
        semData.courses.forEach(c => {
            const opt = document.createElement("option");
            opt.value = c.course_code;
            opt.textContent = `${c.course_code}: ${c.course_title_ur} (${c.papers_count} پرچے)`;
            courseSelect.appendChild(opt);
        });
    }
}

function onPastCourseChange() {
    renderPastPapers();
    // Smooth scroll down to the papers grid
    setTimeout(() => smoothScrollToElement("past-papers-grid", 120), 120);
}

function onPastCategoryClick(catKey) {
    currentPastCategoryFilter = catKey;
    document.querySelectorAll(".past-cat-pill").forEach(p => {
        p.classList.remove("active");
    });
    const pill = document.getElementById(`past-pill-${catKey}`);
    if (pill) pill.classList.add("active");
    renderPastPapers();
    // Smooth scroll down to papers grid
    setTimeout(() => smoothScrollToElement("past-papers-grid", 120), 100);
}

function onPastSearchInput() {
    renderPastPapers();
}

function clearPastSearch() {
    const inp = document.getElementById("past-search-input");
    if (inp) inp.value = "";
    renderPastPapers();
}

function getFilteredPastPapers() {
    if (!pastPapersCatalog || !pastPapersCatalog.papers) return [];

    const semSelect = document.getElementById("past-semester-select");
    const courseSelect = document.getElementById("past-course-select");
    const searchInp = document.getElementById("past-search-input");

    const semNum = semSelect ? semSelect.value : "1";
    const courseCode = courseSelect ? courseSelect.value : "ALL";
    const query = searchInp ? searchInp.value.trim().toLowerCase() : "";

    return pastPapersCatalog.papers.filter(p => {
        if (semNum && String(p.semester_num) !== String(semNum)) return false;
        if (courseCode && courseCode !== "ALL" && p.course_code !== courseCode) return false;
        if (currentPastCategoryFilter && currentPastCategoryFilter !== "ALL" && p.category_key !== currentPastCategoryFilter) return false;
        if (query) {
            const match = p.clean_title.toLowerCase().includes(query) ||
                          p.filename.toLowerCase().includes(query) ||
                          p.course_code.toLowerCase().includes(query) ||
                          (p.season_ur && p.season_ur.toLowerCase().includes(query)) ||
                          (p.course_title_ur && p.course_title_ur.toLowerCase().includes(query));
            if (!match) return false;
        }
        return true;
    });
}

function updateCategoryCounts() {
    if (!pastPapersCatalog || !pastPapersCatalog.papers) return;
    const semSelect = document.getElementById("past-semester-select");
    const courseSelect = document.getElementById("past-course-select");
    const semNum = semSelect ? semSelect.value : "1";
    const courseCode = courseSelect ? courseSelect.value : "ALL";

    const basePapers = pastPapersCatalog.papers.filter(p => {
        if (semNum && String(p.semester_num) !== String(semNum)) return false;
        if (courseCode && courseCode !== "ALL" && p.course_code !== courseCode) return false;
        return true;
    });

    const counts = {
        all: basePapers.length,
        past: basePapers.filter(p => p.category_key === "past_paper").length,
        solved: basePapers.filter(p => p.category_key === "solved_paper").length,
        guess: basePapers.filter(p => p.category_key === "guess_paper").length,
        keybook: basePapers.filter(p => p.category_key === "key_book").length,
        quiz: basePapers.filter(p => p.category_key === "quiz_mcq").length
    };

    const elAll = document.getElementById("cat-count-all");
    const elPast = document.getElementById("cat-count-past");
    const elSolved = document.getElementById("cat-count-solved");
    const elGuess = document.getElementById("cat-count-guess");
    const elKey = document.getElementById("cat-count-keybook");
    const elQuiz = document.getElementById("cat-count-quiz");

    if (elAll) elAll.textContent = counts.all;
    if (elPast) elPast.textContent = counts.past;
    if (elSolved) elSolved.textContent = counts.solved;
    if (elGuess) elGuess.textContent = counts.guess;
    if (elKey) elKey.textContent = counts.keybook;
    if (elQuiz) elQuiz.textContent = counts.quiz;
}

function renderPastPapers() {
    updateCategoryCounts();
    const grid = document.getElementById("past-papers-grid");
    const empty = document.getElementById("past-papers-empty");
    if (!grid) return;

    const filtered = getFilteredPastPapers();
    if (filtered.length === 0) {
        grid.innerHTML = "";
        if (empty) empty.style.display = "block";
        updateBatchToolbar();
        return;
    }
    if (empty) empty.style.display = "none";

    let html = "";
    filtered.forEach(p => {
        const isChecked = selectedPastPaperIds.has(p.id) ? "checked" : "";
        const seasonBadge = p.season_ur ? `<span class="badge-season">🗓️ ${escapeHtml(p.season_ur)}</span>` : "";
        html += `
            <div class="past-paper-card ${isChecked ? 'selected' : ''}" id="card-${p.id}">
                <div class="card-top-row">
                    <label class="card-checkbox-label" title="منتخب کریں">
                        <input type="checkbox" class="paper-checkbox" value="${p.id}" ${isChecked} onchange="onPastPaperCheck('${p.id}', this.checked)">
                        <span class="custom-chk"></span>
                    </label>
                    <div class="card-badges">
                        <span class="badge-category cat-${p.category_key}">
                            <span>${p.category_icon}</span>
                            <span>${p.category_ur}</span>
                        </span>
                        ${seasonBadge}
                    </div>
                </div>

                <div class="card-course-info">
                    <span class="course-code-tag">${p.course_code}</span>
                    <span class="course-title-tag">${escapeHtml(p.course_title_ur)}</span>
                </div>

                <h4 class="card-paper-title" title="${escapeHtml(p.filename)}">
                    ${escapeHtml(p.clean_title)}
                </h4>

                <div class="card-meta-row">
                    <span class="meta-item">💾 ${p.size_formatted}</span>
                    <span class="meta-item">📁 ${p.file_type.toUpperCase()}</span>
                    <span class="meta-item">🎓 سمسٹر ${p.semester_num}</span>
                </div>

                <div class="card-actions-grid">
                    <button type="button" class="btn-card-action btn-read" onclick="openPdfViewerModal('${p.id}')">
                        <span>👁️</span><span>آن لائن پڑھیں</span>
                    </button>
                    <button type="button" class="btn-card-action btn-download" onclick="downloadSinglePastPaper('${p.id}')">
                        <span>⬇️</span><span>ڈاؤن لوڈ</span>
                    </button>
                    <button type="button" class="btn-card-action btn-share" onclick="shareSinglePastPaper('${p.id}')">
                        <span>📲</span><span>شیئر</span>
                    </button>
                </div>
            </div>
        `;
    });

    grid.innerHTML = html;
    updateBatchToolbar();
}

function onPastPaperCheck(paperId, isChecked) {
    if (isChecked) {
        selectedPastPaperIds.add(paperId);
    } else {
        selectedPastPaperIds.delete(paperId);
    }
    const card = document.getElementById(`card-${paperId}`);
    if (card) {
        if (isChecked) card.classList.add("selected");
        else card.classList.remove("selected");
    }
    updateBatchToolbar();
}

function toggleSelectAllPastPapers(checked) {
    const filtered = getFilteredPastPapers();
    filtered.forEach(p => {
        if (checked) {
            selectedPastPaperIds.add(p.id);
        } else {
            selectedPastPaperIds.delete(p.id);
        }
        const card = document.getElementById(`card-${p.id}`);
        if (card) {
            if (checked) card.classList.add("selected");
            else card.classList.remove("selected");
        }
    });

    const chks = document.querySelectorAll(".paper-checkbox");
    chks.forEach(c => c.checked = checked);

    updateBatchToolbar();
}

function updateBatchToolbar() {
    const count = selectedPastPaperIds.size;
    const counterBadge = document.getElementById("past-selected-counter");
    const btnDownload = document.getElementById("btn-batch-download");
    const btnShareWA = document.getElementById("btn-batch-share-wa");
    const btnCopy = document.getElementById("btn-batch-copy");
    const chkAll = document.getElementById("past-select-all-checkbox");

    const filtered = getFilteredPastPapers();
    if (chkAll) {
        chkAll.checked = filtered.length > 0 && filtered.every(p => selectedPastPaperIds.has(p.id));
    }

    if (counterBadge) {
        counterBadge.textContent = `${count} پرچہ جات منتخب`;
    }

    const disabled = count === 0;
    if (btnDownload) btnDownload.disabled = disabled;
    if (btnShareWA) btnShareWA.disabled = disabled;
    if (btnCopy) btnCopy.disabled = disabled;
}

function getPaperById(paperId) {
    if (!pastPapersCatalog || !pastPapersCatalog.papers) return null;
    return pastPapersCatalog.papers.find(p => p.id === paperId);
}

function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// ==========================================
// DIRECT FILE DOWNLOAD (To Device / Storage)
// ==========================================
async function downloadSinglePastPaper(paperId) {
    const p = getPaperById(paperId);
    if (!p) return;

    showToast(`پرچہ ڈاؤن لوڈ کیا جا رہا ہے: ${p.clean_title}...`);
    const fileUrl = `${API_BASE}${p.download_url}`;

    try {
        const resp = await fetch(fileUrl);
        if (!resp.ok) {
            throw new Error(`سرور سے ڈاؤن لوڈ نہیں ہو سکا (${resp.status})`);
        }
        const blob = await resp.blob();

        // 1. On PC (Desktop Chrome/Edge): allow user to choose folder location via File System Access API
        if (window.showSaveFilePicker && !isMobileDevice()) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: p.filename,
                    types: [{
                        description: "PDF Document",
                        accept: { "application/pdf": [".pdf"] }
                    }]
                });
                const writable = await handle.createWritable();
                await writable.write(blob);
                await writable.close();
                showToast(`✓ فائل آپ کے کمپیوٹر میں محفوظ ہو گئی: ${p.clean_title}`);
                return;
            } catch (err) {
                if (err.name === "AbortError") {
                    // User cancelled the save dialog
                    return;
                }
                // Fall through to blob anchor download
            }
        }

        // 2. Direct Blob anchor download: forces Android / iOS / PC to save directly to Downloads storage
        // (WITHOUT target="_blank" so mobile Chrome saves the file rather than viewing in a tab)
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = p.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => window.URL.revokeObjectURL(blobUrl), 30000);

        showToast(`✓ پرچہ آپ کی ڈیوائس (Downloads) میں محفوظ ہو گیا!`);
    } catch (e) {
        console.warn("Direct blob download failed, falling back to direct anchor:", e);
        // Fallback: standard anchor download
        const a = document.createElement("a");
        a.href = fileUrl;
        a.download = p.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showToast(`ڈاؤن لوڈ شروع ہوا: ${p.clean_title}`);
    }
}

// ==========================================
// DIRECT FILE SHARE (Actual PDF to WhatsApp)
// ==========================================
async function shareSinglePastPaper(paperId) {
    const p = getPaperById(paperId);
    if (!p) return;

    const fileUrl = `${API_BASE}${p.download_url}`;
    const absoluteUrl = fileUrl.startsWith("http") ? fileUrl : `https://aiou-help.vercel.app${fileUrl}`;

    const shareText = [
        `📚 *علامہ اقبال اوپن یونیورسٹی (AIOU BS Islamic Studies)*`,
        `📑 *پرچہ:* ${p.clean_title}`,
        `📖 *کورس:* ${p.course_code} - ${p.course_title_ur}`,
        `🎓 *سمسٹر:* سمسٹر ${p.semester_num}`,
        `📁 *قسم:* ${p.category_ur}`,
        p.season_ur ? `🗓️ *سیشن:* ${p.season_ur}` : ``,
        `💾 *سائز:* ${p.size_formatted}`,
        `----------------------------------------`,
        `🌐 *آن لائن پورٹل:* https://aiou-help.vercel.app`,
        `[AIOU Help Study Portal]`
    ].filter(Boolean).join("\n");

    showToast(`شیئر کے لیے پی ڈی ایف فائل تیار ہو رہی ہے...`);

    // 1. Try Web Share API with real PDF file attachment (WhatsApp receives actual .pdf document!)
    if (navigator.share) {
        try {
            const resp = await fetch(fileUrl);
            if (resp.ok) {
                const blob = await resp.blob();
                const file = new File([blob], p.filename, { type: "application/pdf" });

                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    await navigator.share({
                        files: [file],
                        title: p.clean_title,
                        text: `علامہ اقبال اوپن یونیورسٹی - ${p.clean_title}`
                    });
                    showToast("✓ پی ڈی ایف فائل واٹس ایپ / ایپس پر شیئر ہو گئی!");
                    return;
                }
            }
        } catch (err) {
            if (err.name === "AbortError") {
                return; // User closed the native share dialog
            }
            console.warn("Native file sharing error, falling back to link sharing:", err);
        }

        // Try native text/link share if file sharing wasn't accepted
        try {
            await navigator.share({
                title: p.clean_title,
                text: shareText,
                url: absoluteUrl
            });
            showToast("✓ پرچہ شیئر ہو گیا۔");
            return;
        } catch (err) {
            if (err.name === "AbortError") return;
        }
    }

    // 2. Fallback to WhatsApp URL with direct download link
    const waText = `${shareText}\n📥 *براہ راست پی ڈی ایف ڈاؤن لوڈ:* ${absoluteUrl}`;
    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(waText)}`;
    window.open(waUrl, "_blank");
    showToast("واٹس ایپ پر شیئر ونڈو کھل گئی۔");
}

async function shareSelectedPastPapersWhatsApp() {
    if (selectedPastPaperIds.size === 0) return;
    const selected = Array.from(selectedPastPaperIds).map(id => getPaperById(id)).filter(Boolean);

    // If only 1 paper is selected, use single paper file share
    if (selected.length === 1) {
        await shareSinglePastPaper(selected[0].id);
        return;
    }

    // If 2 to 5 papers, attempt native multi-file sharing
    if (navigator.share && navigator.canShare && selected.length <= 5) {
        try {
            showToast(`${selected.length} پرچہ جات شیئر کے لیے تیار ہو رہے ہیں...`);
            const filePromises = selected.map(async p => {
                const resp = await fetch(`${API_BASE}${p.download_url}`);
                if (!resp.ok) return null;
                const blob = await resp.blob();
                return new File([blob], p.filename, { type: "application/pdf" });
            });
            const files = (await Promise.all(filePromises)).filter(Boolean);
            if (files.length > 0 && navigator.canShare({ files })) {
                await navigator.share({
                    files: files,
                    title: `علامہ اقبال اوپن یونیورسٹی - ${selected.length} امتحانی پرچہ جات`,
                    text: `علامہ اقبال اوپن یونیورسٹی (AIOU BS Islamic Studies) کے ${selected.length} منتخب پرچہ جات:`
                });
                showToast(`✓ تمام ${files.length} پرچہ جات واٹس ایپ / ایپس پر شیئر ہو گئے!`);
                return;
            }
        } catch (err) {
            if (err.name === "AbortError") return;
            console.warn("Multiple files share failed, falling back to text:", err);
        }
    }

    // Text summary fallback
    let text = [
        `📚 *علامہ اقبال اوپن یونیورسٹی (AIOU) - منتخب شدہ امتحانی پرچہ جات*`,
        `📋 *کل منتخب پرچے:* ${selected.length} پرچہ جات`,
        `----------------------------------------`
    ];

    selected.forEach((p, i) => {
        text.push(`${i + 1}. ${p.category_icon} *${p.course_code}:* ${p.clean_title} (${p.size_formatted})`);
    });

    text.push(`----------------------------------------`);
    text.push(`🌐 *تمام پرچے آن لائن پڑھیں اور ڈاؤن لوڈ کریں:*`);
    text.push(`👉 https://aiou-help.vercel.app`);
    text.push(`----------------------------------------`);
    text.push(`[AIOU Help Study Portal]`);

    const fullText = text.join("\n");
    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(fullText)}`;
    window.open(waUrl, "_blank");
    showToast(`${selected.length} پرچہ جات واٹس ایپ پر شیئر کیے جا رہے ہیں...`);
}

async function copySelectedPastPapersList() {
    if (selectedPastPaperIds.size === 0) return;
    const selected = Array.from(selectedPastPaperIds).map(id => getPaperById(id)).filter(Boolean);

    let text = [
        `============================================================`,
        `   علامہ اقبال اوپن یونیورسٹی - منتخب شدہ امتحانی پرچہ جات`,
        `   کل تعداد: ${selected.length} پرچہ جات`,
        `============================================================\r\n`
    ];

    selected.forEach((p, i) => {
        text.push(`${i + 1}. [${p.course_code}] ${p.clean_title} | ${p.category_ur} | سائز: ${p.size_formatted} | سمسٹر: ${p.semester_num}`);
    });

    text.push(`\r\n============================================================`);
    text.push(`آن لائن مطالعہ و ڈاؤن لوڈ پورٹل: https://aiou-help.vercel.app`);
    text.push(`============================================================`);

    await copyToClipboard(text.join("\r\n"), `${selected.length} پرچہ جات کی مکمل فہرست کاپی ہو گئی۔`);
}

async function downloadSelectedPastPapers() {
    if (selectedPastPaperIds.size === 0) return;
    const ids = Array.from(selectedPastPaperIds);

    showToast(`${ids.length} پرچہ جات کا زپ آرکائیو تیار ہو رہا ہے...`);

    try {
        const resp = await fetch(`${API_BASE}/api/pastpapers/batch-zip`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ paper_ids: ids })
        });

        if (resp.ok) {
            const blob = await resp.blob();

            // PC File Picker
            if (window.showSaveFilePicker && !isMobileDevice()) {
                try {
                    const handle = await window.showSaveFilePicker({
                        suggestedName: `AIOU_Selected_Past_Papers_${ids.length}.zip`,
                        types: [{
                            description: "ZIP Archive",
                            accept: { "application/zip": [".zip"] }
                        }]
                    });
                    const writable = await handle.createWritable();
                    await writable.write(blob);
                    await writable.close();
                    showToast(`✓ تمام ${ids.length} پرچہ جات کی زپ فائل آپ کے کمپیوٹر میں محفوظ ہو گئی!`);
                    return;
                } catch (err) {
                    if (err.name === "AbortError") return;
                }
            }

            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `AIOU_Selected_Past_Papers_${ids.length}.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => window.URL.revokeObjectURL(url), 30000);
            showToast(`کامیابی! زپ فائل ڈاؤن لوڈز میں محفوظ ہو گئی (${ids.length} پرچہ جات)`);
            return;
        }
    } catch (e) {
        console.warn("Batch zip fetch failed, falling back to individual download:", e);
    }

    let delay = 0;
    ids.forEach(pid => {
        const p = getPaperById(pid);
        if (p) {
            setTimeout(() => {
                downloadSinglePastPaper(pid);
            }, delay);
            delay += 600;
        }
    });
}

function showPdfFallbackCard(p) {
    const iframe = document.getElementById("pdf-modal-iframe");
    const fallback = document.getElementById("pdf-modal-fallback");
    const loading = document.getElementById("pdf-modal-loading");

    if (iframe) iframe.style.display = "none";
    if (loading) loading.style.display = "none";

    if (fallback) {
        fallback.innerHTML = `
            <div class="pdf-fallback-card">
                <div class="pdf-fallback-icon">📑</div>
                <h3 class="pdf-fallback-title">${escapeHtml(p.clean_title)}</h3>
                <p class="pdf-fallback-meta">${escapeHtml(p.course_code)} - ${escapeHtml(p.course_title_ur)} (سمسٹر ${p.semester_num})</p>
                
                <div class="pdf-fallback-tip-box">
                    <strong>💡 اس پرچے کا سائز ${p.size_formatted} ہے:</strong><br>
                    براہِ راست اپنی ڈیوائس کی میموری (Downloads) میں محفوظ کرنے کے لیے نیچے بٹن دبائیں یا واٹس ایپ پر حاصل کریں۔
                </div>

                <div class="pdf-fallback-btns">
                    <button type="button" class="pdf-modal-btn btn-modal-download" onclick="downloadSinglePastPaper('${p.id}')">
                        <span>⬇️ ڈیوائس میں محفوظ کریں</span>
                    </button>
                    <button type="button" class="pdf-modal-btn btn-modal-share" onclick="shareSinglePastPaper('${p.id}')">
                        <span>📲 واٹس ایپ پر فائل بھیجیں</span>
                    </button>
                </div>
            </div>
        `;
        fallback.style.display = "flex";
    }
}

let currentPdfDocument = null;
let currentRenderToken = 0;
let currentPdfViewerMode = "google"; // "google" (HD Nastaliq view) or "canvas" (PDF.js)

function togglePdfViewerMode() {
    if (!activePdfModalPaper) return;
    currentPdfViewerMode = (currentPdfViewerMode === "google") ? "canvas" : "google";
    renderActivePdfInViewer(activePdfModalPaper);
}

async function renderActivePdfInViewer(p) {
    const iframe = document.getElementById("pdf-modal-iframe");
    const canvasContainer = document.getElementById("pdf-modal-canvas-container");
    const loading = document.getElementById("pdf-modal-loading");
    const loadingText = document.getElementById("pdf-modal-loading-text") || (loading ? loading.querySelector("span") : null);
    const fallback = document.getElementById("pdf-modal-fallback");
    const toggleBtnText = document.getElementById("btn-modal-toggle-view-text");

    if (fallback) fallback.style.display = "none";
    if (loading) {
        loading.style.display = "flex";
        if (loadingText) loadingText.textContent = "پرچہ کے صفحات تیار ہو رہے ہیں، براہِ کرم انتظار فرمائیں...";
    }

    const fileUrl = `${API_BASE}${p.view_url}`;
    const absoluteUrl = fileUrl.startsWith("http") ? fileUrl : `https://aiou-help.vercel.app${fileUrl}`;

    // 1. GOOGLE DOCS HD VIEWER (Official Google Cloud PDF engine: 100% authentic Jameel Noori Nastaliq / Urdu fonts!)
    if (currentPdfViewerMode === "google") {
        if (toggleBtnText) toggleBtnText.textContent = "🖼️ کینوس موڈ میں دیکھیں";
        if (canvasContainer) {
            canvasContainer.innerHTML = "";
            canvasContainer.style.display = "none";
        }
        if (iframe) {
            iframe.style.display = "block";
            iframe.onload = () => {
                if (loading) loading.style.display = "none";
            };
            iframe.onerror = () => {
                console.warn("Google Docs viewer error, switching to canvas mode...");
                currentPdfViewerMode = "canvas";
                renderActivePdfInViewer(p);
            };
            iframe.src = `https://docs.google.com/viewer?url=${encodeURIComponent(absoluteUrl)}&embedded=true`;
        }
        return;
    }

    // 2. CANVAS VIEWER (Mozilla PDF.js with CMaps and standardFontData)
    if (toggleBtnText) toggleBtnText.textContent = "🌐 گوگل ایچ ڈی ویور (بہترین نستعلیق)";
    if (iframe) {
        iframe.src = "about:blank";
        iframe.style.display = "none";
    }
    if (canvasContainer) {
        canvasContainer.innerHTML = "";
        canvasContainer.style.display = "flex";
    }

    const renderId = ++currentRenderToken;
    if (window.pdfjsLib) {
        try {
            if (window.pdfjsLib.GlobalWorkerOptions) {
                window.pdfjsLib.GlobalWorkerOptions.workerSrc = "js/pdf.worker.min.js";
            }
            const loadingTask = window.pdfjsLib.getDocument({
                url: fileUrl,
                cMapUrl: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/",
                cMapPacked: true,
                standardFontDataUrl: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/standard_fonts/",
                enableXfa: true,
                verbosity: 0
            });
            const pdfDoc = await loadingTask.promise;
            if (renderId !== currentRenderToken) return;
            currentPdfDocument = pdfDoc;

            if (canvasContainer) canvasContainer.innerHTML = "";

            const totalPages = pdfDoc.numPages;
            for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
                if (renderId !== currentRenderToken) return;
                const page = await pdfDoc.getPage(pageNum);
                
                const containerWidth = canvasContainer ? (canvasContainer.clientWidth || window.innerWidth) - 24 : 650;
                const unscaledViewport = page.getViewport({ scale: 1 });
                const targetScale = Math.min(2.5, Math.max(1.0, containerWidth / unscaledViewport.width));
                const viewport = page.getViewport({ scale: targetScale });

                const wrapper = document.createElement("div");
                wrapper.className = "pdf-page-wrapper";

                if (totalPages > 1) {
                    const badge = document.createElement("span");
                    badge.className = "pdf-page-badge";
                    badge.textContent = `صفحہ ${pageNum} از ${totalPages}`;
                    wrapper.appendChild(badge);
                }

                const canvas = document.createElement("canvas");
                canvas.className = "pdf-page-canvas";
                const ctx = canvas.getContext("2d");
                canvas.height = viewport.height;
                canvas.width = viewport.width;

                wrapper.appendChild(canvas);
                if (canvasContainer) canvasContainer.appendChild(wrapper);

                await page.render({ canvasContext: ctx, viewport: viewport }).promise;

                if (pageNum === 1 && loading) {
                    loading.style.display = "none";
                }
            }

            if (loading) loading.style.display = "none";
            return;
        } catch (pdfErr) {
            console.warn("PDF.js render failed, switching to Google Docs viewer:", pdfErr);
            currentPdfViewerMode = "google";
            renderActivePdfInViewer(p);
            return;
        }
    }

    // Fallback if no pdfjsLib
    currentPdfViewerMode = "google";
    renderActivePdfInViewer(p);
}

async function openPdfViewerModal(paperId) {
    const p = getPaperById(paperId);
    if (!p) return;
    activePdfModalPaper = p;

    const modal = document.getElementById("pdf-viewer-modal");
    const titleEl = document.getElementById("pdf-modal-title");
    const metaEl = document.getElementById("pdf-modal-meta");

    if (titleEl) titleEl.textContent = p.clean_title;
    if (metaEl) metaEl.textContent = `${p.course_code}: ${p.course_title_ur} | ${p.category_ur} | سائز: ${p.size_formatted} | سمسٹر ${p.semester_num}`;

    if (modal) {
        modal.style.display = "flex";
        document.body.style.overflow = "hidden";
    }

    // PUSH HISTORY STATE so Android hardware/gesture back button closes the modal without exiting the website!
    try {
        if (!window.history.state || window.history.state.modal !== "pdf_viewer") {
            window.history.pushState({ modal: "pdf_viewer", paperId: paperId }, "", window.location.href);
        }
    } catch (e) {
        console.warn("History pushState failed:", e);
    }

    // Verify whether file is reachable
    const fileUrl = `${API_BASE}${p.view_url}`;
    try {
        const headCheck = await fetch(fileUrl, { method: "HEAD" });
        if (!headCheck.ok) {
            showPdfFallbackCard(p);
            return;
        }
    } catch (e) {
        // Continue
    }

    // Default to Google Docs HD viewer: preserves 100% authentic Urdu Nastaliq fonts and connected text
    currentPdfViewerMode = "google";
    renderActivePdfInViewer(p);
}

function closePdfViewerModal(triggerHistoryBack = true) {
    const modal = document.getElementById("pdf-viewer-modal");
    if (!modal || modal.style.display === "none") return;

    currentRenderToken++;
    const iframe = document.getElementById("pdf-modal-iframe");
    const canvasContainer = document.getElementById("pdf-modal-canvas-container");
    const fallback = document.getElementById("pdf-modal-fallback");

    if (iframe) {
        iframe.src = "about:blank";
        iframe.style.display = "none";
    }
    if (canvasContainer) {
        canvasContainer.innerHTML = "";
        canvasContainer.style.display = "none";
    }
    if (fallback) fallback.style.display = "none";
    modal.style.display = "none";
    document.body.style.overflow = "";

    const lastPaperId = activePdfModalPaper ? activePdfModalPaper.id : null;
    activePdfModalPaper = null;
    currentPdfDocument = null;

    // Pop the history state if user clicked (✕) button so history remains clean
    if (triggerHistoryBack && window.history.state && window.history.state.modal === "pdf_viewer") {
        try {
            window.history.back();
        } catch (e) {}
    }

    // Smoothly ensure student is positioned right back at the card of that paper
    if (lastPaperId) {
        setTimeout(() => {
            const cardEl = document.getElementById(`card-${lastPaperId}`);
            if (cardEl) {
                smoothScrollToElement(cardEl, 120);
            }
        }, 80);
    }
}

// Global listener for Android / Browser Hardware Back Button
window.addEventListener("popstate", function(event) {
    const modal = document.getElementById("pdf-viewer-modal");
    if (modal && modal.style.display !== "none") {
        // Close modal without calling history.back() again
        closePdfViewerModal(false);
    }
});

function downloadActivePdfModal() {
    if (activePdfModalPaper) {
        downloadSinglePastPaper(activePdfModalPaper.id);
    }
}

function shareActivePdfModal() {
    if (activePdfModalPaper) {
        shareSinglePastPaper(activePdfModalPaper.id);
    }
}

function togglePdfModalFullscreen() {
    const container = document.querySelector(".pdf-modal-container");
    if (container) {
        container.classList.toggle("fullscreen-mode");
    }
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

    const totalChaps = data.total_chapters || (data.chapters ? data.chapters.length : 9);
    const totalMCQs = data.total_mcqs || (data.chapters ? data.chapters.reduce((acc, c) => acc + (c.mcqs ? c.mcqs.length : 0), 0) : 90);

    titleEl.textContent = `کثیر الانتخابی سوالات (MCQs): ${data.book_title || "نصابی کتاب"} (کورس ${data.course_code || ""})`;
    subtitleEl.textContent = `کل چیپٹرز: ${totalChaps} | ہر چیپٹر سے MCQs: ${data.count_per_chapter || 10} | مجموعی معروضی: ${totalMCQs}`;

    container.innerHTML = "";
    areAllMCQsRevealed = true;
    const toggleBtn = document.getElementById("mcq-toggle-text");
    if (toggleBtn) toggleBtn.textContent = "🙈 درست جوابات پر ٹک چھپائیں (سیلف ٹیسٹ موڈ)";

    const optMap = { A: "الف", B: "ب", C: "ج", D: "د", "الف": "الف", "ب": "ب", "ج": "ج", "د": "د" };

    // 1. MASTER QUICK COPY HUB (تینوں کاپی کے اختیارات)
    const copyHub = document.createElement("div");
    copyHub.className = "mcq-master-copy-hub";
    copyHub.innerHTML = `
        <div class="copy-hub-header">
            <div class="copy-hub-title">
                <span style="font-size: 1.25rem;">📋</span>
                <span>معروضی سوالات (MCQs) کاپی کرنے کے ۳ آسان اختیارات</span>
            </div>
            <div class="copy-hub-instruction">
                <span>آپ اپنی ضرورت کے مطابق درج ذیل ۳ طریقوں سے سوالات کاپی کر سکتے ہیں (تمام اختیارات میں درست جواب کے سامنے ✓ کا نشان، کتاب، یونٹ نمبر اور صفحہ نمبر شامل ہو گا):</span>
            </div>
        </div>
        <div class="copy-hub-cards-grid">
            <div class="copy-hub-card">
                <div class="card-num">۱</div>
                <div class="card-title">ایک ایک سوال کاپی کریں</div>
                <div class="card-desc">ہر سوال کے اوپر اور نیچے کاپی کا بٹن موجود ہے۔</div>
            </div>
            <div class="copy-hub-card">
                <div class="card-num">۲</div>
                <div class="card-title">ایک پورا باب اکٹھا کاپی کریں</div>
                <div class="card-desc">ہر باب کے شروع اور آخر میں اس باب کے تمام سوالات کاپی کرنے کا بٹن ہے۔</div>
            </div>
            <div class="copy-hub-card highlight">
                <div class="card-num">۳</div>
                <div class="card-title">تمام ابواب اکٹھے کاپی کریں</div>
                <div class="card-desc">پوری کتاب کے تمام ۹ ابواب کے تمام ${totalMCQs} سوالات ایک ہی کلک سے کاپی کریں۔</div>
            </div>
        </div>
        <div class="copy-hub-main-action">
            <button class="btn btn-primary btn-purple btn-copy-all-master" onclick="copyEntireBookMCQs(this)">
                <span>💾 پوری کتاب کے تمام چیپٹرز کے تمام MCQs ایک ساتھ کاپی کریں (مع ✓ درست نشانات برائے MS Word)</span>
            </button>
            <button class="btn btn-secondary" onclick="toggleAllMCQAnswers()">
                <span id="mcq-toggle-text-hub">🙈 درست جوابات پر ٹک چھپائیں (سیلف ٹیسٹ موڈ)</span>
            </button>
        </div>
    `;
    container.appendChild(copyHub);

    // 2. RENDER EACH CHAPTER
    (data.chapters || []).forEach((chap, cIdx) => {
        const block = document.createElement("div");
        block.className = "chapter-block";

        const unitNum = chap.unit_num || (cIdx + 1);
        const chapTitle = chap.chapter_name || `یونٹ نمبر ${unitNum}`;
        const chapTitleClean = chapTitle.replace(/^یونٹ\s*نمبر\s*\d+[:\s-]*/, "");
        const pagesRange = chap.pages_range || "";
        const mcqCount = chap.mcq_count || (chap.mcqs ? chap.mcqs.length : 0);

        let mcqsHtml = "";
        (chap.mcqs || []).forEach((m, mIdx) => {
            const mId = `mcq-rev-${cIdx}-${mIdx}`;
            const optA = m.options ? m.options.A || m.options["الف"] || "" : "";
            const optB = m.options ? m.options.B || m.options["ب"] || "" : "";
            const optC = m.options ? m.options.C || m.options["ج"] || "" : "";
            const optD = m.options ? m.options.D || m.options["د"] || "" : "";

            const winnerKey = m.correct_option || "A";
            const winnerUrdu = optMap[winnerKey] || winnerKey;

            const isWinnerA = (winnerKey === "A" || winnerKey === "الف");
            const isWinnerB = (winnerKey === "B" || winnerKey === "ب");
            const isWinnerC = (winnerKey === "C" || winnerKey === "ج");
            const isWinnerD = (winnerKey === "D" || winnerKey === "د");

            const winnerText = m.correct_text || (isWinnerA ? optA : isWinnerB ? optB : isWinnerC ? optC : optD);

            const bookTitle = m.book_title || data.book_title || "نصابی کتاب";
            const courseCode = data.course_code || "";
            const pageNum = m.printed_page || pagesRange || "مستند ماخذ";

            mcqsHtml += `
                <div class="mcq-display-item" id="mcq-item-${cIdx}-${mIdx}">
                    <!-- Top Metadata Badges & Single Copy Button Bar -->
                    <div class="mcq-item-header-bar">
                        <div class="mcq-meta-badges">
                            <span class="badge-pill badge-book" title="کتاب کا نام و کورس کوڈ">📚 کتاب: ${escapeHtml(bookTitle)} ${courseCode ? `(${escapeHtml(courseCode)})` : ''}</span>
                            <span class="badge-pill badge-unit" title="یونٹ نمبر اور باب کا نام">📖 یونٹ نمبر ${unitNum}: ${escapeHtml(chapTitleClean)}</span>
                            <span class="badge-pill badge-page" title="کتاب کا صفحہ نمبر">📄 صفحہ نمبر: ${escapeHtml(pageNum)}</span>
                        </div>
                        <button class="btn btn-outline btn-copy-single" onclick="copySingleMCQ(${cIdx}, ${mIdx}, this)" title="صرف یہ ایک سوال کاپی کریں">
                            <span class="copy-icon">📋</span>
                            <span>یہ ایک سوال کاپی کریں (مع ✓ درست نشان)</span>
                        </button>
                    </div>

                    <!-- Question Title -->
                    <div class="mcq-q-title">
                        <span class="mcq-q-num-tag">سوال ${mIdx + 1}:</span>
                        <span class="mcq-q-text">${escapeHtml(m.question)}</span>
                    </div>

                    <!-- Options Container with ✓ on Winning Option -->
                    <div class="mcq-options-container">
                        <div class="mcq-option-choice mcq-choice-A ${isWinnerA ? 'is-correct-choice' : ''}" onclick="checkMCQChoice(${cIdx}, ${mIdx}, 'A')">
                            <span class="mcq-option-badge">الف</span>
                            <span class="mcq-option-text">${escapeHtml(optA)}</span>
                            ${isWinnerA ? '<span class="mcq-tick-badge"><span class="tick-icon">✓</span> (درست جواب)</span>' : ''}
                        </div>
                        <div class="mcq-option-choice mcq-choice-B ${isWinnerB ? 'is-correct-choice' : ''}" onclick="checkMCQChoice(${cIdx}, ${mIdx}, 'B')">
                            <span class="mcq-option-badge">ب</span>
                            <span class="mcq-option-text">${escapeHtml(optB)}</span>
                            ${isWinnerB ? '<span class="mcq-tick-badge"><span class="tick-icon">✓</span> (درست جواب)</span>' : ''}
                        </div>
                        <div class="mcq-option-choice mcq-choice-C ${isWinnerC ? 'is-correct-choice' : ''}" onclick="checkMCQChoice(${cIdx}, ${mIdx}, 'C')">
                            <span class="mcq-option-badge">ج</span>
                            <span class="mcq-option-text">${escapeHtml(optC)}</span>
                            ${isWinnerC ? '<span class="mcq-tick-badge"><span class="tick-icon">✓</span> (درست جواب)</span>' : ''}
                        </div>
                        <div class="mcq-option-choice mcq-choice-D ${isWinnerD ? 'is-correct-choice' : ''}" onclick="checkMCQChoice(${cIdx}, ${mIdx}, 'D')">
                            <span class="mcq-option-badge">د</span>
                            <span class="mcq-option-text">${escapeHtml(optD)}</span>
                            ${isWinnerD ? '<span class="mcq-tick-badge"><span class="tick-icon">✓</span> (درست جواب)</span>' : ''}
                        </div>
                    </div>
                    
                    <!-- Reveal Box with Explanation, Book, Unit & Page Details -->
                    <div id="${mId}" class="mcq-reveal-box" style="display: block;">
                        <div style="font-weight: 700; color: #15803d; font-size: 0.98rem; display: flex; align-items: center; gap: 0.4rem;">
                            <span>✓</span>
                            <span>درست جواب: آپشن (${winnerUrdu}) — « ${escapeHtml(winnerText)} »</span>
                        </div>
                        <div style="font-size: 0.9rem; color: #334155; margin-top: 0.35rem;">
                            <strong>علمی تشریح:</strong> ${escapeHtml(m.explanation || "")}
                        </div>
                        <div style="font-size: 0.84rem; color: #64748b; margin-top: 0.35rem; display: flex; gap: 0.5rem; flex-wrap: wrap;">
                            <span class="ref-badge badge-book">📚 کتاب: ${escapeHtml(bookTitle)} ${courseCode ? `(${escapeHtml(courseCode)})` : ''}</span>
                            <span class="ref-badge badge-unit">📖 یونٹ نمبر ${unitNum}</span>
                            <span class="ref-badge badge-page">📄 صفحہ نمبر: ${escapeHtml(pageNum)}</span>
                        </div>
                        ${m.source_passage ? `
                        <div style="font-size: 0.82rem; color: #475569; margin-top: 0.35rem; font-style: italic; background: #ffffff; padding: 0.4rem 0.6rem; border-radius: 4px; border: 1px solid #dcfce7;">
                            اقتباس: « ${escapeHtml(m.source_passage)} »
                        </div>` : ""}
                    </div>

                    <!-- Bottom Secondary Copy Button (Quick Copy at bottom of card) -->
                    <div class="mcq-item-bottom-bar">
                        <button class="btn btn-outline btn-copy-single" onclick="copySingleMCQ(${cIdx}, ${mIdx}, this)">
                            <span class="copy-icon">📋</span>
                            <span>یہ ایک سوال کاپی کریں (مع ✓ درست نشان)</span>
                        </button>
                    </div>
                </div>
            `;
        });

        block.innerHTML = `
            <div class="chapter-header">
                <div class="chapter-header-info">
                    <span class="chapter-badge">باب نمبر ${unitNum}</span>
                    <span class="chapter-title-text">${escapeHtml(chapTitle)}</span>
                    <span class="chapter-count-pill">${mcqCount} معروضی سوالات</span>
                    ${pagesRange ? `<span class="chapter-pages-pill">صفحات: ${escapeHtml(pagesRange)}</span>` : ''}
                </div>
                <button class="btn btn-secondary btn-copy-chapter" onclick="copyChapterMCQs(${cIdx}, this)">
                    <span class="copy-icon">📑</span>
                    <span>اس پورے باب کے تمام سوالات کاپی کریں (مع ✓ درست نشانات)</span>
                </button>
            </div>
            <div class="chapter-body-content" style="padding: 1.25rem;">
                ${mcqsHtml}
            </div>
            <div class="chapter-footer-bar">
                <div class="chapter-footer-info">
                    <span>✅ باب نمبر ${unitNum} کے تمام (${mcqCount}) معروضی سوالات مکمل۔</span>
                </div>
                <button class="btn btn-secondary btn-copy-chapter" onclick="copyChapterMCQs(${cIdx}, this)">
                    <span class="copy-icon">📑</span>
                    <span>باب نمبر ${unitNum} کے تمام سوالات اکٹھے کاپی کریں (مع ✓ درست نشانات)</span>
                </button>
            </div>
        `;

        container.appendChild(block);
    });

    // 3. MASTER BOTTOM EXPORT BAR (End-of-Page Copy All)
    const bottomMasterBar = document.createElement("div");
    bottomMasterBar.className = "mcq-bottom-master-bar";
    bottomMasterBar.innerHTML = `
        <div class="bottom-bar-content">
            <div class="bottom-bar-text">
                <strong style="font-size: 1.1rem; color: #4c1d95;">📚 تمام ${totalChaps} ابواب کے مجموعی ${totalMCQs} معروضی سوالات مکمل ہو چکے ہیں۔</strong>
                <p style="margin-top: 0.35rem; color: #5b21b6; font-size: 0.95rem;">
                    پوری کتاب کے تمام سوالات مع ✓ درست نشانات، کتاب، یونٹ نمبر اور صفحات ایک کلک سے کاپی کر کے MS Word یا WhatsApp میں محفوظ فرمائیں۔
                </p>
            </div>
            <button class="btn btn-primary btn-purple btn-copy-all-master" onclick="copyEntireBookMCQs(this)">
                <span>💾 پوری کتاب کے تمام چیپٹرز کے تمام MCQs ایک ساتھ کاپی کریں (مع ✓ درست نشانات برائے MS Word)</span>
            </button>
        </div>
    `;
    container.appendChild(bottomMasterBar);
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
    if (!lastMCQGenData || !lastMCQGenData.chapters || !lastMCQGenData.chapters[cIdx]) return;
    const chap = lastMCQGenData.chapters[cIdx];
    const m = chap.mcqs[mIdx];
    const text = formatSingleMCQText(m, mIdx + 1, chap, lastMCQGenData);
    await copyToClipboard(text, `سوال نمبر ${mIdx + 1} مع درست جواب (✓)، کتاب، یونٹ اور صفحہ نمبر کاپی ہو گیا۔`, btn);
}

function toggleAllMCQAnswers() {
    areAllMCQsRevealed = !areAllMCQsRevealed;
    const container = document.getElementById("mcq-gen-chapters-container");
    if (container) {
        if (areAllMCQsRevealed) {
            container.classList.remove("hide-mcq-ticks");
        } else {
            container.classList.add("hide-mcq-ticks");
        }
    }

    const boxes = document.querySelectorAll(".mcq-reveal-box");
    boxes.forEach(b => {
        b.style.display = areAllMCQsRevealed ? "block" : "none";
    });
    
    const label = areAllMCQsRevealed 
        ? "🙈 درست جوابات پر ٹک چھپائیں (سیلف ٹیسٹ موڈ)" 
        : "👁️ تمام درست جوابات پر ٹک دکھائیں";

    const toggleBtn = document.getElementById("mcq-toggle-text");
    if (toggleBtn) toggleBtn.textContent = label;

    const toggleBtnHub = document.getElementById("mcq-toggle-text-hub");
    if (toggleBtnHub) toggleBtnHub.textContent = label;
}

function formatSingleMCQText(m, qNum = null, chap = null, data = null) {
    const optMap = { A: "الف", B: "ب", C: "ج", D: "د", "الف": "الف", "ب": "ب", "ج": "ج", "د": "د" };
    const winnerKey = m.correct_option || "A";
    const winnerUrdu = optMap[winnerKey] || winnerKey;

    const optA = m.options ? m.options.A || m.options["الف"] || "" : "";
    const optB = m.options ? m.options.B || m.options["ب"] || "" : "";
    const optC = m.options ? m.options.C || m.options["ج"] || "" : "";
    const optD = m.options ? m.options.D || m.options["د"] || "" : "";

    const isWinnerA = (winnerKey === "A" || winnerKey === "الف");
    const isWinnerB = (winnerKey === "B" || winnerKey === "ب");
    const isWinnerC = (winnerKey === "C" || winnerKey === "ج");
    const isWinnerD = (winnerKey === "D" || winnerKey === "د");

    const winnerText = m.correct_text || (isWinnerA ? optA : isWinnerB ? optB : isWinnerC ? optC : optD);

    const qTitle = (qNum !== null && !m.question.startsWith("سوال"))
        ? `سوال نمبر ${qNum}: ${m.question}`
        : m.question;

    const bookTitle = m.book_title || (data && data.book_title) || (lastMCQGenData && lastMCQGenData.book_title) || "نصابی کتاب";
    const courseCode = (data && data.course_code) || (lastMCQGenData && lastMCQGenData.course_code) || "";
    const bookLine = courseCode ? `📚 کتاب: «${bookTitle}» (کورس کوڈ: ${courseCode})` : `📚 کتاب: «${bookTitle}»`;

    const chapName = (chap && chap.chapter_name)
        ? chap.chapter_name
        : (m.unit_name ? m.unit_name : (m.unit_num ? `یونٹ نمبر ${m.unit_num}` : (chap && chap.unit_num ? `یونٹ نمبر ${chap.unit_num}` : "")));
    const unitLine = chapName ? `📖 یونٹ نمبر: ${chapName}` : "";

    const pageStr = m.printed_page || (chap && chap.pages_range) || "";
    const pageLine = pageStr ? `📄 صفحہ نمبر: صفحہ ${pageStr}` : "";

    return [
        `============================================================`,
        `${qTitle}`,
        `------------------------------------------------------------`,
        `الف) ${optA}${isWinnerA ? "  ✓ (درست جواب)" : ""}`,
        `ب) ${optB}${isWinnerB ? "  ✓ (درست جواب)" : ""}`,
        `ج) ${optC}${isWinnerC ? "  ✓ (درست جواب)" : ""}`,
        `د) ${optD}${isWinnerD ? "  ✓ (درست جواب)" : ""}`,
        ``,
        `✓ تصدیق شدہ درست جواب: آپشن (${winnerUrdu}) — ${winnerText}`,
        bookLine,
        unitLine,
        pageLine,
        m.explanation ? `💡 علمی تشریح و نصابی حوالہ: ${m.explanation}` : "",
        `------------------------------------------------------------`
    ].filter(Boolean).join("\r\n");
}

async function copyChapterMCQs(cIdx, btn = null) {
    if (!lastMCQGenData || !lastMCQGenData.chapters || !lastMCQGenData.chapters[cIdx]) return;
    const chap = lastMCQGenData.chapters[cIdx];
    const unitNum = chap.unit_num || (cIdx + 1);
    const mcqCount = chap.mcq_count || (chap.mcqs ? chap.mcqs.length : 0);
    let out = [
        `============================================================`,
        `   AIOU Help — باب کے تمام کثیر الانتخابی سوالات (Chapter MCQs)`,
        `   کتاب: «${lastMCQGenData.book_title}» (کورس کوڈ: ${lastMCQGenData.course_code})`,
        `   یونٹ: ${chap.chapter_name}`,
        chap.pages_range ? `   صفحات: ${chap.pages_range}` : ``,
        `   کل سوالات: ${mcqCount} معروضی سوالات (مع ✓ تصدیق شدہ درست نشانات)`,
        `============================================================\r\n`
    ].filter(Boolean);

    (chap.mcqs || []).forEach((m, idx) => {
        out.push(formatSingleMCQText(m, idx + 1, chap, lastMCQGenData));
        out.push("");
    });

    await copyToClipboard(out.join("\r\n"), `باب نمبر ${unitNum} کے تمام (${mcqCount}) سوالات مع ✓ نشانات، کتاب، یونٹ اور صفحہ نمبر کاپی ہو گئے۔`, btn);
}

async function copyEntireBookMCQs(btn = null) {
    if (!lastMCQGenData || !lastMCQGenData.chapters) return;
    const totalChaps = lastMCQGenData.total_chapters || lastMCQGenData.chapters.length;
    const totalMCQs = lastMCQGenData.total_mcqs || lastMCQGenData.chapters.reduce((acc, c) => acc + (c.mcqs ? c.mcqs.length : 0), 0);
    let out = [
        `============================================================`,
        `   AIOU Help — مکمل کتاب کے تمام چیپٹرز کے MCQs بینک`,
        `   کتاب: «${lastMCQGenData.book_title}» (کورس کوڈ: ${lastMCQGenData.course_code})`,
        `   مجموعی ابواب: ${totalChaps} چیپٹرز | کل معروضی سوالات: ${totalMCQs} سوالات (برائے MS Word)`,
        `   (تمام سوالات کے سامنے درست آپشن پر ✓ کا نشان، کتاب، یونٹ نمبر اور صفحہ نمبر درج ہے)`,
        `============================================================\r\n`
    ];

    lastMCQGenData.chapters.forEach((chap, cIdx) => {
        const unitNum = chap.unit_num || (cIdx + 1);
        out.push(`\r\n############################################################`);
        out.push(`### باب نمبر ${unitNum}: ${chap.chapter_name} ${chap.pages_range ? `(صفحات: ${chap.pages_range})` : ""} ###`);
        out.push(`############################################################\r\n`);
        (chap.mcqs || []).forEach((m, idx) => {
            out.push(formatSingleMCQText(m, idx + 1, chap, lastMCQGenData));
            out.push("");
        });
    });

    await copyToClipboard(out.join("\r\n"), `پوری کتاب کے تمام چیپٹرز کے تمام (${totalMCQs}) سوالات مع ✓ درست نشانات برائے MS Word کاپی ہو گئے۔`, btn);
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
    const winnerKey = data.correct_option || "A";
    const winnerUrdu = optMap[winnerKey] || winnerKey;
    const winnerText = data.correct_text || (data.options ? data.options[winnerKey] : "");

    const unitDisplay = data.unit_name || (data.unit_num ? `یونٹ نمبر ${data.unit_num}` : (data.unit_title || "نصابی یونٹ"));
    const bookDisplay = `${data.book_title || "نصابی کتاب"}${data.course_code ? " (" + data.course_code + ")" : ""}`;
    const pageDisplay = data.printed_page || data.page_display || "نصابی ماخذ";

    let optionsHtml = "";
    if (data.options && Object.keys(data.options).length > 0) {
        optionsHtml = `<div class="mcq-options-container" style="margin-top: 0.85rem;">`;
        for (const [k, val] of Object.entries(data.options)) {
            const isWinner = (k === winnerKey || optMap[k] === winnerUrdu || (winnerKey === "A" && (k === "A" || k === "الف")));
            const urduKey = optMap[k] || k;
            optionsHtml += `
                <div class="mcq-option-choice ${isWinner ? 'is-correct-choice correct-highlight' : ''}">
                    <span class="mcq-option-badge ${isWinner ? 'badge-winner' : ''}">${urduKey}</span>
                    <span class="mcq-option-text">${escapeHtml(val)}</span>
                    ${isWinner ? '<span class="mcq-tick-badge"><span class="tick-icon">✓</span> (درست جواب)</span>' : ''}
                </div>
            `;
        }
        optionsHtml += `</div>`;
    }

    content.innerHTML = `
        <!-- Top Prominent Metadata Badges: Book, Unit, Page -->
        <div class="mcq-meta-badges quiz-meta-badges" style="margin-bottom: 1rem;">
            <span class="badge-pill badge-book">📚 کتاب: ${escapeHtml(bookDisplay)}</span>
            <span class="badge-pill badge-unit">📖 یونٹ نمبر: ${escapeHtml(unitDisplay)}</span>
            <span class="badge-pill badge-page">📄 صفحہ نمبر: ${escapeHtml(pageDisplay)}</span>
        </div>

        <div style="margin-bottom: 0.75rem;">
            <strong style="color: #0f172a; font-size: 1.05rem;">❓ کوئز سوال:</strong>
            <p style="font-size: 1.1rem; font-weight: 700; color: #0f172a; margin-top: 0.35rem; line-height: 2;">${escapeHtml(data.question || "")}</p>
        </div>

        ${optionsHtml}

        <div class="mcq-winner-row" style="margin-top: 1.15rem; background: #ecfdf5; border: 1px solid #86efac; border-radius: 8px; padding: 0.85rem 1rem;">
            <span class="winner-pill" style="font-size: 0.95rem; font-weight: 800; background: #16a34a; color: #ffffff; padding: 0.3rem 0.85rem; border-radius: 9999px;">
                ✓ تصدیق شدہ درست جواب: آپشن (${winnerUrdu})
            </span>
            <span style="font-weight: 800; font-size: 1.15rem; color: #15803d; margin-top: 0.35rem; display: block;">
                « ${escapeHtml(winnerText)} »
            </span>
        </div>

        <div style="margin-top: 0.85rem; padding-top: 0.85rem; border-top: 1px solid #bbf7d0;">
            <div style="font-weight: 700; color: #166534; margin-bottom: 0.35rem;">📖 نصابی ثبوت اور علمی حوالہ:</div>
            <p style="color: #1e293b; line-height: 2.1;">${escapeHtml(data.explanation || "کتاب کی اصل عبارت کے مطابق یہ آپشن درست ہے۔")}</p>
            
            ${data.verified_quote ? `
            <div class="ref-quote urdu-text" style="background: #ffffff; border-right-color: #16a34a; margin-top: 0.65rem;">
                « ${escapeHtml(data.verified_quote)} »
            </div>` : ""}

            <div style="margin-top: 0.75rem; font-size: 0.88rem; color: #475569; display: flex; gap: 0.5rem; flex-wrap: wrap;">
                <span class="ref-badge badge-book">📚 کتاب: ${escapeHtml(bookDisplay)}</span>
                <span class="ref-badge badge-unit">📖 یونٹ: ${escapeHtml(unitDisplay)}</span>
                <span class="ref-badge badge-page">📄 صفحہ نمبر: ${escapeHtml(pageDisplay)}</span>
                ${data.line_reference ? `<span class="ref-badge badge-line">سطر نمبر: ${escapeHtml(data.line_reference)}</span>` : ""}
            </div>
        </div>

        <div style="margin-top: 1.25rem;">
            <button class="btn btn-outline btn-copy-single" style="font-size: 0.95rem; padding: 0.65rem 1.25rem;" onclick="copyQuizResult(this)">
                <span class="copy-icon">📋</span>
                <span>کوئز سوال مع درست آپشن (✓)، کتاب، یونٹ اور صفحہ کاپی کریں</span>
            </button>
        </div>
    `;
}

async function copyQuizResult(btn = null) {
    if (!lastQuizResult) return;
    const optMap = { A: "الف", B: "ب", C: "ج", D: "د", "الف": "الف", "ب": "ب", "ج": "ج", "د": "د" };
    const winnerKey = lastQuizResult.correct_option || "A";
    const winnerUrdu = optMap[winnerKey] || winnerKey;
    const winnerText = lastQuizResult.correct_text || (lastQuizResult.options ? lastQuizResult.options[winnerKey] : "");

    let optionsLines = [];
    if (lastQuizResult.options) {
        for (const [k, val] of Object.entries(lastQuizResult.options)) {
            const isWinner = (k === winnerKey || optMap[k] === winnerUrdu || (winnerKey === "A" && (k === "A" || k === "الف")));
            const urduKey = optMap[k] || k;
            optionsLines.push(`${urduKey}) ${val}${isWinner ? "  ✓ (درست جواب)" : ""}`);
        }
    }

    const unitDisplay = lastQuizResult.unit_name || (lastQuizResult.unit_num ? `یونٹ نمبر ${lastQuizResult.unit_num}` : (lastQuizResult.unit_title || "نصابی یونٹ"));
    const pageDisplay = lastQuizResult.printed_page || lastQuizResult.page_display || "نصابی ماخذ";
    const bookTitle = lastQuizResult.book_title || "نصابی کتاب";
    const courseCode = lastQuizResult.course_code || "";

    const text = [
        `============================================================`,
        `   AIOU Help — تصدیق شدہ کوئز حل (Verified Quiz Solution)`,
        `============================================================`,
        `سوال: ${lastQuizResult.question || ""}`,
        `------------------------------------------------------------`,
        `آپشنز:`,
        optionsLines.join("\r\n"),
        ``,
        `✓ تصدیق شدہ درست جواب: آپشن (${winnerUrdu}) — ${winnerText}`,
        `📚 کتاب: «${bookTitle}» ${courseCode ? `(کورس: ${courseCode})` : ""}`,
        `📖 یونٹ نمبر: ${unitDisplay}`,
        `📄 صفحہ نمبر: صفحہ ${pageDisplay}`,
        lastQuizResult.line_reference ? `مقام / سطر: ${lastQuizResult.line_reference}` : "",
        lastQuizResult.explanation ? `💡 نصابی ثبوت اور علمی حوالہ: ${lastQuizResult.explanation}` : "",
        lastQuizResult.verified_quote ? `اصل کتابی عبارت: « ${lastQuizResult.verified_quote} »` : "",
        `------------------------------------------------------------`
    ].filter(Boolean).join("\r\n");

    await copyToClipboard(text, "کوئز سوال مع درست جواب (✓)، کتاب، یونٹ نمبر اور صفحہ نمبر کاپی ہو گیا۔", btn);
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

// ==========================================
// FEATURE: اسائنمنٹ کے سوالات حل کریں (Assignment Assistant)
// ==========================================
let currentAsgInputMode = "bulk"; // "bulk", "single", "image"
let selectedAsgImageFile = null;
let selectedAsgImageDataUrl = null;

let currentAssignmentDoc = {
    course_code: "",
    book_title: "",
    semester_num: "1",
    assignment_num: "1",
    questions: []
};

function switchAssignmentInputMode(mode) {
    currentAsgInputMode = mode;

    const btnBulk = document.getElementById("asg-tab-btn-bulk");
    const btnSingle = document.getElementById("asg-tab-btn-single");
    const btnImage = document.getElementById("asg-tab-btn-image");

    const areaBulk = document.getElementById("asg-mode-bulk-area");
    const areaSingle = document.getElementById("asg-mode-single-area");
    const areaImage = document.getElementById("asg-mode-image-area");

    if (btnBulk) btnBulk.classList.toggle("active", mode === "bulk");
    if (btnSingle) btnSingle.classList.toggle("active", mode === "single");
    if (btnImage) btnImage.classList.toggle("active", mode === "image");

    if (areaBulk) areaBulk.style.display = mode === "bulk" ? "block" : "none";
    if (areaSingle) areaSingle.style.display = mode === "single" ? "block" : "none";
    if (areaImage) areaImage.style.display = mode === "image" ? "block" : "none";
}

function handleAssignmentNumChange(val) {
    if (currentAssignmentDoc.assignment_num !== val && currentAssignmentDoc.questions.length > 0) {
        const confirmChange = confirm("کیا آپ مشق نمبر تبدیل کرنا چاہتے ہیں؟ موجودہ حل شدہ سوالات نئی مشق کے مطابق سیو ہوں گے۔");
        if (confirmChange) {
            currentAssignmentDoc.assignment_num = val;
            currentAssignmentDoc.questions = [];
            updateAssignmentBuilderBox(currentAssignmentDoc);
            const area = document.getElementById("assignment-results-area");
            if (area) area.style.display = "none";
        }
    } else {
        currentAssignmentDoc.assignment_num = val;
    }
}

function triggerAsgImageInput() {
    const inp = document.getElementById("asg-image-file-input");
    if (inp) {
        inp.value = "";
        inp.click();
    }
}

function handleAsgImageSelected(input) {
    if (!input || !input.files || input.files.length === 0) return;
    const file = input.files[0];
    if (!file.type.startsWith("image/")) {
        alert("براہِ کرم صرف تصویر فائل (JPG, PNG, WEBP) منتخب فرمائیں۔");
        return;
    }

    selectedAsgImageFile = file;
    const reader = new FileReader();
    reader.onload = function(e) {
        selectedAsgImageDataUrl = e.target.result;
        const card = document.getElementById("asg-image-preview-card");
        const thumb = document.getElementById("asg-image-preview-thumb");
        const nameEl = document.getElementById("asg-image-filename");
        if (thumb) thumb.src = selectedAsgImageDataUrl;
        if (nameEl) nameEl.textContent = `${file.name} (${Math.round(file.size / 1024)} KB)`;
        if (card) card.style.display = "flex";
    };
    reader.readAsDataURL(file);
}

function clearAsgImageSelection() {
    selectedAsgImageFile = null;
    selectedAsgImageDataUrl = null;
    const card = document.getElementById("asg-image-preview-card");
    const inp = document.getElementById("asg-image-file-input");
    if (card) card.style.display = "none";
    if (inp) inp.value = "";
}

function clearAssignmentInputs() {
    for (let i = 1; i <= 5; i++) {
        const el = document.getElementById(`asg-q-${i}`);
        if (el) el.value = "";
    }
    const bulk = document.getElementById("asg-bulk-paste-box");
    if (bulk) bulk.value = "";
    const single = document.getElementById("asg-single-q-input");
    if (single) single.value = "";
    clearAsgImageSelection();
    showToast("تمام خانے خالی کر دیے گئے۔");
}

function loadStandardAssignmentQuestions() {
    const courseSelect = document.getElementById("assignment-course-select");
    const asgRadios = document.getElementsByName("assignment-num-choice");
    let asgNum = "1";
    for (const r of asgRadios) {
        if (r.checked) asgNum = r.value;
    }

    const courseCode = courseSelect ? courseSelect.value : "";
    if (!courseCode) {
        alert("براہِ کرم پہلے اوپر سے سمسٹر اور کتاب کا انتخاب فرمائیں۔");
        if (courseSelect) courseSelect.focus();
        return;
    }

    const bookTitle = courseSelect.options[courseSelect.selectedIndex] ? courseSelect.options[courseSelect.selectedIndex].text : "نصابی کتاب";

    const qTemplates = {
        "1": [
            `سوال نمبر 1: «${bookTitle}» کے پہلے یونٹ کے بنیادی مقاصد، لغوی و اصطلاحی تعریف اور پس منظر پر تفصیلی نوٹ تحریر کریں۔`,
            `سوال نمبر 2: دوسرے یونٹ کے اساسی موضوعات کے قرآنی دلائل اور احادیثِ نبویہ کی روشنی میں تفصیلی گفتگو کریں۔`,
            `سوال نمبر 3: تیسرے یونٹ کے بنیادی ارکان، فقہی ضوابط اور شرعی اصولوں کا جامع احاطہ کریں۔`,
            `سوال نمبر 4: چوتھے یونٹ کے اخلاقی، تعلیمی اور تربیتی پہلوؤں اور حکمتوں کی وضاحت فرمائیں۔`,
            `سوال نمبر 5: پانچویں یونٹ کے معاصر تقاضوں، عملی اطلاق اور نتائج و ثمرات کا خلاصہ قلمبند کریں۔`
        ],
        "2": [
            `سوال نمبر 1: «${bookTitle}» کے چھٹے یونٹ کے بنیادی نظریات، فکری پس منظر اور شرعی تقاضوں پر مفصل روشنی ڈالیں۔`,
            `سوال نمبر 2: ساتویں یونٹ کے موضوع کی تاریخی و نصابی اہمیت اور ائمہ و فقہاء کے ارشادات درج کریں۔`,
            `سوال نمبر 3: آٹھویں یونٹ کے بنیادی اصول، ارکان اور اطلاقی ضوابط کا سیر حاصل جائزہ لیں۔`,
            `سوال نمبر 4: نویں یونٹ کے عصری چیلنجز، معاشرتی اثرات اور اصلاحی مساعی تحریر کریں۔`,
            `سوال نمبر 5: مشق نمبر ۲ کے تمام مباحث کی روشنی میں خلاصۂ کلام اور جامع تجاویز پیش کریں۔`
        ]
    };

    const qs = qTemplates[asgNum] || qTemplates["1"];
    for (let i = 1; i <= 5; i++) {
        const el = document.getElementById(`asg-q-${i}`);
        if (el) el.value = qs[i - 1];
    }

    showToast(`مشق نمبر ${asgNum} کے ۵ معیاری سوالات خودکار طور پر لوڈ ہو گئے۔`);
}

async function handleSolveAssignment() {
    const semSelect = document.getElementById("assignment-semester-select");
    const courseSelect = document.getElementById("assignment-course-select");
    const semNum = semSelect ? semSelect.value : "";
    const courseCode = courseSelect ? courseSelect.value : "";

    if (!semNum) {
        alert("براہِ کرم پہلے سمسٹر منتخب فرمائیں۔");
        if (semSelect) semSelect.focus();
        return;
    }
    if (!courseCode) {
        alert("براہِ کرم کتاب / کورس کوڈ کا انتخاب فرمائیں۔");
        if (courseSelect) courseSelect.focus();
        return;
    }

    const asgRadios = document.getElementsByName("assignment-num-choice");
    let asgNum = "1";
    for (const r of asgRadios) {
        if (r.checked) asgNum = r.value;
    }

    let payload = {
        semester_num: semNum,
        course_code: courseCode,
        assignment_num: asgNum
    };

    if (currentAsgInputMode === "image") {
        if (!selectedAsgImageDataUrl) {
            alert("براہِ کرم پہلے اسائنمنٹ پیپر کی تصویر اپلوڈ فرمائیں۔");
            return;
        }
        payload.image_b64 = selectedAsgImageDataUrl;
        payload.mime_type = selectedAsgImageFile ? selectedAsgImageFile.type : "image/jpeg";
    } else if (currentAsgInputMode === "single") {
        const singleQ = document.getElementById("asg-single-q-input") ? document.getElementById("asg-single-q-input").value.trim() : "";
        if (!singleQ) {
            alert("براہِ کرم اپنا اسائنمنٹ سوال درج فرمائیں۔");
            return;
        }
        payload.questions = [singleQ];
    } else {
        // Bulk mode
        const bulkPaste = document.getElementById("asg-bulk-paste-box") ? document.getElementById("asg-bulk-paste-box").value.trim() : "";
        if (bulkPaste) {
            payload.raw_text = bulkPaste;
        } else {
            let qs = [
                document.getElementById("asg-q-1") ? document.getElementById("asg-q-1").value.trim() : "",
                document.getElementById("asg-q-2") ? document.getElementById("asg-q-2").value.trim() : "",
                document.getElementById("asg-q-3") ? document.getElementById("asg-q-3").value.trim() : "",
                document.getElementById("asg-q-4") ? document.getElementById("asg-q-4").value.trim() : "",
                document.getElementById("asg-q-5") ? document.getElementById("asg-q-5").value.trim() : ""
            ].filter(Boolean);

            if (qs.length === 0) {
                loadStandardAssignmentQuestions();
                qs = [
                    document.getElementById("asg-q-1").value.trim(),
                    document.getElementById("asg-q-2").value.trim(),
                    document.getElementById("asg-q-3").value.trim(),
                    document.getElementById("asg-q-4").value.trim(),
                    document.getElementById("asg-q-5").value.trim()
                ].filter(Boolean);
            }
            payload.questions = qs;
        }
    }

    const spinner = document.getElementById("asg-spinner");
    const submitBtn = document.getElementById("asg-submit-btn");
    if (spinner) spinner.style.display = "inline-block";
    if (submitBtn) submitBtn.disabled = true;

    try {
        const resp = await fetch(`${API_BASE}/api/assignment`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (!resp.ok) {
            throw new Error(`Assignment API failed with status ${resp.status}`);
        }

        const data = await resp.json();
        if (!data || !data.questions) {
            throw new Error("Invalid response format from assignment server");
        }

        // Update Cumulative Document Session
        if (currentAssignmentDoc.course_code !== data.course_code || currentAssignmentDoc.assignment_num !== data.assignment_num) {
            currentAssignmentDoc = {
                course_code: data.course_code,
                book_title: data.book_title,
                semester_num: data.semester_num,
                assignment_num: data.assignment_num,
                questions: []
            };
        }

        if (currentAsgInputMode === "single") {
            const newQ = data.questions[0];
            if (newQ) {
                const existingIdx = currentAssignmentDoc.questions.findIndex(q => q.question.replace(/^سوال\s*نمبر\s*\d+[:\s-]*/, '') === newQ.question.replace(/^سوال\s*نمبر\s*\d+[:\s-]*/, ''));
                if (existingIdx !== -1) {
                    currentAssignmentDoc.questions[existingIdx] = newQ;
                } else {
                    newQ.q_num = currentAssignmentDoc.questions.length + 1;
                    if (!newQ.question.startsWith("سوال")) {
                        newQ.question = `سوال نمبر ${newQ.q_num}: ${newQ.question}`;
                    }
                    currentAssignmentDoc.questions.push(newQ);
                }
            }
        } else {
            currentAssignmentDoc.questions = data.questions;
        }

        currentAssignmentDoc.course_code = data.course_code;
        currentAssignmentDoc.book_title = data.book_title;
        currentAssignmentDoc.semester_num = data.semester_num;
        currentAssignmentDoc.assignment_num = data.assignment_num;

        renderAssignmentResults(currentAssignmentDoc);
        updateAssignmentBuilderBox(currentAssignmentDoc);
        showToast("✓ اسائنمنٹ کے سوالات کامیابی سے تیار ہو گئے۔");

    } catch (e) {
        console.error("Assignment solver error:", e);
        showToast("اسائنمنٹ تیار کرنے میں دشواری پیش آئی۔ دوبارہ کوشش فرمائیں۔");
    } finally {
        if (spinner) spinner.style.display = "none";
        if (submitBtn) submitBtn.disabled = false;
    }
}

function updateAssignmentBuilderBox(doc) {
    const box = document.getElementById("assignment-doc-builder-box");
    const titleEl = document.getElementById("builder-course-title");
    const asgPill = document.getElementById("builder-asg-pill");
    const countPill = document.getElementById("builder-count-pill");
    const pillsList = document.getElementById("builder-questions-pills-list");

    if (!box) return;
    if (!doc || !doc.questions || doc.questions.length === 0) {
        box.style.display = "none";
        return;
    }

    box.style.display = "block";
    if (titleEl) titleEl.textContent = `کتاب: «${doc.book_title}» (${doc.course_code})`;
    if (asgPill) asgPill.textContent = `مشق نمبر ${doc.assignment_num}`;
    if (countPill) countPill.textContent = `${doc.questions.length} سوالات شامل`;

    if (pillsList) {
        pillsList.innerHTML = doc.questions.map((q, idx) => `
            <span class="builder-q-pill" onclick="scrollToAssignmentQuestion(${idx})" title="اس سوال پر جائیں">
                ✓ سوال نمبر ${idx + 1}
            </span>
        `).join("");
    }
}

function scrollToAssignmentQuestion(idx) {
    const el = document.getElementById(`asg-card-${idx}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
}

function resetAssignmentDoc() {
    const conf = confirm("کیا آپ موجودہ اسائنمنٹ سیشن ختم کر کے نئی اسائنمنٹ شروع کرنا چاہتے ہیں؟");
    if (!conf) return;

    currentAssignmentDoc = {
        course_code: "",
        book_title: "",
        semester_num: "1",
        assignment_num: "1",
        questions: []
    };

    const box = document.getElementById("assignment-doc-builder-box");
    const area = document.getElementById("assignment-results-area");
    if (box) box.style.display = "none";
    if (area) area.style.display = "none";
    clearAssignmentInputs();
    showToast("اسائنمنٹ سیشن ری سیٹ ہو گیا۔ نئی اسائنمنٹ تیار کریں۔");
}

function formatMarkdownToHtml(md) {
    if (!md) return "";
    let lines = md.split("\n");
    let html = [];
    for (let l of lines) {
        let trimmed = l.trim();
        if (!trimmed) {
            html.push("<br>");
            continue;
        }
        if (trimmed.startsWith("### ")) {
            let hText = trimmed.substring(4);
            html.push(`<h4 class="asg-subheading">${escapeHtml(hText)}</h4>`);
        } else if (trimmed.startsWith("## ")) {
            let hText = trimmed.substring(3);
            html.push(`<h3 class="asg-subheading-lg">${escapeHtml(hText)}</h3>`);
        } else if (trimmed.startsWith("# ")) {
            let hText = trimmed.substring(2);
            html.push(`<h2 class="asg-subheading-xl">${escapeHtml(hText)}</h2>`);
        } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
            let itemText = trimmed.substring(2);
            html.push(`<li class="asg-list-item">${escapeHtml(itemText)}</li>`);
        } else {
            let p = escapeHtml(trimmed);
            p = p.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            html.push(`<p class="asg-paragraph">${p}</p>`);
        }
    }
    return html.join("\n");
}

function renderAssignmentResults(doc) {
    const area = document.getElementById("assignment-results-area");
    const container = document.getElementById("assignment-questions-container");
    const titleEl = document.getElementById("asg-summary-title");
    const subtitleEl = document.getElementById("asg-summary-subtitle");

    if (!area || !container) return;
    area.style.display = "block";
    area.scrollIntoView({ behavior: "smooth", block: "start" });

    const totalWords = doc.questions.reduce((acc, q) => acc + (q.word_count || 450), 0);
    if (titleEl) titleEl.textContent = `کتاب: «${doc.book_title}» (${doc.course_code}) — مشق نمبر ${doc.assignment_num}`;
    if (subtitleEl) subtitleEl.textContent = `کل سوالات: ${doc.questions.length} | مجموعی الفاظ: ~${totalWords} | ہر سوال مع ۱۰ سرخیاں، کتاب، یونٹ نمبر اور صفحہ`;

    container.innerHTML = "";

    doc.questions.forEach((q, idx) => {
        const card = document.createElement("div");
        card.className = "assignment-q-card";
        card.id = `asg-card-${idx}`;

        const answerHtml = formatMarkdownToHtml(q.answer);

        card.innerHTML = `
            <!-- Top Metadata Badges & Quick Action Bar -->
            <div class="mcq-item-header-bar">
                <div class="mcq-meta-badges">
                    <span class="badge-pill badge-book" title="کتاب کا نام و کورس کوڈ">📚 کتاب: ${escapeHtml(q.book_title)} (${escapeHtml(q.course_code)})</span>
                    <span class="badge-pill badge-unit" title="مشق و یونٹ نمبر">📖 مشق نمبر ${escapeHtml(doc.assignment_num)} | ${escapeHtml(q.unit_name || "")}</span>
                    <span class="badge-pill badge-page" title="کتاب کا صفحہ نمبر">📄 صفحہ نمبر: ${escapeHtml(q.printed_page || "")}</span>
                    <span class="badge-pill badge-words" style="background: #fdf2f8; color: #9d174d; border: 1px solid #fbcfe8;">📝 ${q.word_count || 450} الفاظ | ۱۰ سرخیاں</span>
                </div>
                <div class="card-quick-actions" style="display: flex; gap: 0.4rem; flex-wrap: wrap;">
                    <button class="btn btn-outline btn-copy-single" onclick="copyAssignmentQuestion(${idx}, this)" title="صرف یہ سوال کاپی کریں">
                        <span>📋 یہ سوال مع ۱۰ سرخیاں کاپی کریں</span>
                    </button>
                    <button class="btn btn-secondary btn-copy-single" onclick="downloadAssignmentWordDoc('single', ${idx})" title="صرف یہ سوال ورڈ میں ڈاؤن لوڈ کریں">
                        <span>📄 صرف یہ سوال ورڈ میں ڈاؤن لوڈ کریں (.doc)</span>
                    </button>
                </div>
            </div>

            <!-- Question Title -->
            <div class="asg-q-title-box">
                <h3 class="asg-q-title">${escapeHtml(q.question)}</h3>
            </div>

            <!-- 10 Headings Detailed Academic Content -->
            <div class="asg-answer-content">
                ${answerHtml}
            </div>

            <!-- Supporting Book Citation Box -->
            <div class="asg-citation-box">
                <div class="citation-header">📖 مستند کتابی حوالہ و نصابی تصدیق:</div>
                <div class="citation-meta">کتاب: «${escapeHtml(q.book_title)}» | کورس: ${escapeHtml(q.course_code)} | ${escapeHtml(q.unit_name)} | صفحہ نمبر: ${escapeHtml(q.printed_page || "")}</div>
                ${q.supporting_quote ? `<div class="citation-quote">« ${escapeHtml(q.supporting_quote)} »</div>` : ''}
            </div>

            <!-- Bottom Action Row -->
            <div class="asg-card-footer">
                <button class="btn btn-outline" onclick="copyAssignmentQuestion(${idx}, this)">
                    <span>📋 یہ سوال مع ۱۰ سرخیاں کاپی کریں</span>
                </button>
                <button class="btn btn-primary btn-word" onclick="downloadAssignmentWordDoc('all')">
                    <span>📥 مکمل ورڈ فائل ڈاؤن لوڈ کریں (.doc)</span>
                </button>
            </div>
        `;

        container.appendChild(card);
    });
}

function executeWordBlobDownload(filename, bodyHtml) {
    const header = "<html xmlns:o='urn:schemas-microsoft-com:office:office' "+
        "xmlns:w='urn:schemas-microsoft-com:office:word' "+
        "xmlns='http://www.w3.org/TR/REC-html40'>"+
        "<head><meta charset='utf-8'><title>" + escapeHtml(filename) + "</title>"+
        "<style>"+
        "@page { size: A4; margin: 2.5cm 2cm 2.5cm 2cm; mso-page-orientation: portrait; }"+
        "body { font-family: 'Jameel Noori Nastaleeq', 'Noto Nastaliq Urdu', 'Urdu Typesetting', 'Alvi Nastaleeq', 'Tahoma', 'Calibri', serif; direction: rtl; text-align: right; font-size: 13pt; line-height: 2.3; color: #111827; }"+
        ".cover-page { text-align: center; padding-top: 100pt; page-break-after: always; }"+
        ".cover-univ { font-size: 22pt; font-weight: bold; color: #047857; margin-bottom: 8pt; }"+
        ".cover-prog { font-size: 16pt; color: #1e3a8a; margin-bottom: 20pt; }"+
        ".cover-box { border: 2pt solid #047857; padding: 20pt; border-radius: 8pt; width: 85%; margin: 0 auto; background-color: #f8fafc; text-align: right; }"+
        ".cover-title { font-size: 18pt; font-weight: bold; color: #0f172a; margin-bottom: 12pt; text-align: center; border-bottom: 1pt solid #cbd5e1; padding-bottom: 8pt; }"+
        ".cover-meta p { font-size: 13pt; color: #334155; line-height: 2; margin-bottom: 6pt; }"+
        ".q-block { page-break-before: always; margin-top: 20pt; }"+
        ".q-heading-title { font-size: 16pt; font-weight: bold; color: #047857; background-color: #f0fdf4; border: 1.5pt solid #86efac; padding: 8pt 12pt; border-radius: 6pt; margin-bottom: 12pt; }"+
        ".ref-meta-bar { background-color: #eff6ff; border-right: 4pt solid #3b82f6; padding: 6pt 10pt; margin-bottom: 15pt; font-size: 11pt; color: #1e40af; }"+
        ".asg-subheading { font-size: 14pt; font-weight: bold; color: #1e3a8a; border-bottom: 1pt solid #e2e8f0; padding-bottom: 3pt; margin-top: 14pt; margin-bottom: 6pt; }"+
        ".asg-subheading-lg { font-size: 15pt; font-weight: bold; color: #0f766e; margin-top: 16pt; margin-bottom: 8pt; }"+
        ".asg-subheading-xl { font-size: 16pt; font-weight: bold; color: #047857; margin-top: 18pt; margin-bottom: 10pt; }"+
        ".asg-paragraph { font-size: 13pt; line-height: 2.3; text-align: justify; margin-bottom: 10pt; }"+
        ".asg-list-item { font-size: 13pt; line-height: 2.1; margin-right: 15pt; margin-bottom: 4pt; }"+
        ".quote-box { background-color: #fefce8; border-right: 3pt solid #eab308; padding: 8pt 12pt; margin: 12pt 0; font-style: italic; color: #713f12; }"+
        "</style></head><body>";
    const footer = "</body></html>";
    const sourceHTML = header + bodyHtml + footer;
    const blob = new Blob(['\ufeff', sourceHTML], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function downloadAssignmentWordDoc(mode = 'all', singleIdx = null) {
    if (!currentAssignmentDoc || !currentAssignmentDoc.questions || currentAssignmentDoc.questions.length === 0) {
        alert("پہلے اسائنمنٹ کے سوالات حل فرمائیں۔");
        return;
    }

    const doc = currentAssignmentDoc;
    const bookTitle = doc.book_title || "نصابی کتاب";
    const courseCode = doc.course_code || "";
    const asgNum = doc.assignment_num || "1";
    const semNum = doc.semester_num || "1";

    let questionsToExport = [];
    if (mode === 'single' && singleIdx !== null && doc.questions[singleIdx]) {
        questionsToExport = [doc.questions[singleIdx]];
    } else {
        questionsToExport = doc.questions;
    }

    let coverPageHtml = "";
    if (mode === 'all') {
        let indexRows = questionsToExport.map((q, idx) => `
            <tr>
                <td style="padding: 8pt; border: 1pt solid #cbd5e1; text-align: center; width: 15%; font-weight: bold;">سوال نمبر ${idx + 1}</td>
                <td style="padding: 8pt; border: 1pt solid #cbd5e1; text-align: right;">${escapeHtml(q.question)}</td>
                <td style="padding: 8pt; border: 1pt solid #cbd5e1; text-align: center; width: 25%;">${escapeHtml(q.unit_name || "")}</td>
            </tr>
        `).join("");

        coverPageHtml = `
            <div class="cover-page">
                <div class="cover-univ">علامہ اقبال اوپن یونیورسٹی، اسلام آباد</div>
                <div class="cover-prog">کلیہ عربی و علومِ اسلامیہ — بی ایس اسلامیات (2.5 سالہ پروگرام)</div>
                <div class="cover-box">
                    <div class="cover-title">اسائنمنٹ / مشقی سوالات و تفصیلی حل</div>
                    <div class="cover-meta">
                        <p><strong>کتاب کا نام:</strong> ${escapeHtml(bookTitle)}</p>
                        <p><strong>کورس کوڈ:</strong> ${escapeHtml(courseCode)}</p>
                        <p><strong>سمسٹر:</strong> سمسٹر نمبر ${escapeHtml(semNum)}</p>
                        <p><strong>مشق نمبر:</strong> مشق نمبر ${escapeHtml(asgNum)} (${asgNum === "1" ? "یونٹ نمبر ۱ تا ۵" : "یونٹ نمبر ۶ تا ۹"})</p>
                        <p><strong>مجموعی سوالات:</strong> ${questionsToExport.length} مفصل امتحانی سوالات</p>
                    </div>
                </div>

                <div style="margin-top: 30pt; text-align: right;">
                    <h3 style="color: #047857; border-bottom: 1.5pt solid #047857; padding-bottom: 4pt;">فہرستِ سوالات (Table of Assignment Questions):</h3>
                    <table style="width: 100%; border-collapse: collapse; margin-top: 10pt; font-size: 11pt;">
                        <thead>
                            <tr style="background-color: #f1f5f9;">
                                <th style="padding: 8pt; border: 1pt solid #cbd5e1; text-align: center;">شمار</th>
                                <th style="padding: 8pt; border: 1pt solid #cbd5e1; text-align: right;">سوالیہ عنوان</th>
                                <th style="padding: 8pt; border: 1pt solid #cbd5e1; text-align: center;">متعلقہ یونٹ</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${indexRows}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    let questionsHtml = questionsToExport.map((q, idx) => {
        let qBodyHtml = formatMarkdownToHtml(q.answer);
        return `
            <div class="q-block">
                <div class="q-heading-title">${escapeHtml(q.question)}</div>
                <div class="ref-meta-bar">
                    <strong>مستند کتابی حوالہ:</strong>
                    کتاب: «${escapeHtml(q.book_title)}» (${escapeHtml(q.course_code)}) |
                    ${escapeHtml(q.unit_name)} |
                    صفحہ نمبر: صفحہ ${escapeHtml(q.printed_page || "")} |
                    طوالت: تقریباً ${q.word_count || 450} الفاظ مع ۱۰ سرخیاں
                </div>
                <div class="q-body-text">
                    ${qBodyHtml}
                </div>
                ${q.supporting_quote ? `
                <div class="quote-box">
                    <strong>اصل نصابی عبارت / اقتباس:</strong> « ${escapeHtml(q.supporting_quote)} »
                </div>` : ''}
            </div>
        `;
    }).join("\n");

    const fullDocHtml = coverPageHtml + questionsHtml;
    const filename = mode === 'all'
        ? `AIOU_Assignment_${courseCode || "Course"}_Mshq_${asgNum}.doc`
        : `AIOU_Assignment_${courseCode || "Course"}_Q_${(singleIdx || 0) + 1}.doc`;

    executeWordBlobDownload(filename, fullDocHtml);
    showToast(`✓ ورڈ فائل (${filename}) کامیابی سے ڈاؤن لوڈ ہو گئی۔`);
}

async function copyAssignmentQuestion(qIdx, btn = null) {
    if (!currentAssignmentDoc || !currentAssignmentDoc.questions || !currentAssignmentDoc.questions[qIdx]) return;
    const q = currentAssignmentDoc.questions[qIdx];
    const text = [
        `============================================================`,
        `${q.question}`,
        `============================================================`,
        `📚 کتاب: «${q.book_title}» (کورس کوڈ: ${q.course_code})`,
        `📖 مشق: مشق نمبر ${currentAssignmentDoc.assignment_num} | ${q.unit_name}`,
        `📄 صفحہ نمبر: صفحہ ${q.printed_page || ""}`,
        `📝 طوالت: تقریباً ${q.word_count || 450} الفاظ | ۱۰ مفصل سرخیاں`,
        `------------------------------------------------------------`,
        ``,
        q.answer,
        ``,
        `------------------------------------------------------------`,
        q.supporting_quote ? `📖 اصل کتابی عبارت: « ${q.supporting_quote} »\n` : ``,
        `[ماخذ: AIOU BS Islamic Studies 2.5-Year Program Materials]`,
        `============================================================`
    ].filter(Boolean).join("\r\n");

    await copyToClipboard(text, `سوال نمبر ${qIdx + 1} مع ۱۰ سرخیاں اور نصابی حوالہ کاپی ہو گیا۔`, btn);
}

async function copyFullAssignment(btn = null) {
    if (!currentAssignmentDoc || !currentAssignmentDoc.questions || currentAssignmentDoc.questions.length === 0) return;
    const doc = currentAssignmentDoc;
    let parts = [
        `============================================================`,
        `   AIOU Help — مکمل حل شدہ اسائنمنٹ (Complete Assignment Solution)`,
        `   کتاب: «${doc.book_title}» (کورس کوڈ: ${doc.course_code})`,
        `   سمسٹر: سمسٹر ${doc.semester_num} | مشق نمبر: مشق نمبر ${doc.assignment_num}`,
        `   کل سوالات: ${doc.questions.length} سوالات (ہر سوال ۴۰۰ تا ۵۰۰ الفاظ مع ۱۰ سرخیاں)`,
        `============================================================\r\n`
    ];

    doc.questions.forEach((q, idx) => {
        parts.push(`\r\n############################################################`);
        parts.push(`### ${q.question} ###`);
        parts.push(`############################################################`);
        parts.push(`📚 کتاب: «${q.book_title}» (${q.course_code}) | ${q.unit_name} | صفحہ: ${q.printed_page || ""}`);
        parts.push(`------------------------------------------------------------\r\n`);
        parts.push(q.answer);
        if (q.supporting_quote) {
            parts.push(`\r\n📖 اصل کتابی عبارت: « ${q.supporting_quote} »`);
        }
        parts.push(`\r\n`);
    });

    parts.push(`\r\n============================================================`);
    parts.push(`[ماخذ: AIOU BS Islamic Studies 2.5-Year Program Study Materials]`);

    await copyToClipboard(parts.join("\r\n"), `مکمل اسائنمنٹ (${doc.questions.length} سوالات مع تمام سرخیاں و حوالہ جات) کاپی ہو گئی۔`, btn);
}

function printAssignmentDoc() {
    window.print();
}
