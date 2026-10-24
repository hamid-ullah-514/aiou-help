// AIOU Help — Professional Urdu Educational & Exam Assistant Client

let currentCatalog = null;
let currentFeature = "qa"; // "qa", "exam", "mcq_gen", "quiz"
let currentQAMode = "explanation"; // "explanation", "exact"

let lastQAResult = null;
let lastExamData = null;
let lastMCQGenData = null;
let lastQuizResult = null;

// Initial Load
document.addEventListener("DOMContentLoaded", () => {
    loadCatalog();
    loadSystemStatus();
});

// Load Course Catalog
async function loadCatalog() {
    try {
        const resp = await fetch("/api/catalog");
        if (!resp.ok) throw new Error("Catalog fetch error");
        currentCatalog = await resp.json();
        populateSemesterSelect();
    } catch (e) {
        console.error("Error loading catalog:", e);
        showToast("کورسز کی فہرست حاصل کرنے میں دشواری ہوئی۔");
    }
}

// System Status
async function loadSystemStatus() {
    try {
        const resp = await fetch("/api/status");
        if (!resp.ok) return;
        const data = await resp.json();
        const badgeText = document.getElementById("system-status-text");
        if (data.indexing && data.indexing.indexed) {
            badgeText.textContent = `نصاب فعال (${data.indexing.documents_count} کتب | ${data.indexing.pages_count} صفحات محفوظ)`;
        }
    } catch (e) {
        console.warn(e);
    }
}

// Populate Semester Dropdown
function populateSemesterSelect() {
    const semSelect = document.getElementById("semester-select");
    semSelect.innerHTML = `<option value="">-- آپ کس سمسٹر کی تیاری کرنا چاہتے ہیں؟ --</option>`;
    
    if (!currentCatalog || !currentCatalog.semesters) return;

    currentCatalog.semesters.forEach(sem => {
        const opt = document.createElement("option");
        opt.value = sem.semester_num;
        opt.textContent = `${sem.semester_name_ur} — (${sem.books_count} کتب دستیاب)`;
        semSelect.appendChild(opt);
    });
}

// On Semester Change
function onSemesterChange() {
    const semNum = document.getElementById("semester-select").value;
    const courseSelect = document.getElementById("course-select");
    const bannerText = document.getElementById("scope-banner-text");
    const scopePill = document.getElementById("scope-stats-pill");

    if (!semNum) {
        courseSelect.innerHTML = `<option value="">-- پہلے سمسٹر کا انتخاب ضروری ہے --</option>`;
        courseSelect.disabled = true;
        bannerText.textContent = "براہِ کرم اوپر دیے گئے ڈراپ ڈاؤن سے اپنا سمسٹر منتخب کریں۔";
        scopePill.textContent = "0 کتب دستیاب";
        return;
    }

    const semData = currentCatalog.semesters.find(s => s.semester_num === semNum);
    if (!semData) return;

    courseSelect.disabled = false;
    courseSelect.innerHTML = `<option value="">-- مخصوص کورس / کتاب منتخب کریں --</option>`;
    courseSelect.innerHTML += `<option value="ALL">🔍 سمسٹر کی تمام کتب پر مشترکہ تلاش (All ${semData.books_count} Books)</option>`;

    semData.books.forEach(book => {
        const opt = document.createElement("option");
        opt.value = book.course_code;
        const tag = book.is_scanned ? "[اسکین شدہ]" : "";
        opt.textContent = `[کورس ${book.course_code}] ${book.course_title_ur} (${book.pages_count} صفحات) ${tag}`;
        courseSelect.appendChild(opt);
    });

    bannerText.textContent = `زیرِ تیاری سمسٹر: ${semData.semester_name_ur} (تمام نتائج اسی سمسٹر سے حاصل ہوں گے)`;
    scopePill.textContent = `${semData.books_count} کتب محفوظ`;
}

// On Course Change
function onCourseChange() {
    const semNum = document.getElementById("semester-select").value;
    const courseCode = document.getElementById("course-select").value;
    const bannerText = document.getElementById("scope-banner-text");

    const semData = currentCatalog.semesters.find(s => s.semester_num === semNum);
    if (!semData) return;

    if (courseCode === "ALL") {
        bannerText.textContent = `زیرِ تیاری سمسٹر: ${semData.semester_name_ur} — (تمام کتب میں مشترکہ تلاش)`;
    } else if (courseCode) {
        const book = semData.books.find(b => b.course_code === courseCode);
        const bTitle = book ? book.course_title_ur : `کورس ${courseCode}`;
        bannerText.textContent = `زیرِ مطالعہ کورس: [${courseCode}] ${bTitle} (${semData.semester_name_ur})`;
    }
}

