/**
 * TasmiqAI — Formal A4 PDF Report Generator
 * Uses jsPDF for proper A4 format, NOT screenshot export
 */
import jsPDF from 'jspdf';

const E  = [11,  110, 79];   // #0B6E4F emerald
const ED = [6,   78,  59];   // #064E3B dark emerald
const G  = [212, 175, 55];   // #D4AF37 gold
const TXT = [31, 41,  55];   // #1F2937
const MUT = [107,114,128];   // #6B7280
const LT  = [245,252,232];   // light yellow bg

// ── Helpers ──────────────────────────────────────────────────
const r = ([r,g,b]) => [r,g,b];
const hex2rgb = h => {
  const v = parseInt(h.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—';
const scoreLabel = s => s >= 85 ? 'Excellent' : s >= 70 ? 'Good' : s >= 60 ? 'Satisfactory' : 'Needs Revision';
const scoreColor = s => s >= 85 ? E : s >= 70 ? G : [220,38,38];

// ── Wrap long text into lines ─────────────────────────────────
function splitText(pdf, text, maxWidth, fontSize = 10) {
  pdf.setFontSize(fontSize);
  return pdf.splitTextToSize(String(text || ''), maxWidth);
}

// ── Draw page header ──────────────────────────────────────────
function drawHeader(pdf, reportTitle, pageW) {
  // Dark emerald header bar
  pdf.setFillColor(...ED);
  pdf.rect(0, 0, pageW, 28, 'F');

  // Gold accent line
  pdf.setFillColor(...G);
  pdf.rect(0, 28, pageW, 2, 'F');

  // System name
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  pdf.text('TASMIQAI', 15, 11);

  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');
  pdf.text('AI-Based Quran Recitation Monitoring System', 15, 18);

  // Report title (right aligned)
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'bold');
  pdf.text(reportTitle.toUpperCase(), pageW - 15, 14, { align: 'right' });
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');
  pdf.text('Academic Report Document', pageW - 15, 21, { align: 'right' });

  return 38; // y after header
}

// ── Draw page footer ──────────────────────────────────────────
function drawFooter(pdf, pageNum, totalPages, pageW, pageH) {
  pdf.setFillColor(...ED);
  pdf.rect(0, pageH - 12, pageW, 12, 'F');

  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'normal');
  pdf.text('TASMIQAI  |  Confidential – Academic Use Only', 15, pageH - 4);
  pdf.text(`Page ${pageNum} of ${totalPages}`, pageW - 15, pageH - 4, { align: 'right' });
}

// ── Metadata block ────────────────────────────────────────────
function drawMetadata(pdf, meta, y, pageW) {
  const colW = (pageW - 30) / 2;
  pdf.setFillColor(245, 252, 232);
  pdf.roundedRect(14, y, pageW - 28, 28, 2, 2, 'F');
  pdf.setDrawColor(...E);
  pdf.setLineWidth(0.3);
  pdf.roundedRect(14, y, pageW - 28, 28, 2, 2, 'S');

  const items = [
    ['Report Title',    meta.title        || '—'],
    ['Report Period',   meta.period       || '—'],
    ['Generated Date',  fmtDate(new Date())    ],
    ['Class',          meta.className    || '—'],
    ['Student',        meta.studentName  || '—'],
    ['Teacher',        meta.teacherName  || '—'],
  ];

  let cx = 18;
  let cy = y + 7;
  items.forEach((item, i) => {
    if (i === 3) { cx = 18 + colW + 6; cy = y + 7; }
    pdf.setFontSize(7); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(...MUT);
    pdf.text(item[0].toUpperCase() + ':', cx, cy);
    pdf.setFontSize(8); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...TXT);
    pdf.text(String(item[1]).slice(0, 40), cx + 28, cy);
    cy += 8;
  });

  return y + 32;
}

// ── Section title ─────────────────────────────────────────────
function drawSection(pdf, title, y, pageW) {
  pdf.setFillColor(...E);
  pdf.rect(14, y, 3, 10, 'F');
  pdf.setFontSize(11); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...ED);
  pdf.text(title, 20, y + 7.5);
  pdf.setDrawColor(...G); pdf.setLineWidth(0.4);
  pdf.line(14, y + 12, pageW - 14, y + 12);
  return y + 17;
}

