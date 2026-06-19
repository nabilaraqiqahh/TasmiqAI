/**
 * TasmiqAI — A4 PDF Report Generator
 * Pure jsPDF — no HTML rendering, no screenshot, proper A4 layout
 */
import jsPDF from 'jspdf';

// ── Color helpers ─────────────────────────────────────────────
const EMERALD  = [11,  110, 79];
const DARK_EM  = [6,   78,  59];
const GOLD     = [212, 175, 55];
const TEXT     = [31,  41,  55];
const MUTED    = [107, 114, 128];
const LIGHT_BG = [245, 252, 232];
const WHITE    = [255, 255, 255];

const fmtDate = d => {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }); }
  catch { return '—'; }
};

const scoreLabel = s => {
  const n = Number(s) || 0;
  if (n >= 85) return 'Excellent';
  if (n >= 70) return 'Good';
  if (n >= 60) return 'Satisfactory';
  return 'Needs Revision';
};

// ── Page dimensions (A4 mm) ───────────────────────────────────
const PW = 210;   // page width
const PH = 297;   // page height
const ML = 15;    // left margin
const MR = 15;    // right margin
const CW = PW - ML - MR;  // content width

// ── Draw header (every page) ──────────────────────────────────
function header(doc, title, y = 0) {
  // Dark emerald bar
  doc.setFillColor(...DARK_EM);
  doc.rect(0, y, PW, 22, 'F');
  // Gold line
  doc.setFillColor(...GOLD);
  doc.rect(0, y + 22, PW, 1.5, 'F');
  // Left: system name
  doc.setTextColor(...WHITE);
  doc.setFontSize(12); doc.setFont('helvetica', 'bold');
  doc.text('TASMIQAI', ML, y + 9);
  doc.setFontSize(7); doc.setFont('helvetica', 'normal');
  doc.text('AI-Based Quran Recitation Monitoring System', ML, y + 15);
  // Right: report title
  doc.setFontSize(9); doc.setFont('helvetica', 'bold');
  doc.text(title.toUpperCase(), PW - MR, y + 9, { align: 'right' });
  doc.setFontSize(7); doc.setFont('helvetica', 'normal');
  doc.text('Academic Report — Confidential', PW - MR, y + 15, { align: 'right' });
  return y + 26;
}

// ── Draw footer (every page) ──────────────────────────────────
function footer(doc, pageNum, total) {
  doc.setFillColor(...DARK_EM);
  doc.rect(0, PH - 10, PW, 10, 'F');
  doc.setTextColor(...WHITE);
  doc.setFontSize(7); doc.setFont('helvetica', 'normal');
  doc.text('TasmiqAI  |  For Academic Use Only', ML, PH - 3.5);
  doc.text(`Page ${pageNum} of ${total}`, PW - MR, PH - 3.5, { align: 'right' });
}

// ── Section heading ───────────────────────────────────────────
function section(doc, text, y) {
  doc.setFillColor(...EMERALD);
  doc.rect(ML, y, 3, 8, 'F');
  doc.setFontSize(10); doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DARK_EM);
  doc.text(text, ML + 5, y + 6);
  doc.setDrawColor(...GOLD); doc.setLineWidth(0.3);
  doc.line(ML, y + 10, PW - MR, y + 10);
  return y + 14;
}

// ── Metadata table ────────────────────────────────────────────
function metaBlock(doc, items, y) {
  doc.setFillColor(...LIGHT_BG);
  doc.roundedRect(ML, y, CW, 6 * Math.ceil(items.length / 2) + 8, 2, 2, 'F');
  doc.setDrawColor(...EMERALD); doc.setLineWidth(0.2);
  doc.roundedRect(ML, y, CW, 6 * Math.ceil(items.length / 2) + 8, 2, 2, 'S');

  const col = CW / 2 - 4;
  let cx = ML + 4, cy = y + 7;
  items.forEach((item, i) => {
    if (i > 0 && i % 2 === 0) { cx = ML + 4; cy += 7; }
    if (i % 2 === 1) cx = ML + CW / 2 + 4;
    doc.setFontSize(6.5); doc.setFont('helvetica', 'bold');
    doc.setTextColor(...MUTED);
    doc.text(item[0].toUpperCase() + ':', cx, cy);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...TEXT);
    const val = doc.splitTextToSize(String(item[1] || '—'), col - 28)[0];
    doc.text(val, cx + 26, cy);
  });
  return y + 6 * Math.ceil(items.length / 2) + 12;
}