// Switch Between 4 Primary Features
function switchFeature(feat) {
    currentFeature = feat;

    // Update Nav Buttons
    document.querySelectorAll(".feature-card-btn").forEach(b => b.classList.remove("active"));
    const activeBtn = document.getElementById(`feat-btn-${feat.replace('_', '-')}`);
    if (activeBtn) activeBtn.classList.add("active");

    // Hide all panels
    document.querySelectorAll(".feature-panel").forEach(p => p.style.display = "none");

    // Show target panel
    const targetPanel = document.getElementById(`section-${feat.replace('_', '-')}`);
    if (targetPanel) {
        targetPanel.style.display = "block";
        targetPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    }
}

// ==========================================
// FEATURE 1: کتاب سے سوال پوچھیں
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

async function handleQASubmit() {
    const semNum = document.getElementById("semester-select").value;
    const courseCode = document.getElementById("course-select").value;
    const question = document.getElementById("question-input").value.trim();

    if (!semNum) {
        alert("آپ کس سمسٹر کی تیاری کرنا چاہتے ہیں؟\nبراہِ کرم پہلے سمسٹر منتخب کریں۔");
        document.getElementById("semester-select").focus();
        return;
    }
    if (!question) {
        alert("براہِ کرم اپنا سوال درج کریں۔");
        document.getElementById("question-input").focus();
        return;
    }

    const spinner = document.getElementById("qa-spinner");
    const submitBtn = document.getElementById("qa-submit-btn");
    spinner.style.display = "inline-block";
    submitBtn.disabled = true;

    try {
        const resp = await fetch("/api/ask", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                question,
                semester_num: semNum,
                course_code: courseCode || "ALL",
                mode: currentQAMode
            })
        });

        const data = await resp.json();
        lastQAResult = data;
        renderQAResult(data);
    } catch (e) {
        console.error(e);
        showToast("جواب تلاش کرنے میں خرابی واقع ہوئی۔");
    } finally {
        spinner.style.display = "none";
        submitBtn.disabled = false;
    }
}

function renderQAResult(data) {
    const resultArea = document.getElementById("qa-result-area");
    const bodyContent = document.getElementById("qa-body-content");
    const headerTitle = document.getElementById("qa-header-title");
    const badgeBook = document.getElementById("qa-badge-book");
    const badgePage = document.getElementById("qa-badge-page");
    const refContainer = document.getElementById("qa-references-container");

    resultArea.style.display = "block";
    resultArea.scrollIntoView({ behavior: "smooth", block: "start" });

    if (data.not_found) {
        headerTitle.textContent = "تلاش کا نتیجہ";
        badgeBook.textContent = "کتاب میں موجود نہیں";
        badgePage.textContent = "-";
        bodyContent.innerHTML = `
            <div class="primary-quote-box" style="background: var(--danger-bg); border-right-color: var(--danger-text); color: var(--danger-text);">
                ${escapeHtml(data.answer)}
            </div>
        `;
        refContainer.style.display = "none";
        return;
    }

    refContainer.style.display = "block";
    headerTitle.textContent = data.mode === "exact" ? "کتاب کی اصل عبارت (Exact Book Quotation)" : "تفصیلی امتحانی جواب (Grounded Exam Answer)";
    badgeBook.textContent = `کتاب: ${data.book_title || "منتخب نصاب"}`;
    badgePage.textContent = `صفحہ: ${data.printed_page || data.pdf_page}`;

    if (data.mode === "exact") {
        bodyContent.innerHTML = `
            <div class="primary-quote-box">
                <div style="font-weight: 700; color: var(--primary); margin-bottom: 0.5rem;">
                    متنِ کتاب (اصل عبارت بغیر کسی رد و بدل کے):
                </div>
                « ${escapeHtml(data.primary_quote)} »
            </div>
            <div style="font-size: 0.9rem; color: var(--text-secondary);">
                مقام: ${escapeHtml(data.line_reference || "")}
            </div>
        `;
    } else {
        const formatted = escapeHtml(data.answer).replace(/\n/g, "<br>");
        bodyContent.innerHTML = `<div style="line-height: 2.3;">${formatted}</div>`;
    }

    renderReferencesList("qa-references-list", data.references || []);
}

