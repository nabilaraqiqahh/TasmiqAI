import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell, LineChart, Line
} from 'recharts';
import { TrendingUp, BarChart3, AlertTriangle, CheckCircle, Percent, RefreshCw } from 'lucide-react';

const C = {
  bg: '#FEFCE8',
  card: '#FFFFFF',
  primary: '#0B6E4F',
  gold: '#D4AF37',
  lilac: '#9B8EC4',
  text: '#1E2A22',
  muted: '#5C6E65',
  red: '#E05252',
  green: '#0B6E4F',
  border: '#EAE3D5',
};

const COLORS = [C.green, C.primary, C.gold, C.red, C.lilac];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Arabic letters commonly tracked by the AI
const ARABIC_LETTERS = ['ق', 'ض', 'ع', 'غ', 'خ', 'ط', 'ح', 'ث', 'ذ', 'ظ', 'ص'];

// Known Tajwid rule keywords to search for in feedback/errors
const TAJWID_RULES = [
  { label: 'Ghunnah', keywords: ['ghunnah', 'غنه', 'غُنَّة'] },
  { label: 'Qalqalah', keywords: ['qalqalah', 'قلقلة'] },
  { label: 'Madd', keywords: ['madd', 'مد', 'madda'] },
  { label: 'Ikhfa', keywords: ['ikhfa', 'إخفاء', 'ikhfaa'] },
  { label: 'Idgham', keywords: ['idgham', 'إدغام', 'idghaam'] },
  { label: 'Iqlab', keywords: ['iqlab', 'إقلاب'] },
  { label: 'Izhar', keywords: ['izhar', 'إظهار', 'iz-har'] },
];