// ── Stat row ──────────────────────────────────────────────────
function statRow(doc, cards, y) {
  const w = CW / cards.length - 3;
  cards.forEach((c, i) => {
    const x = ML + i * (w + 3);
    doc.setFillColor(...LIGHT_BG);
    doc.roundedRect(x, y, w, 18, 2, 2, 'F');
    doc.setFillColor(...(c.color || EMERALD));
    doc.roundedRect(x, y, w, 2, 1, 1, 'F');
    doc.setFontSize(13); doc.setFont('helvetica', 'bold');
    doc.setTextColor(...(c.color || EMERALD));
    doc.text(String(c.value), x + w / 2, y + 11, { align: 'center' });
    doc.setFontSize(6); doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);
    doc.text(c.label, x + w / 2, y + 16, { align: 'center' });
  });
  return y + 22;
}

// ── Progress bar ──────────────────────────────────────────────
function progressBar(doc, label, value, color, y) {
  const pct = Math.min(100, Math.max(0, Number(value) || 0));
  doc.setFontSize(8); doc.setFont('helvetica', 'bold');
  doc.setTextColor(...TEXT); doc.text(label, ML, y);
  doc.setFontSize(8); doc.setFont('helvetica', 'bold');
  doc.setTextColor(...(color || EMERALD));
  doc.text(`${pct}%`, PW - MR, y, { align: 'right' });
  doc.setFillColor(220, 235, 220);
  doc.roundedRect(ML, y + 2, CW, 4, 1, 1, 'F');
  doc.setFillColor(...(color || EMERALD));
  if (pct > 0) doc.roundedRect(ML, y + 2, CW * pct / 100, 4, 1, 1, 'F');
  return y + 10;
}

// ── Table ─────────────────────────────────────────────────────
function table(doc, cols, rows, y) {
  const rowH = 7;
  // Header
  doc.setFillColor(...DARK_EM);
  doc.rect(ML, y, CW, rowH + 1, 'F');
  doc.setFontSize(7); doc.setFont('helvetica', 'bold');
  doc.setTextColor(...WHITE);
  let cx = ML + 2;
  cols.forEach(c => {
    doc.text(c.h.toUpperCase(), cx, y + rowH - 1);
    cx += c.w;
  });
  y += rowH + 1;

  rows.forEach((row, ri) => {
    if (y + rowH > PH - 16) return; // skip if no space
    doc.setFillColor(ri % 2 === 0 ? 255 : 245, ri % 2 === 0 ? 255 : 252, ri % 2 === 0 ? 255 : 232);
    doc.rect(ML, y, CW, rowH, 'F');
    doc.setFontSize(7); doc.setFont('helvetica', 'normal');
    cx = ML + 2;
    cols.forEach(c => {
      const raw = row[c.k] ?? '—';
      const val = doc.splitTextToSize(String(raw), c.w - 3)[0] || '—';
      if (c.score) {
        const n = Number(raw) || 0;
        doc.setTextColor(...(n >= 85 ? EMERALD : n >= 70 ? GOLD : [192,57,43]));
        doc.setFont('helvetica', 'bold');
        doc.text(val + '%', cx, y + rowH - 1.5);
        doc.setFont('helvetica', 'normal'); doc.setTextColor(...TEXT);
      } else {
        doc.setTextColor(...TEXT);
        doc.text(val, cx, y + rowH - 1.5);
      }
      cx += c.w;
    });
    // row separator
    doc.setDrawColor(220, 220, 210); doc.setLineWidth(0.1);
    doc.line(ML, y + rowH, ML + CW, y + rowH);
    y += rowH;
  });
  // outer border
  doc.setDrawColor(...EMERALD); doc.setLineWidth(0.3);
  doc.rect(ML, y - rows.length * rowH - rowH - 1, CW, rows.length * rowH + rowH + 1, 'S');
  return y + 4;
}