function renderReferencesList(elementId, references) {
    const el = document.getElementById(elementId);
    el.innerHTML = "";

    if (!references || references.length === 0) {
        el.innerHTML = `<p style="color: var(--text-muted); font-size: 0.9rem;">کوئی اضافی حوالہ دستیاب نہیں۔</p>`;
        return;
    }

    references.forEach((ref, idx) => {
        const item = document.createElement("div");
        item.className = "ref-item";
        item.innerHTML = `
            <div class="ref-header">
                <div class="ref-badges">
                    <span class="ref-badge badge-book">کتاب: ${escapeHtml(ref.book_title)} (${ref.course_code})</span>
                    <span class="ref-badge badge-page">${escapeHtml(ref.page_display)}</span>
                    <span class="ref-badge badge-line">${escapeHtml(ref.line_reference)}</span>
                </div>
                <span style="font-size: 0.8rem; color: var(--text-muted);">حوالہ #${idx + 1}</span>
            </div>
            <div class="ref-quote">
                « ${escapeHtml(ref.quotation)} »
            </div>
        `;
        el.appendChild(item);
    });
}

function clearQAForm() {
    document.getElementById("question-input").value = "";
    document.getElementById("qa-result-area").style.display = "none";
    lastQAResult = null;
    showToast("فارم صاف کر دیا گیا۔");
}

async function copyQAAnswerOnly() {
    if (!lastQAResult) return;
    const txt = lastQAResult.answer || lastQAResult.primary_quote || "";
    await writeToClipboard(txt);
    showToast("جواب کامیابی سے کاپی ہوگیا۔");
}

async function copyQAFullWithRefs() {
    if (!lastQAResult) return;
    try {
        const resp = await fetch("/api/format_copy", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ data: lastQAResult, include_references: true })
        });
        const res = await resp.json();
        await writeToClipboard(res.formatted_text);
        showToast("مکمل جواب بمع حوالہ کامیابی سے کاپی ہوگیا۔");
    } catch (e) {
        showToast("کاپی کرنے میں خرابی۔");
    }
}

async function copyQAOriginalQuote() {
    if (!lastQAResult) return;
    const q = lastQAResult.primary_quote || "";
    const cite = `« ${q} »\n[ماخذ: کتاب ${lastQAResult.book_title}، صفحہ ${lastQAResult.printed_page || lastQAResult.pdf_page}]`;
    await writeToClipboard(cite);
    showToast("اصل عبارت کامیابی سے کاپی ہوگئی۔");
}

async function copyQAQuestion() {
    const q = document.getElementById("question-input").value;
    if (!q) return;
    await writeToClipboard(q);
    showToast("سوال کاپی ہوگیا۔");
}

