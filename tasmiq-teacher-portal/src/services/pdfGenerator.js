/**
 * TasmiqAI — A4 Academic Assessment Report Card & PDF Generator
 * Professional invoice-style academic report card optimized for printing and digital distribution.
 */
import jsPDF from 'jspdf';

// ── Color Constants ──────────────────────────────────────────
const EMERALD  = [11,  110, 79];  // #0B6E4F Primary
const DARK_EM  = [6,   78,  59];  // #064E3B Header Banner
const GOLD     = [212, 175, 55];  // #D4AF37 Accent
const TEXT     = [31,  41,  55];  // #1F2937 Body Text
const MUTED    = [92,  110, 101]; // #5C6E65 Subtitle / Labels
const LIGHT_BG = [245, 250, 246]; // #F5FAF6 Section Card BG
const BORDER   = [218, 228, 222]; // #DAE4DE Light border
const WHITE    = [255, 255, 255];
const PASS_GREEN = [16, 122, 74];
const PASS_BG    = [209, 250, 229];
const REPEAT_RED = [192, 57, 43];
const REPEAT_BG  = [254, 226, 226];

// ── Date Formatter ───────────────────────────────────────────
const fmtDate = d => {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return '—';
  }
};

// ── Score Rating Helper ──────────────────────────────────────
const getPerformanceRating = score => {
  const s = Number(score) || 0;
  if (s >= 90) return 'Excellent';
  if (s >= 75) return 'Good';
  if (s >= 60) return 'Satisfactory';
  return 'Needs Improvement';
};

// Motivational, parent-friendly descriptions per rating
const RATING_DESCRIPTIONS = {
  'Excellent': 'Excellent performance. The student demonstrates strong memorization and recitation skills.',
  'Good': 'Good progress. The student shows consistent performance with some areas that can still be improved.',
  'Satisfactory': 'The student is making progress and should continue regular revision and practice.',
  'Needs Improvement': 'The student should continue practicing the recommended areas before the next assessment.',
};

// ── Parent-Friendly Text Generator ───────────────────────────
const generateParentSummary = (studentName, overallStatus, scores, feedbackText) => {
  const name = studentName || 'Your child';
  const mem = scores.memorization || 80;
  const taj = scores.tajwid || 80;

  if (overallStatus === 'PASS') {
    if (mem >= 85 && taj >= 85) {
      return `${name} demonstrated excellent memorization and clear Tajweed compliance during this assessment. Recitation rhythm and fluency were strong throughout all verses.`;
    }
    return `${name} demonstrated good overall memorization and confidence. Some minor Tajweed rules and pronunciation details can be further refined with regular daily practice.`;
  } else {
    return `${name} showed good effort in reciting the assigned verses. However, specific areas in memorization consistency and Tajweed rules require additional practice before re-assessment.`;
  }
};

// ── Page Dimensions (A4 mm) ──────────────────────────────────
const PW = 210;   // Page Width
const PH = 297;   // Page Height
const ML = 14;    // Left Margin
const MR = 14;    // Right Margin
const CW = PW - ML - MR; // Content Width (182mm)

