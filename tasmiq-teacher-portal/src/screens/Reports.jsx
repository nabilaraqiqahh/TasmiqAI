import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabase';
import {
  FileText, Printer, Download, RefreshCw, ChevronDown,
  User, BookOpen, TrendingUp, AlertTriangle, Award, CheckCircle,
  BarChart2, Calendar, Star, Shield
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import logoImg from '../assets/logo.png';

/* ── Design tokens ─────────────────────────────────────────── */
const C = {
  bg: '#FEFCE8', card: '#FFFFFF',
  primary: '#0B6E4F', primaryLight: '#1A6B38',
  gold: '#D4AF37', goldLight: '#F0D060',
  text: '#1E2A22', muted: '#5C6E65',
  red: '#C0392B', green: '#1A7A4A',
  border: '#D5CBBA', borderLight: '#EAE3D5',
  coverBg: '#0D3D1F',
};

const REPORT_TYPES = [
  'Student Performance Report',
  'Weekly Tasmiq Report',
  'Monthly Tasmiq Report',
  'Class Performance Report',
  'Tajwid Error Analysis Report',
  'Full Academic Report',
];

const DATE_RANGES = ['This Week', 'This Month', 'Last Month', 'Custom Range'];

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const TAJWID_RULES = [
  { label: 'Ghunnah', keywords: ['ghunnah'] },
  { label: 'Qalqalah', keywords: ['qalqalah'] },
  { label: 'Mad Asli', keywords: ['madd', 'mad asli', 'madda'] },
  { label: 'Ikhfa', keywords: ['ikhfa'] },
  { label: 'Idgham', keywords: ['idgham'] },
  { label: 'Iqlab', keywords: ['iqlab'] },
  { label: 'Izhar', keywords: ['izhar'] },
];

/* ── Helpers ────────────────────────────────────────────────── */
function avg(arr) {
  if (!arr.length) return 0;
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
}

function getDateBounds(range, customStart, customEnd) {
  const now = new Date();
  if (range === 'This Week') {
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    start.setHours(0, 0, 0, 0);
    return { start, end: now };
  }
  if (range === 'This Month') {
    return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now };
  }
  if (range === 'Last Month') {
    const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const e = new Date(now.getFullYear(), now.getMonth(), 0);
    return { start: s, end: e };
  }
  // Custom
  return {
    start: customStart ? new Date(customStart) : new Date(now.getFullYear(), now.getMonth(), 1),
    end: customEnd ? new Date(customEnd) : now,
  };
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function scoreColor(s) {
  if (s >= 85) return C.green;
  if (s >= 70) return C.gold;
  return C.red;
}

function scoreLabel(s) {
  if (s >= 85) return 'Excellent';
  if (s >= 70) return 'Good';
  if (s >= 60) return 'Satisfactory';
  return 'Needs Revision';
}

/* ════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════════════════════ */
export default function Reports() {
  const { teacher } = useAuth() || {};

  /* ── Config state ── */
  const [reportType, setReportType] = useState(REPORT_TYPES[0]);
  const [scope, setScope] = useState('single');           // single | class
  const [dateRange, setDateRange] = useState('This Month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  /* ── Data ── */
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [allRecitations, setAllRecitations] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedClassId, setSelectedClassId] = useState('');

  /* ── UI state ── */
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [reportReady, setReportReady] = useState(false);

  /* ── Computed report data ── */
  const [reportData, setReportData] = useState(null);
  const [currentTeacher, setCurrentTeacher] = useState('');

  const reportRef = useRef(null);

  /* ── Load master data ── */
  useEffect(() => {
    if (teacher?.id) loadMasterData();
  }, [teacher]);

  const loadMasterData = async () => {
    if (!teacher?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Get logged-in teacher name from auth context / localStorage / DB
      let name = teacher?.full_name || teacher?.display_name || teacher?.email || '';
      if (!name) {
        try {
          const saved = localStorage.getItem('tasmiq_teacher_session');
          if (saved) {
            const parsed = JSON.parse(saved);
            name = parsed?.full_name || parsed?.display_name || parsed?.email || '';
          }
        } catch (err) {}
      }
      if (!name) {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data: profile } = await supabase
              .from('users')
              .select('full_name, display_name, email')
              .eq('id', user.id)
              .maybeSingle();
            name = profile?.full_name || profile?.display_name || user.email || '';
          }
        } catch (err) {}
      }

      if (name) setCurrentTeacher(name);

      // Get teacher's classes
      const { data: myClasses } = await supabase
        .from('classes')
        .select('*')
        .eq('teacher_id', teacher.id);

      const cls = myClasses || [];
      const classIds = cls.map(c => c.id);

      let studs = [];
      if (classIds.length > 0) {
        const { data: members } = await supabase
          .from('class_members')
          .select('student_id')
          .in('class_id', classIds);
        
        const studentIds = [...new Set((members || []).map(m => m.student_id).filter(Boolean))];
        if (studentIds.length > 0) {
          const { data: studentUsers } = await supabase
            .from('users')
            .select('*')
            .in('id', studentIds)
            .order('full_name', { ascending: true });
          studs = studentUsers || [];
        }
      }

      let recs = [];
      if (studs.length > 0) {
        const studentIds = studs.map(s => s.id);
        const { data: recRes } = await supabase
          .from('recitations')
          .select('*')
          .in('user_id', studentIds)
          .order('submitted_at', { ascending: true });
        recs = recRes || [];
      }

      setStudents(studs);
      setClasses(cls);
      setAllRecitations(recs);
      if (studs.length) setSelectedStudentId(studs[0].id || studs[0].uid);
      if (cls.length) setSelectedClassId(cls[0].id);
    } catch (e) {
      console.error('Reports data load error:', e);
    } finally {
      setLoading(false);
    }
  };

  /* ── Generate Report ── */
  const generateReport = async () => {
    setGenerating(true);
    setReportReady(false);

    try {
      const { start, end } = getDateBounds(dateRange, customStart, customEnd);

      // Filter recitations by date
      const filtered = allRecitations.filter(r => {
        const ts = r.submitted_at || (r.submitted_at || r.recorded_at);
        if (!ts) return false;
        const d = new Date(ts);
        return d >= start && d <= end;
      });

      let studentObj = null;
      let studentRecs = [];
      let classRecs = [];
      let classStudents = [];

      if (scope === 'single') {
        studentObj = students.find(s => s.id === selectedStudentId);
        studentRecs = filtered.filter(r => r.user_id === selectedStudentId);
      } else {
        classStudents = students.filter(s => s.class_id === selectedClassId);
        const classStudentIds = new Set(classStudents.map(s => s.id));
        classRecs = filtered.filter(r => classStudentIds.has(r.user_id));
      }

      /* ── Stats ── */
      const recsToAnalyse = scope === 'single' ? studentRecs : classRecs;
      const scores = recsToAnalyse.map(r => r.score).filter(s => s != null);
      const reviewedRecs = recsToAnalyse.filter(r => r.reviewed);
      const pendingRecs = recsToAnalyse.filter(r => !r.reviewed);
      const bestScore = scores.length ? Math.max(...scores) : 0;
      const avgScore = avg(scores);

      /* ── Weekly trend (by day-of-week) ── */
      const dayBuckets = {};
      DAY_NAMES.forEach(d => { dayBuckets[d] = []; });
      recsToAnalyse.forEach(r => {
        const ts = r.submitted_at || (r.submitted_at || r.recorded_at);
        if (ts && r.score != null) {
          const d = DAY_NAMES[new Date(ts).getDay()];
          dayBuckets[d].push(r.score);
        }
      });
      const weeklyTrend = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => ({
        day: d,
        'Avg Score': dayBuckets[d].length ? avg(dayBuckets[d]) : null,
        Sessions: dayBuckets[d].length,
      }));

      /* ── Monthly trend (last 6 months) ── */
      const monthBuckets = {};
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const key = d.toLocaleString('default', { month: 'short' });
        monthBuckets[key] = [];
      }
      allRecitations.forEach(r => {
        const ts = r.submitted_at || (r.submitted_at || r.recorded_at);
        if (ts && r.score != null) {
          const key = new Date(ts).toLocaleString('default', { month: 'short' });
          if (monthBuckets[key] !== undefined) monthBuckets[key].push(r.score);
        }
      });
      const monthlyTrend = Object.entries(monthBuckets).map(([month, s]) => ({
        month,
        'Avg Score': s.length ? avg(s) : null,
        Sessions: s.length,
      }));

      /* ── Tajwid error analysis ── */
      const tajwidCounts = {};
      TAJWID_RULES.forEach(r => { tajwidCounts[r.label] = 0; });

      recsToAnalyse.forEach(r => {
        const searchText = [
          ...(Array.isArray(r.errors) ? r.errors.map(e => `${e.word || ''} ${e.tip || ''}`).join(' ') : ''),
          r.feedback || '',
        ].join(' ').toLowerCase();

        TAJWID_RULES.forEach(rule => {
          if (rule.keywords.some(kw => searchText.includes(kw))) {
            tajwidCounts[rule.label]++;
          }
        });
      });

      const tajwidErrors = TAJWID_RULES
        .map(r => ({
          rule: r.label,
          count: tajwidCounts[r.label],
          severity: tajwidCounts[r.label] >= 5 ? 'High' : tajwidCounts[r.label] >= 2 ? 'Medium' : 'Low',
        }))
        .sort((a, b) => b.count - a.count);

      /* ── Recommendations from tajwid ── */
      const recommendations = tajwidErrors
        .filter(e => e.count > 0)
        .slice(0, 3)
        .map(e => {
          const map = {
            'Ghunnah': 'Practice nasalisation on Noon and Meem with prolonged duration.',
            'Qalqalah': 'Focus on echo/bouncing sound on letters ق ط ب ج د.',
            'Mad Asli': 'Ensure natural elongation of 2 counts on Alif, Waw, Ya.',
            'Ikhfa': 'Practice concealing Noon Saakin/Tanwin before 15 letters.',
            'Idgham': 'Practice merging Noon Saakin into following letter correctly.',
            'Iqlab': 'Practice converting Noon Saakin to Meem before ب.',
            'Izhar': 'Practice clear pronunciation of Noon Saakin before throat letters.',
          };
          return { error: e.rule, tip: map[e.rule] || 'Practice this rule with a qualified Qari.' };
        });

      /* ── Teacher feedback ── */
      const feedbackRecs = scope === 'single'
        ? allRecitations.filter(r => r.user_id === selectedStudentId && r.reviewed && r.feedback)
        : reviewedRecs.filter(r => r.feedback);

      let classRank = null;
      if (scope === 'single' && selectedStudentId) {
        const allStudentAvgs = students.map(s => {
          const sRecs = allRecitations.filter(r => r.user_id === s.id && r.score != null);
          return { id: s.id, avg: sRecs.length ? avg(sRecs.map(r => r.score)) : 0 };
        }).sort((a, b) => b.avg - a.avg);
        const rankIdx = allStudentAvgs.findIndex(s => s.id === selectedStudentId);
        classRank = rankIdx >= 0 ? { rank: rankIdx + 1, total: students.length } : null;
      }

      /* ── Attendance rate (sessions completed / total sessions) ── */
      const attendanceRate = recsToAnalyse.length > 0
        ? Math.round((reviewedRecs.length / recsToAnalyse.length) * 100)
        : 0;

      const activeTeacher = currentTeacher || teacher?.full_name || teacher?.display_name || teacher?.email || 'Teacher';

      setReportData({
        type: reportType,
        scope,
        period: { start, end, label: dateRange },
        student: studentObj,
        classObj: classes.find(c => c.id === selectedClassId),
        classStudents,
        stats: {
          avgScore, bestScore,
          totalRecs: recsToAnalyse.length,
          reviewedCount: reviewedRecs.length,
          pendingCount: pendingRecs.length,
          attendanceRate,
        },
        recitations: recsToAnalyse.slice(0, 20), // max 20 rows in table
        weeklyTrend,
        monthlyTrend,
        tajwidErrors,
        recommendations,
        feedbackRecs: feedbackRecs.slice(0, 5),
        classRank,
        teacherName: activeTeacher,
        generatedAt: new Date(),
      });

        setReportReady(true);
      } catch (e) {
        console.error('Report generation error:', e);
        alert('Failed to generate report. Please try again.');
      } finally {
        setGenerating(false);
      }
    };

    const handlePrint = async () => {
      if (!reportData) return;
      setGenerating(true);
      try {
        const activeTeacher = reportData.teacherName || currentTeacher || teacher?.full_name || teacher?.display_name || teacher?.email || 'Teacher';
        const { generateReport: genPDF } = await import('../services/pdfGenerator');
        const pdf = await genPDF({
          ...reportData,
          teacherName: activeTeacher,
        });
        const filename = `TasmiqAI_${(reportData.type || 'Report').replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}.pdf`;
        pdf.save(filename);
    } catch (err) {
      console.error('PDF error:', err);
      alert('PDF generation failed: ' + err.message);
    } finally {
      setGenerating(false);
    }
  };

  /* ════════════════════════════════════════════════════════════ */
  /* RENDER                                                        */
  /* ════════════════════════════════════════════════════════════ */
  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', paddingBottom: '60px' }}>

      {/* ── Page Header ── */}
      <div className="no-print" style={{ marginBottom: '32px' }}>
        <p style={{ fontSize: '12px', fontWeight: '800', color: C.primary, textTransform: 'uppercase', letterSpacing: '1.5px', margin: '0 0 6px' }}>
          Reporting Suite
        </p>
        <h1 style={{ fontSize: '32px', fontWeight: '900', color: C.text, margin: '0 0 6px' }}>
          Academic Report Generator
        </h1>
        <p style={{ fontSize: '15px', color: C.muted, margin: 0 }}>
          Generate professional academic documents for students, parents, and school administration.
        </p>
      </div>

      {/* ── Two-column layout ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '28px', alignItems: 'start' }}>

        {/* ════════ LEFT: CONFIG PANEL ════════ */}
        <div className="no-print report-config-panel" style={{
          backgroundColor: C.card, borderRadius: '20px', padding: '24px',
          border: `1px solid ${C.borderLight}`, boxShadow: '0 4px 16px rgba(0,0,0,0.05)',
          position: 'sticky', top: '24px'
        }}>
          <h3 style={{ fontSize: '15px', fontWeight: '900', color: C.primary, margin: '0 0 20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={16} /> Report Configuration
          </h3>

          <Field label="REPORT TYPE">
            <Select value={reportType} onChange={setReportType} options={REPORT_TYPES} />
          </Field>

          <Field label="SCOPE">
            <div style={{ display: 'flex', gap: '8px' }}>
              <ToggleBtn active={scope === 'single'} onClick={() => setScope('single')}>Single Student</ToggleBtn>
              <ToggleBtn active={scope === 'class'} onClick={() => setScope('class')}>Full Class</ToggleBtn>
            </div>
          </Field>

          {scope === 'single' && (
            <Field label="SELECT STUDENT">
              <Select
                value={selectedStudentId}
                onChange={setSelectedStudentId}
                options={students.map(s => ({ value: s.id, label: s.full_name || s.display_name || s.email }))}
                isObject
              />
            </Field>
          )}

          <Field label="CLASS">
            <Select
              value={selectedClassId}
              onChange={setSelectedClassId}
              options={classes.length
                ? classes.map(c => ({ value: c.id, label: c.name }))
                : [{ value: '', label: 'No classes found' }]}
              isObject
            />
          </Field>

          <Field label="DATE RANGE">
            <Select value={dateRange} onChange={setDateRange} options={DATE_RANGES} />
          </Field>

          {dateRange === 'Custom Range' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
              <div>
                <label style={{ fontSize: '10px', fontWeight: '700', color: C.muted, display: 'block', marginBottom: '4px' }}>FROM</label>
                <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
                  style={{ width: '100%', padding: '8px', borderRadius: '8px', border: `1px solid ${C.border}`, fontSize: '12px' }} />
              </div>
              <div>
                <label style={{ fontSize: '10px', fontWeight: '700', color: C.muted, display: 'block', marginBottom: '4px' }}>TO</label>
                <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
                  style={{ width: '100%', padding: '8px', borderRadius: '8px', border: `1px solid ${C.border}`, fontSize: '12px' }} />
              </div>
            </div>
          )}

          <button
            onClick={generateReport}
            disabled={generating || loading}
            style={{
              width: '100%', padding: '13px', borderRadius: '14px', border: 'none',
              backgroundColor: C.primary, color: 'white', fontWeight: '800', fontSize: '14px',
              cursor: generating ? 'not-allowed' : 'pointer', opacity: generating ? 0.7 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              boxShadow: `0 4px 14px ${C.primary}40`, marginBottom: '10px'
            }}
          >
            {generating ? <><RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> Generating...</>
              : <><BarChart2 size={16} /> Generate Report</>}
          </button>

          {reportReady && (
            <button
              onClick={handlePrint}
              disabled={generating}
              style={{
                width: '100%', padding: '12px', borderRadius: '14px',
                border: `1px solid ${C.border}`, backgroundColor: 'white',
                color: C.primary, fontWeight: '800', fontSize: '14px',
                cursor: generating ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                opacity: generating ? 0.7 : 1,
              }}
            >
              <Printer size={16} /> {generating ? 'Generating PDF...' : '⬇ Download PDF (A4)'}
            </button>
          )}
        </div>

        {/* ════════ RIGHT: REPORT DOCUMENT ════════ */}
        <div>
          {!reportReady ? (
            <div style={{
              backgroundColor: C.card, borderRadius: '20px', border: `1px solid ${C.borderLight}`,
              padding: '80px 40px', textAlign: 'center',
              boxShadow: '0 4px 16px rgba(0,0,0,0.04)'
            }}>
              <FileText size={56} color={C.borderLight} style={{ margin: '0 auto 20px', display: 'block' }} />
              <h2 style={{ fontSize: '22px', fontWeight: '900', color: C.text, margin: '0 0 10px' }}>
                Configure &amp; Generate Your Report
              </h2>
              <p style={{ color: C.muted, fontSize: '15px', margin: 0 }}>
                Select your report type, scope, and date range from the panel on the left, then click Generate Report.
              </p>
            </div>
          ) : (
            <ReportDocument data={reportData} ref={reportRef} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   REPORT DOCUMENT
   ════════════════════════════════════════════════════════════ */
const ReportDocument = React.forwardRef(({ data }, ref) => {
  const { type, scope, period, student, classObj, classStudents,
    stats, recitations, weeklyTrend, monthlyTrend,
    tajwidErrors, recommendations, feedbackRecs, classRank, generatedAt } = data;

  const reportTitle = type.toUpperCase();
  const subjectName = scope === 'single' ? (student?.full_name || student?.display_name) : classObj?.name;
  const periodLabel = `${formatDate(period.start)} – ${formatDate(period.end)}`;

  // Determine true overall performance — must reflect teacher REPEAT or AI fail
  const hasTeacherRepeat = recitations.some(r => r.status === 'repeat');
  const aiAvgFail = stats.avgScore < 70;
  const overallPerfLabel = (hasTeacherRepeat || aiAvgFail)
    ? 'Needs Revision'
    : scoreLabel(stats.avgScore);
  const overallPerfColor = (hasTeacherRepeat || aiAvgFail)
    ? C.red
    : scoreColor(stats.avgScore);

  return (
    <div
      ref={ref}
      className="report-document"
      style={{
        backgroundColor: 'white', borderRadius: '20px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
        border: `1px solid ${C.borderLight}`, overflow: 'hidden',
        fontFamily: '"Inter", sans-serif',
      }}
    >

      {/* ══════════════════════════════════════
          COVER PAGE
          ══════════════════════════════════════ */}
      <div className="report-cover" style={{
        background: `linear-gradient(160deg, ${C.coverBg} 0%, #0A2A12 60%, #14532D 100%)`,
        padding: '60px 64px', display: 'flex', flexDirection: 'column',
        minHeight: '420px', position: 'relative', overflow: 'hidden',
      }}>

        {/* Background decoration */}
        <div style={{
          position: 'absolute', top: '-60px', right: '-60px',
          width: '280px', height: '280px', borderRadius: '50%',
          border: `1px solid rgba(212,175,55,0.15)`, pointerEvents: 'none'
        }} />
        <div style={{
          position: 'absolute', top: '-20px', right: '-20px',
          width: '180px', height: '180px', borderRadius: '50%',
          border: `1px solid rgba(212,175,55,0.1)`, pointerEvents: 'none'
        }} />

        {/* Logo + Name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '48px' }}>
          <div style={{
            width: '56px', height: '56px', borderRadius: '14px',
            backgroundColor: 'rgba(255,255,255,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid rgba(255,255,255,0.2)'
          }}>
            <img src={logoImg} alt="TasmiqAI" style={{ width: '80%', height: '80%', objectFit: 'contain' }} />
          </div>
          <div>
            <div style={{ fontSize: '18px', fontWeight: '900', color: 'white', letterSpacing: '0.5px' }}>TasmiqAI</div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', fontWeight: '500', letterSpacing: '0.3px' }}>
              AI-Based Quran Recitation Monitoring System
            </div>
          </div>
        </div>

        {/* Gold divider */}
        <div style={{ width: '48px', height: '3px', backgroundColor: C.gold, marginBottom: '24px', borderRadius: '2px' }} />

        {/* Report Title */}
        <h1 style={{
          fontSize: '28px', fontWeight: '900', color: 'white',
          margin: '0 0 8px', letterSpacing: '1px', lineHeight: '1.2'
        }}>
          {reportTitle}
        </h1>
        <p style={{ fontSize: '14px', color: C.gold, fontWeight: '700', margin: '0 0 40px', letterSpacing: '2px', textTransform: 'uppercase' }}>
          Academic Assessment Document
        </p>

        {/* Cover info table */}
        <div style={{
          backgroundColor: 'rgba(255,255,255,0.07)',
          borderRadius: '14px', padding: '24px 28px',
          border: '1px solid rgba(255,255,255,0.1)',
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 40px',
          marginTop: 'auto'
        }}>
          {scope === 'single' && student && <>
            <CoverField label="Student Name" value={student.full_name || student.display_name || '—'} />
            <CoverField label="Student ID" value={(student.id || '').slice(0, 12).toUpperCase()} />
          </>}
          <CoverField label={scope === 'single' ? 'Class' : 'Class Name'} value={classObj?.name || '—'} />
          <CoverField label="Report Period" value={periodLabel} />
          <CoverField label="Report Type" value={type} />
          <CoverField label="Generated On" value={formatDate(generatedAt)} />
        </div>

        {/* Decorative bottom bar */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: '4px',
          background: `linear-gradient(90deg, ${C.gold}, ${C.goldLight}, ${C.gold})`
        }} />
      </div>

      {/* ══════════════════════════════════════
          DOCUMENT BODY
          ══════════════════════════════════════ */}
      <div style={{ padding: '48px 64px' }}>

        {/* ── SECTION: Executive Summary ── */}
        <ReportSection title="Executive Summary" icon={<Shield size={16} />} number="1">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '20px' }}>
            <SummaryCard label="Overall Avg Score" value={`${stats.avgScore}%`} color={scoreColor(stats.avgScore)} />
            <SummaryCard label="Best Score" value={`${stats.bestScore}%`} color={C.primary} />
            <SummaryCard label="Total Recitations" value={stats.totalRecs} color={C.text} />
            <SummaryCard label="Completed Reviews" value={stats.reviewedCount} color={C.green} />
            <SummaryCard label="Pending Reviews" value={stats.pendingCount} color={stats.pendingCount > 0 ? C.gold : C.green} />
            <SummaryCard label="Review Rate" value={`${stats.attendanceRate}%`} color={C.primary} />
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <tbody>
              <SummaryRow label="Report Subject" value={subjectName || '—'} />
              <SummaryRow label="Performance Status" value={overallPerfLabel} highlight={overallPerfColor} />
              {classRank && <SummaryRow label="Class Rank" value={`#${classRank.rank} of ${classRank.total} students`} />}
              <SummaryRow label="Report Period" value={periodLabel} />
              {scope === 'single' && student && <SummaryRow label="Student Email" value={student.email || '—'} />}
            </tbody>
          </table>
        </ReportSection>

        {/* ── SECTION: Recitation Records ── */}
        <ReportSection title="Recitation Records" icon={<BookOpen size={16} />} number="2">
          {recitations.length === 0 ? (
            <EmptyMsg>No recitation records found for the selected period.</EmptyMsg>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
              <thead>
                <tr style={{ backgroundColor: C.primary }}>
                  {['#', 'Date', 'Surah', 'Ayah', 'Score', 'Status', 'Reviewed'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: 'white', fontWeight: '700', fontSize: '11px', letterSpacing: '0.5px' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recitations.map((r, i) => (
                  <tr key={r.id} style={{ backgroundColor: i % 2 === 0 ? '#FAFAF8' : 'white', borderBottom: `1px solid ${C.borderLight}` }}>
                    <td style={{ padding: '9px 12px', color: C.muted, fontSize: '11px' }}>{i + 1}</td>
                    <td style={{ padding: '9px 12px', color: C.text }}>
                      {formatDate(r.submitted_at || r.recorded_at)}
                    </td>
                    <td style={{ padding: '9px 12px', fontWeight: '700', color: C.text }}>
                      {r.surah || `Surah ${r.surah_number}` || '—'}
                    </td>
                    <td style={{ padding: '9px 12px', color: C.muted }}>
                      {r.ayah || `${r.start_verse}–${r.end_verse}` || '—'}
                    </td>
                    <td style={{ padding: '9px 12px', fontWeight: '800', color: scoreColor(r.score) }}>{r.score != null ? `${r.score}%` : '—'}</td>
                    <td style={{ padding: '9px 12px', fontWeight: '700', color: scoreColor(r.score) }}>{scoreLabel(r.score)}</td>
                    <td style={{ padding: '9px 12px' }}>
                      <span style={{
                        padding: '3px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: '800',
                        backgroundColor: r.reviewed ? '#D1FAE5' : '#FEF3C7',
                        color: r.reviewed ? C.green : '#92400E'
                      }}>
                        {r.reviewed ? '✓ Done' : 'Pending'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </ReportSection>

        {/* ── SECTION: Performance Analytics ── */}
        <ReportSection title="Performance Analytics" icon={<TrendingUp size={16} />} number="3">

          {/* Weekly Trend */}
          <div style={{ marginBottom: '28px' }}>
            <ChartTitle>Weekly Recitation Trend — Average Score by Day</ChartTitle>
            {weeklyTrend.every(d => d['Avg Score'] == null) ? (
              <EmptyMsg>No data available for weekly trend chart.</EmptyMsg>
            ) : (
              <div className="report-chart" style={{ height: '200px', width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={weeklyTrend} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F0EBE0" />
                    <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: C.muted, fontSize: 11 }} />
                    <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: C.muted, fontSize: 11 }} unit="%" />
                    <Tooltip formatter={(v, n) => [v != null ? `${v}%` : '—', n]} />
                    <Line type="monotone" dataKey="Avg Score" stroke={C.primary} strokeWidth={2.5}
                      dot={{ r: 4, fill: C.primary, strokeWidth: 2 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Monthly Trend */}
          <div>
            <ChartTitle>Monthly Performance Trend — Last 6 Months</ChartTitle>
            {monthlyTrend.every(d => d['Avg Score'] == null) ? (
              <EmptyMsg>No historical data for monthly trend.</EmptyMsg>
            ) : (
              <div className="report-chart" style={{ height: '200px', width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyTrend} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F0EBE0" />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: C.muted, fontSize: 11 }} />
                    <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: C.muted, fontSize: 11 }} unit="%" />
                    <Tooltip formatter={(v, n) => [v != null ? `${v}%` : '—', n]} />
                    <Bar dataKey="Avg Score" fill={C.primary} radius={[4, 4, 0, 0]} barSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </ReportSection>

        {/* ── SECTION: Tajwid Error Analysis ── */}
        <ReportSection title="Tajwid Error Analysis" icon={<AlertTriangle size={16} />} number="4">
          {tajwidErrors.every(e => e.count === 0) ? (
            <EmptyMsg>No Tajwid error data found. Errors are detected from AI tips and teacher feedback.</EmptyMsg>
          ) : (
            <>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', marginBottom: '24px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#F9F7F2', borderBottom: `2px solid ${C.border}` }}>
                    {['Tajwid Rule', 'Occurrences', 'Severity', 'Priority'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: C.muted, fontWeight: '800', fontSize: '11px', letterSpacing: '0.5px' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tajwidErrors.map((e, i) => (
                    <tr key={e.rule} style={{ borderBottom: `1px solid ${C.borderLight}`, backgroundColor: i % 2 === 0 ? 'white' : '#FAFAF8' }}>
                      <td style={{ padding: '10px 14px', fontWeight: '700', color: C.text }}>{e.rule}</td>
                      <td style={{ padding: '10px 14px', color: C.text }}>{e.count} {e.count === 1 ? 'occurrence' : 'occurrences'}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{
                          padding: '3px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '800',
                          backgroundColor: e.severity === 'High' ? '#FEE2E2' : e.severity === 'Medium' ? '#FEF3C7' : '#D1FAE5',
                          color: e.severity === 'High' ? C.red : e.severity === 'Medium' ? '#92400E' : C.green,
                        }}>
                          {e.severity}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', color: C.muted, fontSize: '12px' }}>
                        {e.severity === 'High' ? 'Immediate attention required' :
                          e.severity === 'Medium' ? 'Revisit and practice' : 'Minor — monitor'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {recommendations.length > 0 && (
                <div style={{ backgroundColor: '#F4F9F5', borderRadius: '12px', padding: '20px', border: `1px solid ${C.primary}20` }}>
                  <div style={{ fontSize: '12px', fontWeight: '800', color: C.primary, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>
                    AI Recommendations
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {recommendations.map((r, i) => (
                      <div key={i} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                        <span style={{ fontWeight: '900', color: C.gold, fontSize: '16px', lineHeight: '1.3' }}>•</span>
                        <div>
                          <span style={{ fontWeight: '800', color: C.primary, fontSize: '13px' }}>{r.error}: </span>
                          <span style={{ color: C.muted, fontSize: '13px' }}>{r.tip}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </ReportSection>

        {/* ── SECTION: Teacher Remarks ── */}
        <ReportSection title="Teacher Remarks &amp; Feedback" icon={<CheckCircle size={16} />} number="5">
          {feedbackRecs.length === 0 ? (
            <EmptyMsg>No teacher feedback recorded for the selected period.</EmptyMsg>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {feedbackRecs.map((r, i) => (
                <div key={r.id || i} style={{
                  borderLeft: `4px solid ${C.primary}`, paddingLeft: '16px', paddingTop: '4px', paddingBottom: '4px',
                  backgroundColor: '#FAFAF7', borderRadius: '0 10px 10px 0', padding: '12px 16px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontWeight: '800', fontSize: '13px', color: C.text }}>
                      {r.surah} — Ayah {r.ayah}
                    </span>
                    <span style={{ fontSize: '11px', color: C.muted }}>{formatDate(r.reviewed_at || (r.submitted_at || r.recorded_at))}</span>
                  </div>
                  {(r.teacher_grade || r.teacherGrade) > 0 && (
                    <div style={{ fontSize: '11px', color: C.gold, fontWeight: '700', marginBottom: '4px' }}>
                      {'⭐'.repeat(r.teacher_grade || r.teacherGrade)} Grade: {r.teacher_grade || r.teacherGrade}/5
                    </div>
                  )}
                  <p style={{ fontSize: '13px', color: C.muted, margin: 0, fontStyle: 'italic', lineHeight: '1.6' }}>
                    "{r.feedback}"
                  </p>
                </div>
              ))}
            </div>
          )}
        </ReportSection>

        {/* ── SECTION: Achievements ── */}
        <ReportSection title="Achievements &amp; Milestones" icon={<Award size={16} />} number="6">
          <div className="achievement-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
            <AchievementCard
              icon="🏆"
              title="Best Score Achieved"
              value={stats.bestScore > 0 ? `${stats.bestScore}%` : 'N/A'}
              color={C.gold}
            />
            <AchievementCard
              icon="📖"
              title="Total Sessions"
              value={`${stats.totalRecs} Recitations`}
              color={C.primary}
            />
            <AchievementCard
              icon="✅"
              title="Reviewed Sessions"
              value={`${stats.reviewedCount} Completed`}
              color={C.green}
            />
            <AchievementCard
              icon="📊"
              title="Overall Performance"
              value={overallPerfLabel}
              color={overallPerfColor}
            />
            {classRank && (
              <AchievementCard
                icon="🥇"
                title="Class Ranking"
                value={`Rank #${classRank.rank} / ${classRank.total}`}
                color={C.primary}
              />
            )}
            <AchievementCard
              icon="📅"
              title="Report Period"
              value={periodLabel}
              color={C.muted}
            />
          </div>
        </ReportSection>

        {/* ── Signature Block ── */}
        <div className="report-section" style={{
          marginTop: '48px', paddingTop: '32px',
          borderTop: `2px solid ${C.borderLight}`,
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '32px'
        }}>
          <SignatureBlock title="Prepared By" name={data.teacherName || 'Teacher'} role="Quran Instructor" />
          <SignatureBlock title="Class Teacher" name="________________" role="Quran Instructor" />
          <SignatureBlock title="Verified By" name="________________" role="Tahfiz Coordinator" />
        </div>

        {/* ── Document Footer ── */}
        <div style={{
          marginTop: '32px', padding: '16px 0',
          borderTop: `1px solid ${C.borderLight}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontSize: '10px', color: C.muted
        }}>
          <span>TasmiqAI Academic Platform © {new Date().getFullYear()} — AI-Based Quran Recitation Monitoring System</span>
          <span>Generated: {generatedAt?.toLocaleString()}</span>
        </div>

      </div>
    </div>
  );
});

/* ════════════════════════════════════════════════════════════
   SUB-COMPONENTS
   ════════════════════════════════════════════════════════════ */

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <label style={{ fontSize: '10px', fontWeight: '800', color: C.muted, display: 'block', marginBottom: '6px', letterSpacing: '0.8px', textTransform: 'uppercase' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Select({ value, onChange, options, isObject = false }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        width: '100%', padding: '10px 12px', borderRadius: '10px',
        border: `1px solid ${C.border}`, backgroundColor: '#FAFAF8',
        fontSize: '13px', fontWeight: '600', color: C.text,
        outline: 'none', cursor: 'pointer', appearance: 'none'
      }}
    >
      {options.map(opt => {
        const val = isObject ? opt.value : opt;
        const label = isObject ? opt.label : opt;
        return <option key={val} value={val}>{label}</option>;
      })}
    </select>
  );
}

function ToggleBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: '9px 12px', borderRadius: '10px', border: 'none',
        backgroundColor: active ? C.primary : '#F0EDE5',
        color: active ? 'white' : C.muted,
        fontWeight: '700', fontSize: '12px', cursor: 'pointer',
        transition: 'all 0.2s'
      }}
    >
      {children}
    </button>
  );
}

function ReportSection({ title, icon, number, children }) {
  return (
    <div className="report-section" style={{ marginBottom: '36px' }}>
      {/* Section Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        marginBottom: '16px', paddingBottom: '10px',
        borderBottom: `2px solid ${C.border}`
      }}>
        <div style={{
          width: '26px', height: '26px', borderRadius: '7px',
          backgroundColor: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0
        }}>
          <span style={{ fontSize: '10px', fontWeight: '900', color: 'white' }}>{number}</span>
        </div>
        <div style={{ color: C.primary, flexShrink: 0 }}>{icon}</div>
        <h2 style={{ fontSize: '15px', fontWeight: '900', color: C.text, margin: 0, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
          {title}
        </h2>
      </div>
      {children}
    </div>
  );
}

function SummaryCard({ label, value, color }) {
  return (
    <div style={{
      border: `1px solid ${C.borderLight}`, borderRadius: '12px',
      padding: '14px 16px', backgroundColor: '#FAFAF8'
    }}>
      <div style={{ fontSize: '10px', fontWeight: '800', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
        {label}
      </div>
      <div style={{ fontSize: '22px', fontWeight: '900', color: color || C.text }}>
        {value}
      </div>
    </div>
  );
}

function SummaryRow({ label, value, highlight }) {
  return (
    <tr style={{ borderBottom: `1px solid ${C.borderLight}` }}>
      <td style={{ padding: '9px 14px', fontWeight: '700', color: C.muted, fontSize: '13px', width: '200px' }}>{label}</td>
      <td style={{ padding: '9px 14px', fontWeight: '800', color: highlight || C.text, fontSize: '13px' }}>{value}</td>
    </tr>
  );
}

function ChartTitle({ children }) {
  return (
    <div style={{ fontSize: '12px', fontWeight: '800', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '14px' }}>
      {children}
    </div>
  );
}

function AchievementCard({ icon, title, value, color }) {
  return (
    <div style={{
      display: 'flex', gap: '14px', alignItems: 'center',
      border: `1px solid ${C.borderLight}`, borderRadius: '12px',
      padding: '14px 16px', backgroundColor: '#FAFAF8'
    }}>
      <div style={{
        width: '40px', height: '40px', borderRadius: '10px',
        backgroundColor: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '20px', flexShrink: 0
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: '11px', color: C.muted, fontWeight: '700', marginBottom: '3px' }}>{title}</div>
        <div style={{ fontSize: '15px', fontWeight: '900', color: color }}>{value}</div>
      </div>
    </div>
  );
}

function CoverField({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '4px' }}>
        {label}
      </div>
      <div style={{ fontSize: '14px', fontWeight: '800', color: 'white' }}>{value}</div>
    </div>
  );
}

function SignatureBlock({ title, name, role }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '10px', fontWeight: '800', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '32px' }}>
        {title}
      </div>
      <div style={{ borderTop: `1px solid ${C.text}`, paddingTop: '8px' }}>
        <div style={{ fontSize: '13px', fontWeight: '800', color: C.text }}>{name}</div>
        <div style={{ fontSize: '11px', color: C.muted, marginTop: '2px' }}>{role}</div>
      </div>
    </div>
  );
}

function EmptyMsg({ children }) {
  return (
    <div style={{
      padding: '24px', textAlign: 'center', color: C.muted,
      backgroundColor: '#FAFAF8', borderRadius: '10px',
      border: `1px dashed ${C.border}`, fontSize: '13px', fontStyle: 'italic'
    }}>
      {children}
    </div>
  );
}