// ==========================================
// FEATURE 2: پیپر کی تیاری (Exam Preparation)
// ==========================================
async function handleExamGenerate() {
    const courseCode = document.getElementById("course-select").value;
    if (!courseCode || courseCode === "ALL") {
        alert("پیپر کی تیاری کے لیے براہِ کرم اوپر دیے گئے ڈراپ ڈاؤن سے کوئی مخصوص کورس / کتاب منتخب فرمائیں۔");
        document.getElementById("course-select").focus();
        return;
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
        const resp = await fetch("/api/exam/questions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                course_code: courseCode,
                count_per_chapter: count
            })
        });

        const data = await resp.json();
        lastExamData = data;
        renderExamResults(data);
    } catch (e) {
        console.error(e);
        showToast("امتحانی سوالات تیار کرنے میں دشواری پیش آئی۔");
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

    titleEl.textContent = `امتحانی تیاری: ${data.book_title} (کورس ${data.course_code})`;
    subtitleEl.textContent = `کل چیپٹرز: ${data.total_chapters} | ہر چیپٹر سے سوالات: ${data.count_per_chapter} | مجموعی امتحانی سوالات: ${data.total_questions}`;

    accordion.innerHTML = "";

    data.chapters.forEach((chap, cIdx) => {
        const block = document.createElement("div");
        block.className = "chapter-block";

        let questionsHtml = "";
        chap.questions.forEach((q, qIdx) => {
            const qId = `exam-q-${cIdx}-${qIdx}`;
            questionsHtml += `
                <div class="exam-q-item">
                    <div class="exam-q-header" onclick="toggleExamQuestion('${qId}')">
                        <span>❓ ${escapeHtml(q.question)}</span>
                        <span style="font-size: 0.85rem; color: var(--primary);">▼ جواب دیکھیں / بند کریں</span>
                    </div>
                    <div id="${qId}" class="exam-q-body">
                        <div style="font-weight: 700; color: var(--primary); margin-bottom: 0.35rem;">۱۔ بنیادی تعریف و تشریح:</div>
                        <p>${escapeHtml(q.definition)}</p>

                        <div style="font-weight: 700; color: var(--primary); margin-top: 0.85rem; margin-bottom: 0.35rem;">۲۔ اہم ذیلی عنوانات:</div>
                        <ul>
                            ${q.subheadings.map(sh => `<li>${escapeHtml(sh)}</li>`).join("")}
                        </ul>

                        <div style="font-weight: 700; color: var(--primary); margin-top: 0.85rem; margin-bottom: 0.35rem;">۳۔ اہم امتحانی نکات:</div>
                        <ul>
                            ${q.key_points.map(kp => `<li>${escapeHtml(kp)}</li>`).join("")}
                        </ul>

                        <div class="primary-quote-box" style="margin-top: 1rem; margin-bottom: 0.5rem;">
                            <strong>کتاب کا حوالہ (صفحہ ${q.printed_page}):</strong><br>
                            « ${escapeHtml(q.source_passage)} »
                        </div>

                        <div class="exam-q-actions">
                            <button class="btn btn-outline" style="font-size: 0.82rem; padding: 0.35rem 0.8rem;" onclick="copySingleQuestionAnswer(${cIdx}, ${qIdx}, 'ans')">📋 جواب کاپی کریں</button>
                            <button class="btn btn-outline" style="font-size: 0.82rem; padding: 0.35rem 0.8rem;" onclick="copySingleQuestionAnswer(${cIdx}, ${qIdx}, 'q_and_a')">📜 سوال اور جواب کاپی کریں</button>
                            <button class="btn btn-outline" style="font-size: 0.82rem; padding: 0.35rem 0.8rem;" onclick="copySingleQuestionAnswer(${cIdx}, ${qIdx}, 'full')">📚 سوال، جواب اور حوالہ کاپی کریں</button>
                        </div>
                    </div>
                </div>
            `;
        });

        block.innerHTML = `
            <div class="chapter-header">
                <span class="chapter-title-text">${escapeHtml(chap.chapter_name)} (${chap.questions_count} سوالات)</span>
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
}

function toggleExamQuestion(qId) {
    const el = document.getElementById(qId);
    if (!el) return;
    el.classList.toggle("open");
}

async function copySingleQuestionAnswer(cIdx, qIdx, type) {
    if (!lastExamData) return;
    const q = lastExamData.chapters[cIdx].questions[qIdx];
    let txt = "";

    if (type === "ans") {
        txt = `${q.definition}\n\nاہم نکات:\n${q.key_points.join("\n")}`;
    } else if (type === "q_and_a") {
        txt = `${q.question}\n\nجواب:\n${q.definition}\n\nاہم نکات:\n${q.key_points.join("\n")}`;
    } else {
        txt = `${q.question}\n\nجواب:\n${q.definition}\n\nاہم ذیلی عنوانات:\n${q.subheadings.join("\n")}\n\nاہم نکات:\n${q.key_points.join("\n")}\n\n[حوالہ: کتاب ${q.book_title}، صفحہ ${q.printed_page}]\n« ${q.source_passage} »`;
    }

    await writeToClipboard(txt);
    showToast("مواد کامیابی سے کاپی ہوگیا۔");
}

async function copyChapterExamQuestions(cIdx) {
    if (!lastExamData) return;
    const chap = lastExamData.chapters[cIdx];
    let out = [`=== ${chap.chapter_name} (امتحانی سوالات و جوابات) ===\n`];

    chap.questions.forEach((q, idx) => {
        out.push(`${q.question}`);
        out.push(`جواب: ${q.definition}`);
        out.push(`اہم نکات:\n${q.key_points.map(k => `• ${k}`).join("\n")}`);
        out.push(`[ماخذ: صفحہ ${q.printed_page}]\n« ${q.source_passage} »\n----------------------------------------\n`);
    });

    await writeToClipboard(out.join("\n"));
    showToast("پورے چیپٹر کے تمام سوالات و جوابات کاپی ہوگئے۔");
}

async function copyEntireBookExamPrep() {
    if (!lastExamData) return;
    let out = [
        `============================================================`,
        `   AIOU Help — مکمل امتحانی پرچہ تیاری نوٹس`,
        `   کتاب: ${lastExamData.book_title} (کورس کوڈ: ${lastExamData.course_code})`,
        `============================================================\n`
    ];

    lastExamData.chapters.forEach(chap => {
        out.push(`\n### ${chap.chapter_name} ###\n`);
        chap.questions.forEach(q => {
            out.push(`${q.question}`);
            out.push(`جواب:\n${q.definition}`);
            out.push(`اہم ذیلی عنوانات:\n${q.subheadings.join("\n")}`);
            out.push(`اہم نکات:\n${q.key_points.map(k => `• ${k}`).join("\n")}`);
            out.push(`[حوالہ: صفحہ ${q.printed_page}]\n« ${q.source_passage} »\n`);
        });
    });

    await writeToClipboard(out.join("\n"));
    showToast("تمام چیپٹرز کے مکمل سوالات و جوابات کاپی ہوگئے (MS Word میں پیسٹ کریں)۔");
}