export default function Analytics() {
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const [stats, setStats] = useState({
    avgAccuracy: 0,
    totalSessions: 0,
    strugglingCount: 0,
    excellentCount: 0,
  });

  const [weeklyData, setWeeklyData] = useState([]);
  const [distributionData, setDistributionData] = useState([]);
  const [makhrajData, setMakhrajData] = useState([]);
  const [tajwidData, setTajwidData] = useState([]);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      // Fetch all recitations and students in parallel
      const [recsResult, studentsResult] = await Promise.all([
        supabase.from('recitations').select('*').order('submitted_at', { ascending: true }),
        supabase.from('users').select('*').eq('role', 'student'),
      ]);

      const recs = recsResult.data || [];
      const students = studentsResult.data || [];

      // ── 1. STAT CARDS ───────────────────────────────────────────────
      const reviewedRecs = recs.filter(r => r.reviewed && r.score != null);
      const avgAccuracy = reviewedRecs.length > 0
        ? Math.round(reviewedRecs.reduce((sum, r) => sum + (r.score || 0), 0) / reviewedRecs.length)
        : 0;

      // Count student score buckets using actual recitation averages per student
      const studentScoreMap = {};
      recs.forEach(r => {
        const sid = r.user_id;   // actual column name
        if (sid && r.score != null) {
          if (!studentScoreMap[sid]) studentScoreMap[sid] = [];
          studentScoreMap[sid].push(r.score);
        }
      });

      let strugglingCount = 0;
      let excellentCount = 0;
      let goodCount = 0;
      let satisfactoryCount = 0;

      // Use students table avg_score if present, else compute from recitations
      const allStudentIds = new Set([
        ...students.map(s => s.id),
        ...Object.keys(studentScoreMap),
      ]);

      allStudentIds.forEach(uid => {
        const studentRow = students.find(s => s.id === uid);
        let avg = studentRow?.avg_score;

        // If no avg_score in DB, compute from their recitations
        if (avg == null && studentScoreMap[uid]) {
          const scores = studentScoreMap[uid];
          avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        }

        if (avg == null) return;

        if (avg >= 90) excellentCount++;
        else if (avg >= 80) goodCount++;
        else if (avg >= 70) satisfactoryCount++;
        else strugglingCount++;
      });

      setStats({ avgAccuracy, totalSessions: recs.length, strugglingCount, excellentCount });

      // ── 2. CHART 1: Weekly Recitation Trend ─────────────────────────
      // Group all recitations by day-of-week, compute avg score per day
      const dayBuckets = { Sun: [], Mon: [], Tue: [], Wed: [], Thu: [], Fri: [], Sat: [] };

      recs.forEach(r => {
        const ts = r.submitted_at || r.recorded_at;
        if (!ts || r.score == null) return;
        const day = DAY_NAMES[new Date(ts).getDay()];
        dayBuckets[day].push(r.score);
      });

      const orderedDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const weekly = orderedDays.map(day => {
        const scores = dayBuckets[day];
        const avg = scores.length > 0
          ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
          : null;
        return {
          day,
          'Avg Score': avg,
          'Sessions': scores.length,
        };
      });
      setWeeklyData(weekly);

      // ── 3. CHART 2: Student Progress Distribution ────────────────────
      setDistributionData([
        { name: 'Excellent (≥90%)', value: excellentCount || 0 },
        { name: 'Good (80–89%)', value: goodCount || 0 },
        { name: 'Satisfactory (70–79%)', value: satisfactoryCount || 0 },
        { name: 'Needs Revision (<70%)', value: strugglingCount || 0 },
      ].filter(d => d.value > 0));

      // ── 4. CHART 3: Makhraj Errors by Arabic Letter ──────────────────
      const letterCounts = {};
      ARABIC_LETTERS.forEach(l => { letterCounts[l] = 0; });

      recs.forEach(r => {
        // Handle both formats: array of {word, tip} or object {tajwid, makhraj}
        if (Array.isArray(r.errors)) {
          r.errors.forEach(e => {
            const word = e.word || e.letter || '';
            ARABIC_LETTERS.forEach(letter => {
              if (word.includes(letter)) letterCounts[letter]++;
            });
            // Also check tip text for letter references
            const tip = e.tip || '';
            ARABIC_LETTERS.forEach(letter => {
              if (tip.includes(letter)) letterCounts[letter]++;
            });
          });
        }
        // If errors is object {tajwid, makhraj} - counts are not per-letter, skip for this chart
      });

      const makhraj = ARABIC_LETTERS
        .map(letter => ({ letter, Errors: letterCounts[letter] }))
        .filter(d => d.Errors > 0)
        .sort((a, b) => b.Errors - a.Errors)
        .slice(0, 8);

      setMakhrajData(makhraj);

      // ── 5. CHART 4: Tajwid Rule Error Frequency ──────────────────────
      const tajwidCounts = {};
      TAJWID_RULES.forEach(r => { tajwidCounts[r.label] = 0; });

      recs.forEach(r => {
        // Check errors array
        if (Array.isArray(r.errors)) {
          r.errors.forEach(e => {
            const tipText = (e.tip || e.word || '').toLowerCase();
            TAJWID_RULES.forEach(rule => {
              if (rule.keywords.some(kw => tipText.includes(kw.toLowerCase()))) {
                tajwidCounts[rule.label]++;
              }
            });
          });
        }

        // Also check teacher feedback text (it often mentions tajwid rules)
        const feedbackText = (r.feedback || '').toLowerCase();
        TAJWID_RULES.forEach(rule => {
          if (rule.keywords.some(kw => feedbackText.includes(kw.toLowerCase()))) {
            tajwidCounts[rule.label]++;
          }
        });
      });

      const tajwid = TAJWID_RULES
        .map(rule => ({ rule: rule.label, Count: tajwidCounts[rule.label] }))
        .filter(d => d.Count > 0)
        .sort((a, b) => b.Count - a.Count);

      setTajwidData(tajwid);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Analytics load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ backgroundColor: 'white', border: `1px solid ${C.border}`, borderRadius: '10px', padding: '10px 14px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: '13px' }}>
        <div style={{ fontWeight: '800', color: C.text, marginBottom: '4px' }}>{label}</div>
        {payload.map((p, i) => (
          <div key={i} style={{ color: p.color, fontWeight: '700' }}>
            {p.name}: {p.value}{p.name === 'Avg Score' ? '%' : ''}
          </div>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{
          width: '48px', height: '48px', borderRadius: '50%',
          border: `4px solid ${C.primary}22`,
          borderTop: `4px solid ${C.primary}`,
          animation: 'spin 1s linear infinite'
        }} />
      </div>
    );
  }

  const noMakhraj = makhrajData.length === 0;
  const noTajwid = tajwidData.length === 0;
  const noWeekly = weeklyData.every(d => d['Avg Score'] == null);
  const noDistrib = distributionData.length === 0;

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>

      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
        <div>
          <p style={{ fontSize: '12px', fontWeight: '800', color: C.primary, textTransform: 'uppercase', letterSpacing: '1.5px', margin: '0 0 6px 0' }}>
            Academic Module
          </p>
          <h1 style={{ fontSize: '32px', fontWeight: '900', color: C.text, margin: '0 0 6px 0' }}>
            Analytics Deep Dive
          </h1>
          <p style={{ fontSize: '15px', color: C.muted, margin: 0 }}>
            Live metrics from Supabase — recitation scores, phonetic errors &amp; Tajwid trends.
          </p>
        </div>
        <button
          onClick={loadAll}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            backgroundColor: C.card, border: `1px solid ${C.border}`,
            borderRadius: '12px', padding: '10px 16px',
            fontSize: '13px', fontWeight: '700', color: C.primary,
            cursor: 'pointer', transition: 'all 0.2s'
          }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F0F9F4'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = C.card}
        >
          <RefreshCw size={15} /> Refresh Data
        </button>
      </div>

      {lastUpdated && (
        <p style={{ fontSize: '11px', color: C.muted, marginBottom: '24px', marginTop: '-16px' }}>
          Last updated: {lastUpdated.toLocaleTimeString()}
        </p>
      )}

      {/* STAT CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '32px' }}>
        {[
          { label: 'Avg Accuracy', value: `${stats.avgAccuracy}%`, sub: 'From reviewed recitations', icon: <Percent size={16} color={C.gold} />, accent: C.primary },
          { label: 'Total Recitations', value: stats.totalSessions, sub: 'All recordings in DB', icon: <BarChart3 size={16} color={C.gold} />, accent: C.primary },
          { label: 'Struggling Students', value: stats.strugglingCount, sub: 'Avg score below 70%', icon: <AlertTriangle size={16} color={C.red} />, accent: C.red },
          { label: 'Excellent Progress', value: stats.excellentCount, sub: 'Avg score above 90%', icon: <CheckCircle size={16} color={C.green} />, accent: C.green },
        ].map((card, i) => (
          <div key={i} style={{
            backgroundColor: C.card, borderRadius: '18px', padding: '20px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.04)',
            borderTop: `4px solid ${card.accent}`,
            border: `1px solid ${C.border}`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '11px', fontWeight: '800', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{card.label}</span>
              {card.icon}
            </div>
            <div style={{ fontSize: '30px', fontWeight: '900', color: C.text, lineHeight: 1 }}>{card.value}</div>
            <div style={{ fontSize: '11px', color: C.muted, marginTop: '8px', fontWeight: '600' }}>{card.sub}</div>
          </div>
        ))}
      </div>

      {/* CHARTS — 2x2 GRID */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '24px', marginBottom: '32px' }}>

        {/* CHART 1: Weekly Recitation Trend */}
        <div style={{ backgroundColor: C.card, borderRadius: '18px', padding: '24px', border: `1px solid ${C.border}`, boxShadow: '0 4px 16px rgba(0,0,0,0.04)' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '900', color: C.text, margin: '0 0 4px 0' }}>Weekly Recitation Trend</h3>
          <p style={{ fontSize: '12px', color: C.muted, margin: '0 0 20px 0' }}>Avg score &amp; session count per day of the week</p>
          {noWeekly ? (
            <EmptyState message="No recitation data found yet." />
          ) : (
            <div style={{ width: '100%', height: '240px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weeklyData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={C.border} />
                  <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: C.muted, fontSize: 11 }} />
                  <YAxis yAxisId="score" domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: C.muted, fontSize: 11 }} unit="%" />
                  <YAxis yAxisId="sessions" orientation="right" axisLine={false} tickLine={false} tick={{ fill: C.muted, fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '12px' }} />
                  <Line yAxisId="score" type="monotone" dataKey="Avg Score" stroke={C.primary} strokeWidth={3} dot={{ r: 4, fill: C.primary }} connectNulls />
                  <Line yAxisId="sessions" type="monotone" dataKey="Sessions" stroke={C.gold} strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3, fill: C.gold }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* CHART 2: Student Score Distribution */}
        <div style={{ backgroundColor: C.card, borderRadius: '18px', padding: '24px', border: `1px solid ${C.border}`, boxShadow: '0 4px 16px rgba(0,0,0,0.04)' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '900', color: C.text, margin: '0 0 4px 0' }}>Student Progress Distribution</h3>
          <p style={{ fontSize: '12px', color: C.muted, margin: '0 0 20px 0' }}>Students grouped by average recitation score</p>
          {noDistrib ? (
            <EmptyState message="No student score data available yet." />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', height: '240px' }}>
              <div style={{ flex: '0 0 160px', height: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={distributionData} cx="50%" cy="50%" innerRadius={50} outerRadius={72} paddingAngle={4} dataKey="value">
                      {distributionData.map((_, index) => (
                        <Cell key={index} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(val, name) => [`${val} students`, name]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px', paddingLeft: '20px' }}>
                {distributionData.map((d, i) => (
                  <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: COLORS[i % COLORS.length], flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '12px', fontWeight: '700', color: C.text }}>{d.name}</div>
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: '900', color: COLORS[i % COLORS.length] }}>{d.value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* CHART 3: Makhraj Errors by Arabic Letter */}
        <div style={{ backgroundColor: C.card, borderRadius: '18px', padding: '24px', border: `1px solid ${C.border}`, boxShadow: '0 4px 16px rgba(0,0,0,0.04)' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '900', color: C.text, margin: '0 0 4px 0' }}>Makhraj Error Analysis</h3>
          <p style={{ fontSize: '12px', color: C.muted, margin: '0 0 20px 0' }}>Arabic letters with the most detected pronunciation errors</p>
          {noMakhraj ? (
            <EmptyState message="No phonetic errors detected in submitted recitations." icon="✅" />
          ) : (
            <div style={{ width: '100%', height: '240px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={makhrajData} layout="vertical" margin={{ left: 4, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={C.border} />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: C.muted, fontSize: 11 }} />
                  <YAxis dataKey="letter" type="category" axisLine={false} tickLine={false} tick={{ fill: C.text, fontSize: 16, fontWeight: 'bold' }} width={30} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="Errors" fill={C.red} radius={[0, 6, 6, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* CHART 4: Tajwid Rule Frequency */}
        <div style={{ backgroundColor: C.card, borderRadius: '18px', padding: '24px', border: `1px solid ${C.border}`, boxShadow: '0 4px 16px rgba(0,0,0,0.04)' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '900', color: C.text, margin: '0 0 4px 0' }}>Tajwid Rule Violations</h3>
          <p style={{ fontSize: '12px', color: C.muted, margin: '0 0 20px 0' }}>Tajwid rules mentioned in AI tips &amp; teacher feedback</p>
          {noTajwid ? (
            <EmptyState message="No Tajwid rule violations detected yet." icon="📖" />
          ) : (
            <div style={{ width: '100%', height: '240px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={tajwidData} margin={{ left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={C.border} />
                  <XAxis dataKey="rule" axisLine={false} tickLine={false} tick={{ fill: C.muted, fontSize: 10 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: C.muted, fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="Count" fill={C.gold} radius={[6, 6, 0, 0]} barSize={24} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* DATA NOTE */}
      <div style={{
        backgroundColor: `${C.primary}08`, border: `1px solid ${C.primary}20`,
        borderRadius: '14px', padding: '14px 18px',
        fontSize: '12px', color: C.muted, lineHeight: '1.6'
      }}>
        <strong style={{ color: C.primary }}>📊 Live Data</strong> — All charts pull directly from Supabase.
        Makhraj &amp; Tajwid charts populate as students submit recitations with AI error analysis.
        The weekly trend shows all-time sessions grouped by day of week.
      </div>

    </div>
  );
}

function EmptyState({ message, icon = '📭' }) {
  return (
    <div style={{
      height: '200px', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: '10px',
      color: '#9CA3AF', backgroundColor: '#F9FAFB', borderRadius: '12px'
    }}>
      <span style={{ fontSize: '32px' }}>{icon}</span>
      <span style={{ fontSize: '13px', fontWeight: '600', textAlign: 'center', maxWidth: '220px' }}>{message}</span>
    </div>
  );
}