// ═════════════════════════════════════════════════════════════
// MAIN REPORT GENERATOR
// ═════════════════════════════════════════════════════════════
export async function generateReport(data) {
  const {
    reportType = 'Tasmiq Assessment Report',
    scope = 'single',
    period = {},
    student = {},
    classObj = {},
    classStudents = [],
    stats = {},
    recitations = [],
    tajwidErrors = [],
    recommendations = [],
    feedbackRecs = [],
    teacherName = '',
  } = data;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // ── Extract Data Fields ──
  const studentName = student ? (student.full_name || student.display_name || student.email || 'Student') : 'All Students';
  const studentId = student ? (student.uid || student.id || 'N/A').slice(0, 14).toUpperCase() : 'N/A';
  const className = classObj?.name || student?.class_name || 'Class';
  const evalTeacher = teacherName || classObj?.teacher_name || classObj?.teacher_display_name || '—';
  const reportDate = fmtDate(new Date());

  const latestRec = recitations[0] || {};
  const surahName = latestRec.surah || (latestRec.surah_number ? `Surah ${latestRec.surah_number}` : 'Surah Al-Fatihah');
  const selectedAyahs = latestRec.ayah || (latestRec.start_verse ? `Ayah ${latestRec.start_verse}–${latestRec.end_verse}` : 'Ayah 1 – 7');
  const assessmentDate = fmtDate(latestRec.submitted_at || latestRec.recorded_at || new Date());

  // ── Pass / Repeat / Status Logic ────────────────────────────
  const isTeacherApproved = latestRec.status === 'approved';
  const isTeacherRepeat   = latestRec.status === 'repeat';
  const teacherStatus     = isTeacherApproved ? 'PASS' : isTeacherRepeat ? 'REPEAT' : 'PENDING';

  // AI score: use the latest recitation score, then fall back to average — never fake
  const aiPercentage  = latestRec.score != null ? latestRec.score
    : (stats.avgScore != null ? stats.avgScore : null);
  const aiScoreDisplay = aiPercentage != null ? `${aiPercentage}%` : 'N/A';
  const aiPassed      = aiPercentage != null && aiPercentage >= 70;
  const aiStatusLabel = aiPercentage == null ? 'NOT AVAILABLE'
    : aiPassed ? 'PASS' : 'NEEDS MORE PRACTICE';

  // FINAL TASMIQ STATUS: FULLY PASSED requires BOTH AI PASS and Teacher PASS
  const isFullyPassed    = aiPassed && isTeacherApproved;
  const finalTasmiqColor = isFullyPassed ? PASS_GREEN : REPEAT_RED;
  const finalTasmiqBg    = isFullyPassed ? PASS_BG : REPEAT_BG;

  // isPass for feedback/recommendations uses Final Tasmiq logic
  const isPass = isFullyPassed;

  // ── Overall Performance: based purely on AI score (constructive wording) ──
  // This is a separate metric from teacher status; reflects the student's recitation quality
  const baseScore = aiPercentage ?? stats.avgScore ?? 0;
  const overallRating = getPerformanceRating(baseScore);
  const ratingDesc = RATING_DESCRIPTIONS[overallRating] || RATING_DESCRIPTIONS['Needs Improvement'];

  // overallStatus for parent summary
  const overallStatus = isTeacherApproved ? 'PASS' : 'REPEAT';

  // Sub-scores: only use real DB values; show actual score or 0 if missing
  const scores = {
    memorization:  latestRec.memorization_score  ?? null,
    tajwid:        latestRec.tajwid_score        ?? null,
    pronunciation: latestRec.pronunciation_score ?? null,
    fluency:       latestRec.fluency_score       ?? null,
    confidence:    null,
  };

  // Helper: display score or 'N/A'
  const fmtScore = v => v != null ? `${v}%` : 'N/A';
  const ratingOrNA = v => v != null ? getPerformanceRating(v) : 'N/A';

  const remarks = {
    memorization:  scores.memorization == null ? 'No data recorded.' : scores.memorization >= 85 ? 'Excellent recall with zero hesitation.' : 'Minor pauses during recitation.',
    tajwid:        scores.tajwid == null ? 'No data recorded.' : scores.tajwid >= 85 ? 'Accurate Ghunnah and Mad rules.' : 'Needs practice on Ghunnah and Qalqalah.',
    pronunciation: scores.pronunciation == null ? 'No data recorded.' : scores.pronunciation >= 85 ? 'Clear articulation of throat letters.' : 'Refine makhraj on specific letters.',
    fluency:       scores.fluency == null ? 'No data recorded.' : scores.fluency >= 85 ? 'Smooth rhythm with proper Waqf pauses.' : 'Maintain steady pace.',
    confidence:    'Refer to teacher feedback for confidence assessment.',
  };

  const teacherFeedbackText = latestRec.feedback || (feedbackRecs[0]?.feedback) || 
    (isPass 
      ? 'Good recitation overall. Continue practicing daily to maintain accuracy.'
      : 'Re-record required. Focus on correcting Ghunnah elongation and memorization consistency on Ayah 3-5.');

  const parentSummaryText = generateParentSummary(studentName, overallStatus, scores, teacherFeedbackText);

  // ═════════════════════════════════════════════════════════════
  // PAGE 1 — OFFICIAL ASSESSMENT REPORT CARD
  // ═════════════════════════════════════════════════════════════

  // ── HEADER BANNER (Invoice Style) ───────────────────────────
  let y = 0;

  // Dark emerald background bar
  doc.setFillColor(...DARK_EM);
  doc.rect(0, y, PW, 24, 'F');

  // Gold accent bar
  doc.setFillColor(...GOLD);
  doc.rect(0, y + 24, PW, 1.5, 'F');

  // Header Left: Logo / Institution
  doc.setTextColor(...WHITE);
  doc.setFontSize(13); doc.setFont('helvetica', 'bold');
  doc.text('TASMIQAI', ML, y + 10);
  doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
  doc.text('AI-Based Quran Recitation Monitoring System', ML, y + 16);

  // Header Right: Title & Date
  doc.setFontSize(11); doc.setFont('helvetica', 'bold');
  doc.text('TASMIQ ASSESSMENT REPORT', PW - MR, y + 10, { align: 'right' });
  doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
  doc.text(`Official Academic Report Card  |  Generated: ${reportDate}`, PW - MR, y + 16, { align: 'right' });

  y = 30;

  // ── 1. STUDENT INFORMATION (Invoice-style Grid) ─────────────
  doc.setFillColor(...LIGHT_BG);
  doc.roundedRect(ML, y, CW, 24, 2, 2, 'F');
  doc.setDrawColor(...BORDER); doc.setLineWidth(0.3);
  doc.roundedRect(ML, y, CW, 24, 2, 2, 'S');

  // Decorative green left bar
  doc.setFillColor(...EMERALD);
  doc.roundedRect(ML, y, 3, 24, 1.5, 1.5, 'F');

  const colW = (CW - 6) / 4;
  
  // Row 1: Student Name | Student ID | Class | Teacher Name
  const row1 = [
    ['STUDENT NAME', studentName],
    ['STUDENT ID', studentId],
    ['CLASS', className],
    ['TEACHER NAME', evalTeacher],
  ];

  row1.forEach((item, i) => {
    const cx = ML + 5 + i * colW;
    doc.setFontSize(6.5); doc.setFont('helvetica', 'bold');
    doc.setTextColor(...MUTED);
    doc.text(item[0], cx, y + 6);
    doc.setFontSize(8.5); doc.setFont('helvetica', 'bold');
    doc.setTextColor(...TEXT);
    const val = doc.splitTextToSize(String(item[1]), colW - 2)[0];
    doc.text(val, cx, y + 11);
  });

  // Divider line
  doc.setDrawColor(...BORDER); doc.setLineWidth(0.2);
  doc.line(ML + 5, y + 13, PW - MR - 2, y + 13);

  // Row 2: Assessment Date | Surah Name | Selected Ayahs | Document No.
  const row2 = [
    ['ASSESSMENT DATE', assessmentDate],
    ['SURAH NAME', surahName],
    ['SELECTED AYAHS', selectedAyahs],
    ['REPORT REF', `TR-${Math.floor(10000 + Math.random() * 90000)}`],
  ];

  row2.forEach((item, i) => {
    const cx = ML + 5 + i * colW;
    doc.setFontSize(6.5); doc.setFont('helvetica', 'bold');
    doc.setTextColor(...MUTED);
    doc.text(item[0], cx, y + 17);
    doc.setFontSize(8.5); doc.setFont('helvetica', 'normal');
    doc.setTextColor(...TEXT);
    const val = doc.splitTextToSize(String(item[1]), colW - 2)[0];
    doc.text(val, cx, y + 21.5);
  });

  y += 28;

  // ── 2. ASSESSMENT SUMMARY (Report Card Badges) ─────────────
  doc.setFontSize(9.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...DARK_EM);
  doc.text('2. ASSESSMENT SUMMARY', ML, y);
  doc.setDrawColor(...GOLD); doc.setLineWidth(0.3);
  doc.line(ML, y + 2, PW - MR, y + 2);

  y += 5;

  const cardW = (CW - 6) / 3;
  const cardH = 26;

  // Card 1: AI Practice Result
  doc.setFillColor(...LIGHT_BG);
  doc.roundedRect(ML, y, cardW, cardH, 2, 2, 'F');
  doc.setDrawColor(...BORDER); doc.setLineWidth(0.3);
  doc.roundedRect(ML, y, cardW, cardH, 2, 2, 'S');
  doc.setFillColor(...EMERALD);
  doc.roundedRect(ML, y, cardW, 2, 1, 1, 'F');
  doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...MUTED);
  doc.text('AI PRACTICE RESULT', ML + cardW / 2, y + 6, { align: 'center' });
  doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(...EMERALD);
  doc.text(aiScoreDisplay, ML + cardW / 2, y + 12.5, { align: 'center' });

  // Status badge pill
  const aiStatusColor = aiPercentage == null ? [130, 130, 130] : aiPassed ? PASS_GREEN : REPEAT_RED;
  doc.setFillColor(...aiStatusColor);
  doc.roundedRect(ML + 5, y + 14.5, cardW - 10, 4.5, 1, 1, 'F');
  doc.setFontSize(6); doc.setFont('helvetica', 'bold'); doc.setTextColor(...WHITE);
  doc.text(aiStatusLabel, ML + cardW / 2, y + 17.7, { align: 'center' });

  // Fixed scoring criteria indicator
  doc.setFontSize(5.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...MUTED);
  doc.text('70% and above = PASS', ML + cardW / 2, y + 23.5, { align: 'center' });

  // Card 2: Official Teacher Assessment (PASS / REPEAT / PENDING)
  const c2X = ML + cardW + 3;
  const statusColor = isTeacherApproved ? PASS_GREEN : isTeacherRepeat ? REPEAT_RED : [217, 119, 6];
  const statusBg    = isTeacherApproved ? PASS_BG : isTeacherRepeat ? REPEAT_BG : [254, 243, 199];

  doc.setFillColor(...statusBg);
  doc.roundedRect(c2X, y, cardW, cardH, 2, 2, 'F');
  doc.setDrawColor(...statusColor); doc.setLineWidth(0.4);
  doc.roundedRect(c2X, y, cardW, cardH, 2, 2, 'S');
  doc.setFillColor(...statusColor);
  doc.roundedRect(c2X, y, cardW, 2, 1, 1, 'F');
  doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...statusColor);
  doc.text('OFFICIAL TEACHER STATUS', c2X + cardW / 2, y + 6, { align: 'center' });
  doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(...statusColor);
  doc.text(teacherStatus, c2X + cardW / 2, y + 16, { align: 'center' });

  // Card 3: Overall Performance Rating
  const c3X = ML + (cardW + 3) * 2;
  const perfColor = overallRating === 'Excellent' ? PASS_GREEN
    : overallRating === 'Good' ? EMERALD
    : overallRating === 'Satisfactory' ? [161, 97, 0]
    : REPEAT_RED;
  doc.setFillColor(...LIGHT_BG);
  doc.roundedRect(c3X, y, cardW, cardH, 2, 2, 'F');
  doc.setDrawColor(...BORDER); doc.setLineWidth(0.3);
  doc.roundedRect(c3X, y, cardW, cardH, 2, 2, 'S');
  doc.setFillColor(...GOLD);
  doc.roundedRect(c3X, y, cardW, 2, 1, 1, 'F');
  doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...MUTED);
  doc.text('OVERALL PERFORMANCE', c3X + cardW / 2, y + 6, { align: 'center' });
  doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(...perfColor);
  doc.text(overallRating, c3X + cardW / 2, y + 13.5, { align: 'center' });
  doc.setFontSize(5.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...MUTED);
  const splitDesc = doc.splitTextToSize(ratingDesc, cardW - 4);
  doc.text(splitDesc[0] || '', c3X + cardW / 2, y + 19, { align: 'center' });

  y += cardH + 3;

  // AI Disclaimer Note
  doc.setFontSize(6.5); doc.setFont('helvetica', 'italic'); doc.setTextColor(...MUTED);
  doc.text('Note: AI Practice Result is for reference only. Official status is determined independently by the teacher.', ML, y);

  y += 5;

  // ── 3. PERFORMANCE BREAKDOWN TABLE ─────────────────────────
  doc.setFontSize(9.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...DARK_EM);
  doc.text('3. PERFORMANCE BREAKDOWN', ML, y);
  doc.setDrawColor(...GOLD); doc.setLineWidth(0.3);
  doc.line(ML, y + 2, PW - MR, y + 2);

  y += 5;

  const tableCols = [
    { h: 'ASSESSMENT CATEGORY', w: 52 },
    { h: 'RESULT',              w: 32 },
    { h: 'REMARKS & EVALUATION',w: 98 },
  ];

  const tableRows = [
    ['Memorization Accuracy',   `${fmtScore(scores.memorization)} (${ratingOrNA(scores.memorization)})`, remarks.memorization],
    ['Tajweed Compliance',      `${fmtScore(scores.tajwid)} (${ratingOrNA(scores.tajwid)})`,             remarks.tajwid],
    ['Pronunciation (Makhraj)', `${fmtScore(scores.pronunciation)} (${ratingOrNA(scores.pronunciation)})`, remarks.pronunciation],
    ['Fluency & Flow',          `${fmtScore(scores.fluency)} (${ratingOrNA(scores.fluency)})`,           remarks.fluency],
    ['Confidence & Intonation', 'See Feedback', remarks.confidence],
  ];

  // Table Header
  doc.setFillColor(...DARK_EM);
  doc.rect(ML, y, CW, 6.5, 'F');
  doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(...WHITE);
  let tx = ML + 3;
  tableCols.forEach(col => {
    doc.text(col.h, tx, y + 4.5);
    tx += col.w;
  });

  y += 6.5;

  // Table Rows
  tableRows.forEach((row, ri) => {
    const rowH = 6.5;
    doc.setFillColor(ri % 2 === 0 ? 255 : 248, ri % 2 === 0 ? 255 : 252, ri % 2 === 0 ? 255 : 248);
    doc.rect(ML, y, CW, rowH, 'F');
    doc.setDrawColor(...BORDER); doc.setLineWidth(0.15);
    doc.line(ML, y + rowH, ML + CW, y + rowH);

    doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...TEXT);
    tx = ML + 3;
    doc.text(row[0], tx, y + 4.5);

    tx += tableCols[0].w;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...EMERALD);
    doc.text(row[1], tx, y + 4.5);

    tx += tableCols[1].w;
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...MUTED);
    const rem = doc.splitTextToSize(row[2], tableCols[2].w - 4)[0];
    doc.text(rem, tx, y + 4.5);

    y += rowH;
  });

  // Table Outer Border
  doc.setDrawColor(...DARK_EM); doc.setLineWidth(0.3);
  doc.rect(ML, y - tableRows.length * 6.5 - 6.5, CW, tableRows.length * 6.5 + 6.5, 'S');

  y += 6;

  // ── 4. TEACHER FEEDBACK & EVALUATION ─────────────────────────
  doc.setFontSize(9.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...DARK_EM);
  doc.text('4. TEACHER FEEDBACK & EVALUATION', ML, y);
  doc.setDrawColor(...GOLD); doc.setLineWidth(0.3);
  doc.line(ML, y + 2, PW - MR, y + 2);

  y += 5;

  const fbBoxH = 22;
  // Section 4 box color reflects teacher status specifically
  const fb4Bg    = isTeacherApproved ? LIGHT_BG : isTeacherRepeat ? REPEAT_BG : [254, 243, 199];
  const fb4Border = isTeacherApproved ? EMERALD : isTeacherRepeat ? REPEAT_RED : [217, 119, 6];
  const fb4BadgeBg = isTeacherApproved ? PASS_GREEN : isTeacherRepeat ? REPEAT_RED : [161, 97, 0];
  doc.setFillColor(...fb4Bg);
  doc.roundedRect(ML, y, CW, fbBoxH, 2, 2, 'F');
  doc.setDrawColor(...fb4Border); doc.setLineWidth(0.3);
  doc.roundedRect(ML, y, CW, fbBoxH, 2, 2, 'S');

  // Status Badge inside box
  doc.setFillColor(...fb4BadgeBg);
  doc.roundedRect(ML + 4, y + 4, 36, 5.5, 1, 1, 'F');
  doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(...WHITE);
  doc.text(`STATUS: ${teacherStatus}`, ML + 22, y + 8, { align: 'center' });

  doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...DARK_EM);
  doc.text('Teacher Comments:', ML + 44, y + 8);

  doc.setFontSize(8); doc.setFont('helvetica', 'italic'); doc.setTextColor(...TEXT);
  const fbLines = doc.splitTextToSize(`"${teacherFeedbackText}"`, CW - 50);
  fbLines.slice(0, 2).forEach((line, idx) => {
    doc.text(line, ML + 44, y + 13 + idx * 4.5);
  });

  y += fbBoxH + 5;


  // ── 5. PARENT-FRIENDLY SUMMARY ───────────────────────────────
  doc.setFontSize(9.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...DARK_EM);
  doc.text('5. PARENT-FRIENDLY SUMMARY', ML, y);
  doc.setDrawColor(...GOLD); doc.setLineWidth(0.3);
  doc.line(ML, y + 2, PW - MR, y + 2);

  y += 5;

  doc.setFillColor(254, 253, 245);
  doc.roundedRect(ML, y, CW, 17, 2, 2, 'F');
  doc.setDrawColor(...GOLD); doc.setLineWidth(0.3);
  doc.roundedRect(ML, y, CW, 17, 2, 2, 'S');

  doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...TEXT);
  const pSumLines = doc.splitTextToSize(parentSummaryText, CW - 8);
  pSumLines.slice(0, 3).forEach((line, idx) => {
    doc.text(line, ML + 4, y + 5.5 + idx * 4.5);
  });

  y += 21;

  // ── 6. RECOMMENDATIONS ───────────────────────────────────────
  doc.setFontSize(9.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...DARK_EM);
  doc.text('6. RECOMMENDATIONS & NEXT STEPS', ML, y);
  doc.setDrawColor(...GOLD); doc.setLineWidth(0.3);
  doc.line(ML, y + 2, PW - MR, y + 2);

  y += 5;

  const recList = isFullyPassed ? [
    '• Ready to proceed to the next assigned Tasmiq surah / ayahs.',
    '• Maintain daily revision of memorized surahs (Murajaah schedule).',
    '• Practice throat letter makhraj to maintain high recitation quality.',
  ] : !aiPassed ? [
    '• Continue AI practice exercises until achieving a passing score (70% or above).',
    '• Focus on Ghunnah nasalization and Mad Asli elongation counts.',
    '• Use the audio listening feature in TasmiqAI app for self-correction.',
  ] : [
    '• Re-record and resubmit assigned ayahs for teacher review.',
    '• Review teacher feedback and focus on highlighted areas.',
    '• Schedule a session with your teacher for additional guidance.',
  ];

  doc.setFillColor(...LIGHT_BG);
  doc.roundedRect(ML, y, CW, 18, 2, 2, 'F');
  doc.setDrawColor(...BORDER); doc.setLineWidth(0.2);
  doc.roundedRect(ML, y, CW, 18, 2, 2, 'S');

  recList.forEach((rec, idx) => {
    doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...DARK_EM);
    doc.text(rec, ML + 4, y + 5 + idx * 5);
  });

  y += 22;

  // ── 7. FOOTER SIGNATURE & STAMP BLOCK ────────────────────────
  const sigBoxH = 26;
  const sigW = (CW - 10) / 2;

  // Signature 1: Teacher
  const sig1X = ML;
  doc.setDrawColor(...BORDER); doc.setLineWidth(0.2);
  doc.roundedRect(sig1X, y, sigW, sigBoxH, 2, 2, 'S');
  doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(...MUTED);
  doc.text('EVALUATOR TEACHER SIGNATURE', sig1X + sigW / 2, y + 5, { align: 'center' });
  doc.setDrawColor(...MUTED); doc.setLineWidth(0.2);
  doc.line(sig1X + 12, y + 17, sig1X + sigW - 12, y + 17);
  doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...TEXT);
  // Show actual teacher name; never show 'Teacher' as a hardcoded placeholder
  const sigName = (evalTeacher && evalTeacher !== '—') ? evalTeacher : 'Not Available';
  doc.text(sigName, sig1X + sigW / 2, y + 21, { align: 'center' });

  // Signature 2: School Stamp Placeholder
  const sig2X = ML + sigW + 10;
  doc.setDrawColor(...BORDER); doc.setLineWidth(0.2);
  doc.roundedRect(sig2X, y, sigW, sigBoxH, 2, 2, 'S');
  doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(...MUTED);
  doc.text('INSTITUTION OFFICIAL STAMP', sig2X + sigW / 2, y + 5, { align: 'center' });
  doc.setDrawColor(210, 210, 210); doc.setLineWidth(0.2);
  doc.roundedRect(sig2X + sigW / 2 - 16, y + 8, 32, 14, 1, 1, 'S');
  doc.setFontSize(6.5); doc.setFont('helvetica', 'italic'); doc.setTextColor(170, 170, 170);
  doc.text('[ SCHOOL STAMP SEAL ]', sig2X + sigW / 2, y + 16, { align: 'center' });

  // ── 8. FOOTER STRIP ──────────────────────────────────────────
  doc.setFillColor(...DARK_EM);
  doc.rect(0, PH - 8, PW, 8, 'F');
  doc.setTextColor(...WHITE);
  doc.setFontSize(7); doc.setFont('helvetica', 'normal');
  doc.text('Report Generated by TasmiqAI Academic System  |  For Student & Parent Record', ML, PH - 2.8);
  doc.text(`Page 1 of ${scope === 'class' && classStudents.length > 0 ? 2 : 1}`, PW - MR, PH - 2.8, { align: 'right' });

  // ═════════════════════════════════════════════════════════════
  // PAGE 2 — CLASS ROSTER (Only for Class Scope)
  // ═════════════════════════════════════════════════════════════
  if (scope === 'class' && classStudents.length > 0) {
    doc.addPage();

    // Header
    doc.setFillColor(...DARK_EM); doc.rect(0, 0, PW, 24, 'F');
    doc.setFillColor(...GOLD); doc.rect(0, 24, PW, 1.5, 'F');
    doc.setTextColor(...WHITE);
    doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text('TASMIQAI', ML, 10);
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.text('Class Performance Summary Roster', ML, 16);
    doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.text('CLASS STUDENT ROSTER', PW - MR, 10, { align: 'right' });

    let cy = 32;

    doc.setFontSize(9.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...DARK_EM);
    doc.text(`CLASS: ${className.toUpperCase()} (${classStudents.length} Students)`, ML, cy);
    doc.setDrawColor(...GOLD); doc.setLineWidth(0.3);
    doc.line(ML, cy + 2, PW - MR, cy + 2);

    cy += 6;

    const rCols = [
      { h: '#',          w: 12 },
      { h: 'STUDENT NAME', w: 65 },
      { h: 'EMAIL ADDRESS', w: 65 },
      { h: 'AVG SCORE',  w: 22 },
      { h: 'STATUS',     w: 18 },
    ];

    doc.setFillColor(...DARK_EM); doc.rect(ML, cy, CW, 6.5, 'F');
    doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(...WHITE);
    let rx = ML + 3;
    rCols.forEach(c => { doc.text(c.h, rx, cy + 4.5); rx += c.w; });

    cy += 6.5;

    classStudents.forEach((s, idx) => {
      if (cy > PH - 18) return;
      const sScore = s.avg_score || 80;
      const sPass = sScore >= 70;
      doc.setFillColor(idx % 2 === 0 ? 255 : 248, idx % 2 === 0 ? 255 : 252, idx % 2 === 0 ? 255 : 248);
      doc.rect(ML, cy, CW, 6, 'F');
      doc.setDrawColor(...BORDER); doc.setLineWidth(0.15); doc.line(ML, cy + 6, ML + CW, cy + 6);

      doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...TEXT);
      rx = ML + 3;
      doc.text(String(idx + 1), rx, cy + 4); rx += rCols[0].w;
      doc.setFont('helvetica', 'bold');
      doc.text((s.full_name || s.display_name || s.email?.split('@')[0] || '—').slice(0, 32), rx, cy + 4); rx += rCols[1].w;
      doc.setFont('helvetica', 'normal'); doc.setTextColor(...MUTED);
      doc.text((s.email || '—').slice(0, 32), rx, cy + 4); rx += rCols[2].w;
      doc.setFont('helvetica', 'bold'); doc.setTextColor(...EMERALD);
      doc.text(`${sScore}%`, rx, cy + 4); rx += rCols[3].w;
      doc.setTextColor(...(sPass ? PASS_GREEN : REPEAT_RED));
      doc.text(sPass ? 'PASS' : 'REPEAT', rx, cy + 4);

      cy += 6;
    });

    // Footer Page 2
    doc.setFillColor(...DARK_EM); doc.rect(0, PH - 8, PW, 8, 'F');
    doc.setTextColor(...WHITE);
    doc.setFontSize(7); doc.setFont('helvetica', 'normal');
    doc.text('Report Generated by TasmiqAI Academic System  |  Class Roster', ML, PH - 2.8);
    doc.text('Page 2 of 2', PW - MR, PH - 2.8, { align: 'right' });
  }

  return doc;
}