// ==========================================
// FEATURE 3: ہر چیپٹر سے MCQs تیار کریں
// ==========================================
async function handleMCQGenerate() {
    const courseCode = document.getElementById("course-select").value;
    if (!courseCode || courseCode === "ALL") {
        alert("معروضی سوالات (MCQs) بنانے کے لیے براہِ کرم اوپر دیے گئے ڈراپ ڈاؤن سے مخصوص کورس / کتاب منتخب فرمائیں۔");
        document.getElementById("course-select").focus();
        return;
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
        const resp = await fetch("/api/exam/mcqs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                course_code: courseCode,
                count_per_chapter: count
            })
        });

        const data = await resp.json();
        lastMCQGenData = data;
        renderMCQGenResults(data);
    } catch (e) {
        console.error(e);
        showToast("معروضی سوالات تیار کرنے میں دشواری پیش آئی۔");
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

    titleEl.textContent = `معروضی سوالات بینک: ${data.book_title} (کورس ${data.course_code})`;
    subtitleEl.textContent = `کل چیپٹرز: ${data.total_chapters} | فی چیپٹر MCQs: ${data.count_per_chapter} | مجموعی MCQs: ${data.total_mcqs}`;

    container.innerHTML = "";

    data.chapters.forEach((chap, cIdx) => {
        const block = document.createElement("div");
        block.className = "chapter-block";

        let mcqsHtml = "";
        chap.mcqs.forEach((m, mIdx) => {
            const mId = `mcq-rev-${cIdx}-${mIdx}`;
            mcqsHtml += `
                <div class="mcq-display-item">
                    <div class="mcq-q-title">سوال نمبر ${m.mcq_num}: ${escapeHtml(m.question)}</div>
                    
                    <div class="mcq-options-container">
                        <div class="mcq-option-choice" onclick="selectMCQOption(this, '${m.correct_option}', 'الف')">
                            <strong>الف)</strong> <span>${escapeHtml(m.options['الف'])}</span>
                        </div>
                        <div class="mcq-option-choice" onclick="selectMCQOption(this, '${m.correct_option}', 'ب')">
                            <strong>ب)</strong> <span>${escapeHtml(m.options['ب'])}</span>
                        </div>
                        <div class="mcq-option-choice" onclick="selectMCQOption(this, '${m.correct_option}', 'ج')">
                            <strong>ج)</strong> <span>${escapeHtml(m.options['ج'])}</span>
                        </div>
                        <div class="mcq-option-choice" onclick="selectMCQOption(this, '${m.correct_option}', 'د')">
                            <strong>د)</strong> <span>${escapeHtml(m.options['د'])}</span>
                        </div>
                    </div>

                    <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
                        <button class="btn btn-outline" style="font-size: 0.8rem; padding: 0.3rem 0.75rem;" onclick="toggleMCQReveal('${mId}')">
                            👁️ درست جواب اور ثبوت دیکھیں
                        </button>
                        <button class="btn btn-outline" style="font-size: 0.8rem; padding: 0.3rem 0.75rem;" onclick="copySingleMCQ(${cIdx}, ${mIdx})">
                            📋 کاپی کریں
                        </button>
                    </div>

                    <div id="${mId}" class="mcq-reveal-box">
                        <strong style="color: #15803d;">درست آپشن: ${m.correct_option}) ${escapeHtml(m.correct_text)}</strong><br>
                        <strong>کتاب کا صفحہ نمبر:</strong> صفحہ ${m.printed_page}<br>
                        <strong>متعلقہ عبارت:</strong> « ${escapeHtml(m.supporting_quote)} »<br>
                        <strong>وجہ:</strong> ${escapeHtml(m.reason)}
                    </div>
                </div>
            `;
        });

        block.innerHTML = `
            <div class="chapter-header">
                <span class="chapter-title-text">${escapeHtml(chap.chapter_name)} (${chap.mcqs_count} MCQs)</span>
                <button class="btn btn-secondary" style="font-size: 0.82rem; padding: 0.4rem 0.85rem;" onclick="copyChapterMCQs(${cIdx})">
                    <span>💾 اس چیپٹر کے تمام MCQs کاپی کریں</span>
                </button>
            </div>
            <div style="padding: 1rem 1.25rem;">
                ${mcqsHtml}
            </div>
        `;
        container.appendChild(block);
    });
}