// ── Stat card row ─────────────────────────────────────────────
function drawStatCards(pdf, cards, y, pageW) {
  const cW = (pageW - 28 - (cards.length - 1) * 5) / cards.length;
  cards.forEach((card, i) => {
    const cx = 14 + i * (cW + 5);
    pdf.setFillColor(245, 252, 232);
    pdf.roundedRect(cx, y, cW, 22, 2, 2, 'F');
    pdf.setDrawColor(...E); pdf.setLineWidth(0.3);
    pdf.roundedRect(cx, y, cW, 22, 2, 2, 'S');
    // Top color bar
    pdf.setFillColor(...(card.color || E));
    pdf.roundedRect(cx, y, cW, 2, 1, 1, 'F');

    pdf.setFontSize(14); pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...(card.color || E));
    pdf.text(String(card.value), cx + cW / 2, y + 13, { align: 'center' });

    pdf.setFontSize(7); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(...MUT);
    pdf.text(card.label, cx + cW / 2, y + 19, { align: 'center' });
  });
  return y + 26;
}

// ── Table ─────────────────────────────────────────────────────
function drawTable(pdf, headers, rows, y, pageW, pageH) {
  const margin = 14;
  const tableW = pageW - margin * 2;
  const colWidths = headers.map(h => h.width || (tableW / headers.length));

  // Header row
  pdf.setFillColor(...ED);
  pdf.rect(margin, y, tableW, 8, 'F');
  pdf.setFontSize(7.5); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(255,255,255);
  let cx = margin + 3;
  headers.forEach((h, i) => {
    pdf.text(h.label.toUpperCase(), cx, y + 5.5);
    cx += colWidths[i];
  });
  y += 8;

  rows.forEach((row, ri) => {
    // Check if we need a new page
    if (y > pageH - 25) return; // handled outside

    pdf.setFillColor(ri % 2 === 0 ? 255 : 250, ri % 2 === 0 ? 255 : 252, ri % 2 === 0 ? 255 : 232);
    pdf.rect(margin, y, tableW, 7, 'F');

    pdf.setFontSize(7.5); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(...TXT);
    cx = margin + 3;
    headers.forEach((h, i) => {
      const val = String(row[h.key] ?? '—').slice(0, 30);
      if (h.isScore) {
        const s = parseFloat(row[h.key] || 0);
        pdf.setTextColor(...scoreColor(s));
        pdf.setFont('helvetica', 'bold');
        pdf.text(val + '%', cx, y + 5);
        pdf.setTextColor(...TXT); pdf.setFont('helvetica', 'normal');
      } else {
        pdf.text(val, cx, y + 5);
      }
      cx += colWidths[i];
    });

    // Row border
    pdf.setDrawColor(230, 230, 220); pdf.setLineWidth(0.1);
    pdf.line(margin, y + 7, margin + tableW, y + 7);
    y += 7;
  });

  // Outer border
  pdf.setDrawColor(...E); pdf.setLineWidth(0.3);
  pdf.rect(margin, y - rows.length * 7 - 8, tableW, rows.length * 7 + 8, 'S');

  return y + 4;
}