// ── MAIN GENERATOR ────────────────────────────────────────────
export async function generateReport(data) {
  const {
    reportType = 'Academic Report',
    scope = 'single',
    period = {},
    student,
    classObj,
    classStudents = [],
    stats = {},
    recitations = [],
    tajwidErrors = [],
    recommendations = [],
    feedbackRecs = [],
    classRank,
    teacherName = 'TasmiqAI',
  } = data;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const title = reportType;
  const reviewedRecs = recitations.filter(r => r.reviewed && r.score != null);

  const avgOf = field => {
    const v = reviewedRecs.map(r => r[field]).filter(x => x != null && x > 0);
    return v.length ? Math.round(v.reduce((a,b)=>a+b,0)/v.length) : (stats.avgScore || 0);
  };

  // ════════════════════════════════════════════════
  // PAGE 1 — Summary
  // ════════════════════════════════════════════════
  let y = header(doc, title);

  y = metaBlock(doc, [
    ['Report Type',    title],
    ['Period',         period.label || fmtDate(period.start) + ' – ' + fmtDate(period.end)],
    ['Generated',      fmtDate(new Date())],
    ['Class',          classObj?.name || '—'],
    ['Student',        student ? (student.full_name || student.email || '—') : 'All Students'],
    ['Prepared By',    teacherName || 'TasmiqAI System'],
  ], y + 2);

  y = section(doc, '1. Executive Summary', y + 2);
  y = statRow(doc, [
    { label: 'Avg Score',      value: `${stats.avgScore || 0}%`,   color: EMERALD },
    { label: 'Best Score',     value: `${stats.bestScore || 0}%`,  color: GOLD },
    { label: 'Total Sessions', value: stats.totalRecs || 0,        color: DARK_EM },
    { label: 'Reviewed',       value: stats.reviewedCount || 0,    color: EMERALD },
    { label: 'Review Rate',    value: `${stats.attendanceRate || 0}%`, color: GOLD },
  ], y);

  // Info rows
  [
    ['Subject',           student ? (student.full_name || student.email) : classObj?.name || '—'],
    ['Performance Status', scoreLabel(stats.avgScore || 0)],
    ['Report Period',      period.label || '—'],
    ...(classRank ? [['Class Rank', `#${classRank.rank} of ${classRank.total}`]] : []),
  ].forEach(row => {
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...MUTED);
    doc.text(row[0] + ':', ML, y);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...TEXT);
    doc.text(String(row[1]).slice(0, 60), ML + 38, y);
    y += 6;
  });

  // ════════════════════════════════════════════════
  // PAGE 2 — Recitation Records
  // ════════════════════════════════════════════════
  if (recitations.length > 0) {
    doc.addPage();
    y = header(doc, title);
    y = section(doc, '2. Recitation Records', y + 2);

    y = table(doc,
      [
        { h: '#',       k: 'num',      w: 10 },
        { h: 'Date',    k: 'date',     w: 26 },
        { h: 'Surah',   k: 'surah',    w: 38 },
        { h: 'Ayah',    k: 'ayah',     w: 20 },
        { h: 'Score',   k: 'score',    w: 18, score: true },
        { h: 'Status',  k: 'status',   w: 34 },
        { h: 'Reviewed',k: 'reviewed', w: 34 },
      ],
      recitations.slice(0, 30).map((r, i) => ({
        num:      i + 1,
        date:     fmtDate(r.submitted_at || r.recorded_at),
        surah:    r.surah || `Surah ${r.surah_number}`,
        ayah:     r.ayah || `${r.start_verse}–${r.end_verse}`,
        score:    r.score || 0,
        status:   scoreLabel(r.score || 0),
        reviewed: r.reviewed ? 'Reviewed' : 'Pending',
      })), y
    );
  }

  // ════════════════════════════════════════════════
  // PAGE 3 — AI Assessment
  // ════════════════════════════════════════════════
  doc.addPage();
  y = header(doc, title);
  y = section(doc, '3. AI Assessment Breakdown', y + 2);

  const mem  = avgOf('memorization_score');
  const pron = avgOf('pronunciation_score');
  const taj  = avgOf('tajwid_score');
  const flu  = avgOf('fluency_score');

  y = statRow(doc, [
    { label: 'Memorization',  value: `${mem}%`,   color: EMERALD },
    { label: 'Pronunciation', value: `${pron}%`,  color: [74,144,164] },
    { label: 'Tajwid',        value: `${taj}%`,   color: GOLD },
    { label: 'Fluency',       value: `${flu}%`,   color: [155,142,196] },
  ], y);
  y += 4;

  y = progressBar(doc, 'Memorization Accuracy',   mem,  EMERALD,         y);
  y = progressBar(doc, 'Pronunciation Accuracy',   pron, [74,144,164],    y);
  y = progressBar(doc, 'Tajwid Compliance',        taj,  GOLD,            y);
  y = progressBar(doc, 'Fluency & Flow',           flu,  [155,142,196],   y);

  // ════════════════════════════════════════════════
  // PAGE 4 — Tajwid + Recommendations
  // ════════════════════════════════════════════════
  if (tajwidErrors.length > 0 || recommendations.length > 0) {
    doc.addPage();
    y = header(doc, title);

    if (tajwidErrors.length > 0) {
      y = section(doc, '4. Tajwid Error Analysis', y + 2);
      y = table(doc,
        [
          { h: 'Tajwid Rule', k: 'rule',     w: 50 },
          { h: 'Count',       k: 'count',    w: 20 },
          { h: 'Severity',    k: 'severity', w: 25 },
          { h: 'Guidance',    k: 'tip',      w: 85 },
        ],
        tajwidErrors.map(e => ({
          rule:     e.rule || e.label || '—',
          count:    e.count || 0,
          severity: (e.count||0) >= 5 ? 'High' : (e.count||0) >= 2 ? 'Medium' : 'Low',
          tip:      (e.tip || 'Practice this rule regularly.').slice(0, 60),
        })), y
      );
    }

    if (recommendations.length > 0) {
      y = section(doc, '5. Recommendations', y + 4);
      recommendations.forEach((rec, i) => {
        if (y > PH - 30) return;
        doc.setFillColor(...LIGHT_BG);
        doc.roundedRect(ML, y, CW, 12, 1.5, 1.5, 'F');
        doc.setFontSize(8); doc.setFont('helvetica', 'bold');
        doc.setTextColor(...EMERALD);
        doc.text(`${i+1}. ${(rec.error || '').slice(0, 40)}`, ML + 3, y + 5);
        doc.setFont('helvetica', 'normal'); doc.setTextColor(...TEXT);
        const lines = doc.splitTextToSize((rec.tip || '').slice(0, 150), CW - 6);
        lines.slice(0,1).forEach(l => doc.text(l, ML + 3, y + 9.5));
        y += 15;
      });
    }
  }

  // ════════════════════════════════════════════════
  // PAGE 5 — Class Roster (if class scope)
  // ════════════════════════════════════════════════
  if (scope === 'class' && classStudents.length > 0) {
    doc.addPage();
    y = header(doc, title);
    y = section(doc, '5. Class Student Roster', y + 2);
    y = table(doc,
      [
        { h: '#',     k: 'num',    w: 12 },
        { h: 'Name',  k: 'name',   w: 55 },
        { h: 'Email', k: 'email',  w: 63 },
        { h: 'Score', k: 'score',  w: 20, score: true },
        { h: 'Status',k: 'status', w: 30 },
      ],
      classStudents.map((s, i) => ({
        num:    i + 1,
        name:   (s.full_name || s.email?.split('@')[0] || '—').slice(0,28),
        email:  (s.email || '—').slice(0,30),
        score:  s.avg_score || 0,
        status: scoreLabel(s.avg_score || 0),
      })), y
    );
  }

  // ════════════════════════════════════════════════
  // Add footers to ALL pages
  // ════════════════════════════════════════════════
  const total = doc.internal.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    footer(doc, p, total);
  }

  return doc;
}