function selectMCQOption(el, correctOpt, selectedOpt) {
    const parent = el.parentElement;
    parent.querySelectorAll(".mcq-option-choice").forEach(c => c.classList.remove("correct-highlight"));

    if (selectedOpt === correctOpt) {
        el.classList.add("correct-highlight");
        showToast("شاباش! درست جواب منتخب کیا ہے۔");
    } else {
        showToast(`غلط آپشن۔ درست آپشن «${correctOpt}» ہے۔`);
    }
}

function toggleMCQReveal(mId) {
    const el = document.getElementById(mId);
    if (!el) return;
    el.classList.toggle("open");
}

function revealAllMCQAnswers() {
    document.querySelectorAll(".mcq-reveal-box").forEach(box => box.classList.add("open"));
    showToast("تمام MCQs کے درست جوابات کھول دیے گئے۔");
}

async function copySingleMCQ(cIdx, mIdx) {
    if (!lastMCQGenData) return;
    const m = lastMCQGenData.chapters[cIdx].mcqs[mIdx];
    const txt = (
        `سوال نمبر ${m.mcq_num}: ${m.question}\n` +
        `الف) ${m.options['الف']}\n` +
        `ب) ${m.options['ب']}\n` +
        `ج) ${m.options['ج']}\n` +
        `د) ${m.options['د']}\n\n` +
        `درست جواب: ${m.correct_option}) ${m.correct_text}\n` +
        `کتاب: ${m.book_title} (صفحہ ${m.printed_page})\n` +
        `متعلقہ عبارت: « ${m.supporting_quote} »`
    );
    await writeToClipboard(txt);
    showToast("MCQ سوال معہ جواب اور حوالہ کاپی ہوگیا۔");
}

async function copyChapterMCQs(cIdx) {
    if (!lastMCQGenData) return;
    const chap = lastMCQGenData.chapters[cIdx];
    let out = [`=== ${chap.chapter_name} (MCQs بینک) ===\n`];

    chap.mcqs.forEach(m => {
        out.push(`سوال نمبر ${m.mcq_num}: ${m.question}`);
        out.push(`الف) ${m.options['الف']}`);
        out.push(`ب) ${m.options['ب']}`);
        out.push(`ج) ${m.options['ج']}`);
        out.push(`د) ${m.options['د']}`);
        out.push(`درست جواب: ${m.correct_option}) ${m.correct_text} (صفحہ ${m.printed_page})`);
        out.push(`عبارت: « ${m.supporting_quote} »\n`);
    });

    await writeToClipboard(out.join("\n"));
    showToast("چیپٹر کے تمام MCQs کاپی ہوگئے۔");
}