// ── MAIN EXPORT FUNCTION ─────────────────────────────────────────────────────
export async function generateReport(reportData) {
  const pdf   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  const {
    reportType, scope, period, student, classObj,
    classStudents = [], stats, recitations = [],
    weeklyTrend = [], monthlyTrend = [], tajwidErrors = [],
    recommendations = [], feedbackRecs = [], classRank,
    generatedAt, teacherName,
  } = reportData;

  let currentPage = 1;
  const allPages = []; // will update footers at end

  const newPage = (title) => {
    if (currentPage > 1) pdf.addPage();
    currentPage++;
    const y = drawHeader(pdf, title || reportType, pageW);
    return y;
  };

  // ── PAGE 1: COVER + METADATA + EXECUTIVE SUMMARY ──────────────
  let y = drawHeader(pdf, reportType, pageW);

  // Metadata
  y = drawMetadata(pdf, {
    title:       reportType,
    period:      period?.label || '',
    className:   classObj?.name || '',
    studentName: student ? (student.full_name || student.email) : (scope === 'class' ? 'All Students' : '—'),
    teacherName: teacherName || 'TasmiqAI System',
  }, y + 4, pageW);

  // Executive Summary section
  y = drawSection(pdf, '1. EXECUTIVE SUMMARY', y + 4, pageW);

  y = drawStatCards(pdf, [
    { label: 'Avg Score',       value: `${stats.avgScore}%`,      color: E },
    { label: 'Best Score',      value: `${stats.bestScore}%`,     color: G },
    { label: 'Total Sessions',  value: stats.totalRecs,           color: ED },
    { label: 'Reviewed',        value: stats.reviewedCount,       color: E },
    { label: 'Review Rate',     value: `${stats.attendanceRate}%`, color: G },
  ], y, pageW);

  // Summary info table
  const summaryRows = [
    { field: 'Subject',           value: student ? (student.full_name || student.email) : classObj?.name || '—' },
    { field: 'Performance Status', value: scoreLabel(stats.avgScore) },
    { field: 'Report Period',      value: period?.label || '—' },
    { field: 'Class',              value: classObj?.name || '—' },
    classRank ? { field: 'Class Rank', value: `#${classRank.rank} of ${classRank.total} students` } : null,
  ].filter(Boolean);

  y += 4;
  summaryRows.forEach(row => {
    pdf.setFontSize(8); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...MUT);
    pdf.text(row.field + ':', 16, y);
    pdf.setFont('helvetica', 'normal'); pdf.setTextColor(...TXT);
    pdf.text(String(row.value), 60, y);
    y += 6;
  });

  // ── PAGE 2: RECITATION RECORDS ────────────────────────────────
  if (recitations.length > 0) {
    y = newPage('Recitation Records');
    y = drawSection(pdf, '2. RECITATION RECORDS', y + 4, pageW);

    const recRows = recitations.slice(0, 30).map((r, i) => ({
      num:     i + 1,
      date:    fmtDate(r.submitted_at || r.recorded_at),
      surah:   r.surah || `Surah ${r.surah_number}`,
      ayah:    r.ayah || `${r.start_verse}–${r.end_verse}`,
      score:   r.score || 0,
      status:  scoreLabel(r.score || 0),
      reviewed: r.reviewed ? 'Yes' : 'Pending',
    }));

    y = drawTable(pdf,
      [
        { label: '#',       key: 'num',      width: 10 },
        { label: 'Date',    key: 'date',     width: 28 },
        { label: 'Surah',   key: 'surah',    width: 35 },
        { label: 'Ayah',    key: 'ayah',     width: 22 },
        { label: 'Score',   key: 'score',    width: 20, isScore: true },
        { label: 'Status',  key: 'status',   width: 35 },
        { label: 'Reviewed', key: 'reviewed', width: 20 },
      ],
      recRows, y, pageW, pageH
    );
  }

  // ── PAGE 3: AI ASSESSMENT BREAKDOWN ──────────────────────────
  y = newPage('AI Assessment');
  y = drawSection(pdf, '3. AI ASSESSMENT BREAKDOWN', y + 4, pageW);

  // Score breakdown cards
  const reviewedRecs = recitations.filter(r => r.reviewed && r.score);
  const avgOf = field => {
    const v = reviewedRecs.map(r => r[field]).filter(x => x != null && x > 0);
    return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : stats.avgScore;
  };
  const mem   = avgOf('memorization_score');
  const pron  = avgOf('pronunciation_score');
  const taj   = avgOf('tajwid_score');
  const flu   = avgOf('fluency_score');

  y = drawStatCards(pdf, [
    { label: 'Memorization', value: `${mem}%`,   color: E },
    { label: 'Pronunciation', value: `${pron}%`, color: [74, 144, 164] },
    { label: 'Tajwid',       value: `${taj}%`,   color: G },
    { label: 'Fluency',      value: `${flu}%`,   color: [155, 142, 196] },
  ], y, pageW);

  y += 8;

  // Draw score bars
  [
    { label: 'Memorization Accuracy', val: mem,  color: E },
    { label: 'Pronunciation',         val: pron, color: [74,144,164] },
    { label: 'Tajwid Compliance',     val: taj,  color: G },
    { label: 'Fluency & Flow',        val: flu,  color: [155,142,196] },
  ].forEach(s => {
    pdf.setFontSize(8); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...TXT);
    pdf.text(s.label, 16, y);
    pdf.setFont('helvetica', 'normal'); pdf.setTextColor(...MUT);
    pdf.text(`${s.val}%`, pageW - 16, y, { align: 'right' });

    pdf.setFillColor(220, 252, 231);
    pdf.roundedRect(16, y + 2, pageW - 32, 4, 1, 1, 'F');
    pdf.setFillColor(...s.color);
    pdf.roundedRect(16, y + 2, (pageW - 32) * s.val / 100, 4, 1, 1, 'F');

    y += 12;
  });

  // ── PAGE 4: TAJWID ERROR ANALYSIS ────────────────────────────
  if (tajwidErrors.length > 0) {
    y = newPage('Tajwid Analysis');
    y = drawSection(pdf, '4. TAJWID ERROR ANALYSIS', y + 4, pageW);

    const tajRows = tajwidErrors.map(e => ({
      rule:     e.rule || e.label || '—',
      count:    e.count || 0,
      severity: (e.count || 0) >= 5 ? 'High' : (e.count || 0) >= 2 ? 'Medium' : 'Low',
      tip:      e.tip || 'Practice this rule regularly.',
    }));

    y = drawTable(pdf,
      [
        { label: 'Tajwid Rule', key: 'rule',     width: 45 },
        { label: 'Count',      key: 'count',     width: 20 },
        { label: 'Severity',   key: 'severity',  width: 25 },
        { label: 'Guidance',   key: 'tip',       width: 95 },
      ],
      tajRows, y, pageW, pageH
    );
  }

  // ── PAGE 5: CLASS ROSTER (if class scope) ────────────────────
  if (scope === 'class' && classStudents.length > 0) {
    y = newPage('Class Performance');
    y = drawSection(pdf, '5. CLASS STUDENT ROSTER', y + 4, pageW);

    const classRows = classStudents.map((s, i) => ({
      num:    i + 1,
      name:   s.full_name || s.email?.split('@')[0] || '—',
      email:  s.email || '—',
      score:  s.avg_score || 0,
      status: scoreLabel(s.avg_score || 0),
    }));

    y = drawTable(pdf,
      [
        { label: '#',      key: 'num',    width: 12 },
        { label: 'Student Name', key: 'name', width: 55 },
        { label: 'Email',  key: 'email',  width: 65 },
        { label: 'Avg Score', key: 'score', width: 22, isScore: true },
        { label: 'Status', key: 'status', width: 32 },
      ],
      classRows, y, pageW, pageH
    );
  }

  // ── PAGE 6: RECOMMENDATIONS ──────────────────────────────────
  if (recommendations.length > 0 || feedbackRecs.length > 0) {
    y = newPage('Recommendations');
    y = drawSection(pdf, '6. RECOMMENDATIONS & FEEDBACK', y + 4, pageW);

    recommendations.forEach((rec, i) => {
      if (y > pageH - 30) return;
      pdf.setFillColor(245, 252, 232);
      pdf.roundedRect(14, y, pageW - 28, 14, 2, 2, 'F');
      pdf.setFontSize(8); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...E);
      pdf.text(`${i+1}. ${rec.error || 'Recommendation'}`, 18, y + 5);
      pdf.setFont('helvetica', 'normal'); pdf.setTextColor(...TXT);
      const lines = splitText(pdf, rec.tip || '', pageW - 40, 7.5);
      lines.forEach((l, li) => { pdf.text(l, 18, y + 10 + li * 4); });
      y += 18 + (lines.length - 1) * 4;
    });

    if (feedbackRecs.length > 0) {
      y += 6;
      pdf.setFontSize(9); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...ED);
      pdf.text('Teacher Feedback Notes:', 16, y);
      y += 6;
      feedbackRecs.forEach(f => {
        if (y > pageH - 20) return;
        const lines = splitText(pdf, (f.feedback || '').slice(0, 200), pageW - 36, 7.5);
        pdf.setFontSize(7); pdf.setFont('helvetica', 'italic'); pdf.setTextColor(...MUT);
        pdf.text(`• ${fmtDate(f.reviewed_at || f.submitted_at)}:`, 16, y);
        pdf.setFont('helvetica', 'normal'); pdf.setTextColor(...TXT);
        lines.forEach((l, li) => { pdf.text(l, 22, y + (li+1) * 4); });
        y += 6 + lines.length * 4;
      });
    }
  }

  // ── Add footers to all pages ──────────────────────────────────
  const total = pdf.internal.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    pdf.setPage(p);
    drawFooter(pdf, p, total, pageW, pageH);
  }

  return pdf;
}