async function copyEntireBookMCQs() {
    if (!lastMCQGenData) return;
    let out = [
        `============================================================`,
        `   AIOU Help — مکمل کتاب کا معروضی سوالات (MCQs) بینک`,
        `   کتاب: ${lastMCQGenData.book_title} (کورس کوڈ: ${lastMCQGenData.course_code})`,
        `============================================================\n`
    ];

    lastMCQGenData.chapters.forEach(chap => {
        out.push(`\n### ${chap.chapter_name} ###\n`);
        chap.mcqs.forEach(m => {
            out.push(`سوال نمبر ${m.mcq_num}: ${m.question}`);
            out.push(`الف) ${m.options['الف']}`);
            out.push(`ب) ${m.options['ب']}`);
            out.push(`ج) ${m.options['ج']}`);
            out.push(`د) ${m.options['د']}`);
            out.push(`درست جواب: ${m.correct_option}) ${m.correct_text} (صفحہ ${m.printed_page})`);
            out.push(`عبارت: « ${m.supporting_quote} »\n`);
        });
    });

    await writeToClipboard(out.join("\n"));
    showToast("تمام چیپٹرز کے تمام MCQs کاپی ہوگئے (Word میں پیسٹ کریں)۔");
}

// ==========================================
// FEATURE 4: کوئز کے درست جوابات معلوم کریں
// ==========================================
function fillQuizExample() {
    document.getElementById("semester-select").value = "1";
    onSemesterChange();
    document.getElementById("course-select").value = "4934";
    onCourseChange();

    document.getElementById("quiz-question-input").value = "اصطلاحاً غزوہ سے کیا مراد ہے؟";
    document.getElementById("quiz-opt-a").value = "جس جنگ میں حضور ﷺ نے بذاتِ خود شرکت فرمائی";
    document.getElementById("quiz-opt-b").value = "وہ جنگ جس میں صرف صحابہ شریک ہوئے";
    document.getElementById("quiz-opt-c").value = "وہ لشکر جو رات کے وقت روانہ کیا گیا";
    document.getElementById("quiz-opt-d").value = "وہ معرکہ جو فتح مکہ کے بعد پیش آیا";

    handleQuizSubmit();
}

async function handleQuizSubmit() {
    const semNum = document.getElementById("semester-select").value;
    const courseCode = document.getElementById("course-select").value;

    if (!semNum) {
        alert("آپ کس سمسٹر کی تیاری کرنا چاہتے ہیں؟\nبراہِ کرم پہلے سمسٹر منتخب کریں۔");
        document.getElementById("semester-select").focus();
        return;
    }

    const question = document.getElementById("quiz-question-input").value.trim();
    const optA = document.getElementById("quiz-opt-a").value.trim();
    const optB = document.getElementById("quiz-opt-b").value.trim();
    const optC = document.getElementById("quiz-opt-c").value.trim();
    const optD = document.getElementById("quiz-opt-d").value.trim();

    if (!question) {
        alert("براہِ کرم کوئز کا سوال درج کریں۔");
        return;
    }

    const spinner = document.getElementById("quiz-spinner");
    const btn = document.getElementById("quiz-submit-btn");
    spinner.style.display = "inline-block";
    btn.disabled = true;

    try {
        const resp = await fetch("/api/mcq", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                question,
                option_a: optA,
                option_b: optB,
                option_c: optC,
                option_d: optD,
                semester_num: semNum,
                course_code: courseCode || "ALL"
            })
        });

        const data = await resp.json();
        lastQuizResult = data;
        renderQuizResult(data);
    } catch (e) {
        console.error(e);
        showToast("درست جواب تلاش کرنے میں خرابی واقع ہوئی۔");
    } finally {
        spinner.style.display = "none";
        btn.disabled = false;
    }
}

function renderQuizResult(data) {
    const card = document.getElementById("quiz-result-card");
    const content = document.getElementById("quiz-result-content");

    card.style.display = "block";
    card.scrollIntoView({ behavior: "smooth", block: "start" });

    if (data.insufficient || !data.success) {
        content.innerHTML = `
            <div style="color: var(--warning-text); font-weight: 700;">
                ⚠️ معذرت، دستیاب کتابی مواد میں سے اس سوال کے کسی بھی آپشن کی حتمی تصدیق نہیں ہو سکی۔
            </div>
            <div style="font-size: 0.9rem; margin-top: 0.5rem; color: var(--text-secondary);">
                براہِ کرم منتخب کردہ کورس کوڈ یا سوال کے الفاظ چیک فرمائیں۔ سسٹم نے خود سے کوئی غیر مصدقہ جواب قیاس نہیں کیا۔
            </div>
        `;
        return;
    }

    // Map A/B/C/D to Urdu الف/ب/ج/د if needed
    const optMap = { "A": "الف", "B": "ب", "C": "ج", "D": "د" };
    const urduKey = optMap[data.correct_option_key] || data.correct_option_key;

    content.innerHTML = `
        <div class="mcq-winner-row">
            <span class="mcq-winner-badge">آپ کا درست جواب یہ ہے: آپشن (${urduKey})</span>
            <span>${escapeHtml(data.correct_option_text)}</span>
        </div>

        <div style="margin-top: 0.85rem; line-height: 2.3;">
            <strong>کتاب کا نام:</strong> ${escapeHtml(data.book_title)} (کورس ${data.course_code})<br>
            <strong>صفحہ نمبر:</strong> ${escapeHtml(data.printed_page || `PDF ${data.pdf_page}`)}<br>
            <strong>متعلقہ سطر / مقام:</strong> ${escapeHtml(data.supporting_line || data.line_reference)}<br>
            <strong>متعلقہ عبارت:</strong> « ${escapeHtml(data.quotation)} »<br>
            <strong>جواب کی وجہ:</strong> کتاب کے صفحہ ${data.printed_page || data.pdf_page} پر موجود اصل عبارت اس آپشن کی مکمل اور قطعی تصدیق کرتی ہے۔
        </div>

        <div style="margin-top: 1rem; display: flex; gap: 0.5rem; flex-wrap: wrap;">
            <button class="btn btn-primary" style="font-size: 0.85rem; padding: 0.45rem 1rem;" onclick="copyQuizCorrectOnly()">
                📋 درست جواب کاپی کریں
            </button>
            <button class="btn btn-secondary" style="font-size: 0.85rem; padding: 0.45rem 1rem;" onclick="copyQuizFullExplanation()">
                📜 جواب بمع وضاحت اور حوالہ کاپی کریں
            </button>
        </div>
    `;
}

async function copyQuizCorrectOnly() {
    if (!lastQuizResult || !lastQuizResult.success) return;
    const txt = `درست جواب: [آپشن ${lastQuizResult.correct_option_key}] ${lastQuizResult.correct_option_text}\nکتاب: ${lastQuizResult.book_title} (صفحہ ${lastQuizResult.printed_page})`;
    await writeToClipboard(txt);
    showToast("درست جواب کاپی ہوگیا۔");
}

async function copyQuizFullExplanation() {
    if (!lastQuizResult || !lastQuizResult.success) return;
    const txt = (
        `آپ کا درست جواب یہ ہے:\n` +
        `[آپشن ${lastQuizResult.correct_option_key}] ${lastQuizResult.correct_option_text}\n\n` +
        `کتاب کا نام: ${lastQuizResult.book_title} (${lastQuizResult.course_code})\n` +
        `صفحہ نمبر: ${lastQuizResult.printed_page}\n` +
        `متعلقہ سطر: ${lastQuizResult.supporting_line || lastQuizResult.line_reference}\n` +
        `متعلقہ عبارت: « ${lastQuizResult.quotation} »\n` +
        `جواب کی وجہ: کتاب کے اس صفحے کی اصل عبارت اس آپشن کی براہِ راست تصدیق کرتی ہے۔`
    );
    await writeToClipboard(txt);
    showToast("جواب بمع وضاحت اور حوالہ کامیابی سے کاپی ہوگیا۔");
}

function clearQuizForm() {
    document.getElementById("quiz-question-input").value = "";
    document.getElementById("quiz-opt-a").value = "";
    document.getElementById("quiz-opt-b").value = "";
    document.getElementById("quiz-opt-c").value = "";
    document.getElementById("quiz-opt-d").value = "";
    document.getElementById("quiz-result-card").style.display = "none";
    lastQuizResult = null;
    showToast("کوئز فارم صاف کر دیا گیا۔");
}

// Utility: Clipboard Writer
async function writeToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text);
    }
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
}

// Utility: Toast Notification
let toastTimer = null;
function showToast(message) {
    const toast = document.getElementById("toast");
    const msgEl = document.getElementById("toast-message");
    msgEl.textContent = message;
    toast.classList.add("show");

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.classList.remove("show");
    }, 2800);
}

function escapeHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
