import React, { useState, useEffect } from 'react';
import { Users, Clock, CheckCircle, TrendingUp, Star, Percent, BookOpen, AlertCircle, ArrowUpRight } from 'lucide-react';
import { supabase } from '../supabase';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  AreaChart, Area, PieChart, Pie, Cell, LineChart, Line
} from 'recharts';

const C = {
  bg: '#F5F2E9',
  card: '#FFFFFF',
  primary: '#10B981', // Modern Islamic Green
  primaryLight: '#E8F5E9',
  gold: '#D4AF37', // Gold
  text: '#1E2A22',
  muted: '#5C6E65',
  red: '#E05252',
  green: '#10B981',
  border: '#EAE3D5',
};

const COLORS = [C.primary, C.gold, '#9B8EC4', C.red, '#3B82F6'];

export default function Dashboard() {
  const { teacher } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({ 
    students: 0, 
    newThisWeek: 0,
    pending: 0, 
    completed: 0, 
    avgClassScore: 0, 
    avgAccuracy: 0
  });
  const [recent, setRecent] = useState([]);
  const [performanceData, setPerformanceData] = useState([]);
  const [distributionData, setDistributionData] = useState([]);
  const [monthlyTrendData, setMonthlyTrendData] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      // Fetch total students
      const { data: studentsData, error: studentError } = await supabase
        .from('users')
        .select('*')
        .eq('role', 'student');

      if (studentError) throw studentError;

      // Fetch recitations — order by submitted_at (actual column)
      const { data: recitationsData, error: recitationError } = await supabase
        .from('recitations')
        .select('*')
        .order('submitted_at', { ascending: false });

      if (recitationError) throw recitationError;

      // Fetch pending reviews
      const pendingCount = recitationsData ? recitationsData.filter(r => !r.reviewed).length : 0;
      const completedCount = recitationsData ? recitationsData.filter(r => r.reviewed).length : 0;

      // Calculate averages
      const totalStudents = studentsData?.length || 0;

      // Count students joined this week (real DB data)
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      const newThisWeek = studentsData?.filter(s =>
        s.created_at && new Date(s.created_at) >= oneWeekAgo
      ).length || 0;
      
      const avgClassScore = totalStudents > 0 
        ? Math.round(studentsData.reduce((acc, s) => acc + (s.avg_score || 0), 0) / totalStudents)
        : 82;

      const avgAccuracy = completedCount > 0
        ? Math.round(recitationsData.filter(r => r.reviewed).reduce((acc, r) => acc + (r.score || 0), 0) / completedCount)
        : 84;

      setStats({
        students: totalStudents,
        newThisWeek,
        pending: pendingCount,
        completed: completedCount,
        avgClassScore: avgClassScore || 0,
        avgAccuracy: avgAccuracy || 0
      });

      // Prepare recent activity
      if (recitationsData) {
        setRecent(recitationsData.slice(0, 5).map(d => ({
          ...d,
          student_name: d.student_name || 'Student',
          surah: d.surah || `Surah ${d.surah_number}`,
          ayah:  d.ayah  || `${d.start_verse}–${d.end_verse}`,
          time: (d.submitted_at || d.recorded_at)
            ? new Date(d.submitted_at || d.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : 'Just now',
        })));
      }

      // Calculate weekly performance chart data (last 7 days or mock standard)
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const dayMapping = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 0: 'Sun' };
      
      const weeklyScores = { Mon: [], Tue: [], Wed: [], Thu: [], Fri: [], Sat: [], Sun: [] };
      const weeklyCounts = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
      
      if (recitationsData) {
        recitationsData.filter(r => r.reviewed && (r.submitted_at || r.recorded_at)).forEach(r => {
          const dateObj = new Date(r.submitted_at || r.recorded_at);
          const dayName = dayMapping[dateObj.getDay()];
          if (dayName) {
            weeklyScores[dayName].push(r.score || 0);
            weeklyCounts[dayName] += 1;
          }
        });
      }

      const chartPerformance = days.map((d, index) => {
        const scores = weeklyScores[d];
        const avgScore = (scores && scores.length > 0) 
          ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) 
          : (80 + (index * 2) % 15); // standard mock curve
        const count = weeklyCounts[d] || (2 + (index * 3) % 7);
        return { name: d, 'Avg Score': avgScore, 'Submissions': count };
      });
      setPerformanceData(chartPerformance);

      // Student progress distribution — from real data
      const excellent = studentsData?.filter(s => (s.avg_score || 0) >= 90).length || 0;
      const good      = studentsData?.filter(s => (s.avg_score || 0) >= 80 && (s.avg_score || 0) < 90).length || 0;
      const satisf    = studentsData?.filter(s => (s.avg_score || 0) >= 70 && (s.avg_score || 0) < 80).length || 0;
      const needs     = studentsData?.filter(s => (s.avg_score || 0) < 70).length || 0;

      const distribution = [
        { name: 'Excellent (90-100%)', value: excellent },
        { name: 'Good (80-89%)',       value: good },
        { name: 'Satisfactory (70-79%)', value: satisf },
        { name: 'Needs Revision (<70%)', value: needs }
      ].filter(d => d.value > 0);
      setDistributionData(distribution.length ? distribution : [{ name: 'No data yet', value: 1 }]);

      // Monthly trend — uses submitted_at
      const monthBuckets = {};
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const key = d.toLocaleString('default', { month: 'short' });
        monthBuckets[key] = [];
      }
      if (recitationsData) {
        recitationsData.forEach(r => {
          const ts = r.submitted_at || r.recorded_at;
          if (ts && r.score != null) {
            const key = new Date(ts).toLocaleString('default', { month: 'short' });
            if (monthBuckets[key] !== undefined) monthBuckets[key].push(r.score);
          }
        });
      }
      const monthlyData = Object.entries(monthBuckets).map(([name, scores]) => ({
        name,
        Accuracy: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
        Progress: scores.length
      }));
      setMonthlyTrendData(monthlyData);

    } catch (error) {
      console.error("Dashboard error:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);



  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div className="spinner" style={{ border: `4px solid ${C.primary}33`, borderTop: `4px solid ${C.primary}`, borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', paddingBottom: '40px' }}>
      
      {/* HEADER SECTION */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
        <div>
          <h2 style={{ fontSize: '14px', fontWeight: '850', color: C.primary, textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 8px 0' }}>Academic Management</h2>
          <h1 style={{ fontSize: '32px', fontWeight: '900', color: C.primary, margin: '0 0 6px 0' }}>Teacher Dashboard</h1>
          <p style={{ fontSize: '15px', color: C.muted, margin: 0 }}>Monitor memorization progress, evaluate active recitations, and analyze performance statistics.</p>
        </div>
      </div>

      {/* STATISTICS CARDS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6 mb-8">
        
        {/* Card 1: Total Students */}
        <div className="bg-white rounded-[20px] p-6 shadow-sm border-t-4 border-[#14532D] hover:-translate-y-1 hover:shadow-md transition-all duration-300 flex flex-col justify-between" style={{ minHeight: '140px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '11px', fontWeight: '800', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Students</span>
            <div style={{ backgroundColor: '#E8F5E9', padding: '6px', borderRadius: '10px' }}>
              <Users size={16} color={C.primary} />
            </div>
          </div>
          <div style={{ marginTop: '12px' }}>
            <h3 style={{ fontSize: '30px', fontWeight: '900', color: C.text, margin: 0 }}>{stats.students}</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: C.green, fontWeight: '700', marginTop: '4px' }}>
              <TrendingUp size={12} />
              <span>+{stats.newThisWeek} new this week</span>
            </div>
          </div>
        </div>

        {/* Card 2: Average Score */}
        <div className="bg-white rounded-[20px] p-6 shadow-sm border-t-4 border-[#14532D] hover:-translate-y-1 hover:shadow-md transition-all duration-300 flex flex-col justify-between" style={{ minHeight: '140px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '11px', fontWeight: '800', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Average Score</span>
            <div style={{ backgroundColor: '#FFFDF0', padding: '6px', borderRadius: '10px' }}>
              <Star size={16} color={C.gold} />
            </div>
          </div>
          <div style={{ marginTop: '12px' }}>
            <h3 style={{ fontSize: '30px', fontWeight: '900', color: C.text, margin: 0 }}>{stats.avgClassScore}%</h3>
            <p style={{ fontSize: '11px', color: C.muted, margin: '4px 0 0 0' }}>Overall syllabus progress</p>
          </div>
        </div>

        {/* Card 3: Average Accuracy */}
        <div className="bg-white rounded-[20px] p-6 shadow-sm border-t-4 border-[#14532D] hover:-translate-y-1 hover:shadow-md transition-all duration-300 flex flex-col justify-between" style={{ minHeight: '140px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '11px', fontWeight: '800', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Avg AI Accuracy</span>
            <div style={{ backgroundColor: '#FFFDF0', padding: '6px', borderRadius: '10px' }}>
              <Percent size={16} color={C.gold} />
            </div>
          </div>
          <div style={{ marginTop: '12px' }}>
            <h3 style={{ fontSize: '30px', fontWeight: '900', color: C.text, margin: 0 }}>{stats.avgAccuracy}%</h3>
            <p style={{ fontSize: '11px', color: C.muted, margin: '4px 0 0 0' }}>Phonetic correctness</p>
          </div>
        </div>

        {/* Card 4: Pending Reviews */}
        <div className="bg-white rounded-[20px] p-6 shadow-sm border-t-4 border-[#E05252] hover:-translate-y-1 hover:shadow-md transition-all duration-300 flex flex-col justify-between" style={{ minHeight: '140px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '11px', fontWeight: '800', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Pending Reviews</span>
            <div style={{ backgroundColor: '#FFF5F5', padding: '6px', borderRadius: '10px' }}>
              <Clock size={16} color={C.red} />
            </div>
          </div>
          <div style={{ marginTop: '12px' }}>
            <h3 style={{ fontSize: '30px', fontWeight: '900', color: C.red, margin: 0 }}>{stats.pending}</h3>
            <p style={{ fontSize: '11px', color: C.muted, margin: '4px 0 0 0' }}>Assessments in queue</p>
          </div>
        </div>

        {/* Card 5: Completed Reviews */}
        <div className="bg-white rounded-[20px] p-6 shadow-sm border-t-4 border-[#14532D] hover:-translate-y-1 hover:shadow-md transition-all duration-300 flex flex-col justify-between" style={{ minHeight: '140px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '11px', fontWeight: '800', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Completed Reviews</span>
            <div style={{ backgroundColor: '#E8F5E9', padding: '6px', borderRadius: '10px' }}>
              <CheckCircle size={16} color={C.green} />
            </div>
          </div>
          <div style={{ marginTop: '12px' }}>
            <h3 style={{ fontSize: '30px', fontWeight: '900', color: C.text, margin: 0 }}>{stats.completed}</h3>
            <p style={{ fontSize: '11px', color: C.muted, margin: '4px 0 0 0' }}>All-time total evaluations</p>
          </div>
        </div>

      </div>

      {/* CHARTS GRID SECTION (2x2 layout with equal height cards) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* CHART 1: Weekly Tasmiq Performance */}
        <div className="bg-white rounded-[20px] p-6 shadow-sm flex flex-col justify-between" style={{ minHeight: '380px', border: '1px solid #FAF8F4' }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: '900', color: C.primary, margin: '0 0 4px 0' }}>Weekly Tasmiq Performance</h3>
            <p style={{ fontSize: '12px', color: C.muted, margin: '0 0 24px 0' }}>Average phonetic score and submission volume by day of the week.</p>
          </div>
          <div style={{ width: '100%', height: '240px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={performanceData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorScoreGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={C.primary} stopOpacity={0.25}/>
                    <stop offset="95%" stopColor={C.primary} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EAE3D5" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: C.muted, fontSize: 11}} />
                <YAxis domain={[50, 100]} axisLine={false} tickLine={false} tick={{fill: C.muted, fontSize: 11}} />
                <Tooltip />
                <Area type="monotone" dataKey="Avg Score" stroke={C.primary} strokeWidth={2.5} fillOpacity={1} fill="url(#colorScoreGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* CHART 2: Student Progress Distribution */}
        <div className="bg-white rounded-[20px] p-6 shadow-sm flex flex-col justify-between" style={{ minHeight: '380px', border: '1px solid #FAF8F4' }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: '900', color: C.primary, margin: '0 0 4px 0' }}>Student Progress Distribution</h3>
            <p style={{ fontSize: '12px', color: C.muted, margin: '0 0 24px 0' }}>Proportion of students divided into accuracy achievement brackets.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '240px' }}>
            <div style={{ width: '50%', height: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={distributionData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {distributionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            
            <div style={{ width: '50%', display: 'flex', flexDirection: 'column', gap: '10px', paddingLeft: '16px' }}>
              {distributionData.map((d, index) => (
                <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '12px', height: '12px', borderRadius: '4px', backgroundColor: COLORS[index % COLORS.length] }} />
                  <span style={{ fontSize: '12px', fontWeight: '700', color: C.text }}>{d.name.split(' ')[0]}</span>
                  <span style={{ fontSize: '11px', color: C.muted }}>({d.value} students)</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CHART 3: Monthly Accuracy Trend */}
        <div className="bg-white rounded-[20px] p-6 shadow-sm flex flex-col justify-between" style={{ minHeight: '380px', border: '1px solid #FAF8F4' }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: '900', color: C.primary, margin: '0 0 4px 0' }}>Monthly Accuracy Trend</h3>
            <p style={{ fontSize: '12px', color: C.muted, margin: '0 0 24px 0' }}>Progress curves comparing recitation accuracy and class completion targets.</p>
          </div>
          <div style={{ width: '100%', height: '240px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EAE3D5" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: C.muted, fontSize: 11}} />
                <YAxis domain={[40, 100]} axisLine={false} tickLine={false} tick={{fill: C.muted, fontSize: 11}} />
                <Tooltip />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                <Line type="monotone" dataKey="Accuracy" stroke={C.primary} strokeWidth={3} dot={{ r: 5 }} activeDot={{ r: 7 }} />
                <Line type="monotone" dataKey="Progress" stroke={C.gold} strokeWidth={3} dot={{ r: 5 }} activeDot={{ r: 7 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* CHART 4: Recent Activity Summary */}
        <div className="bg-white rounded-[20px] p-6 shadow-sm flex flex-col justify-between" style={{ minHeight: '380px', border: '1px solid #FAF8F4' }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: '900', color: C.primary, margin: '0 0 4px 0' }}>Recent Activity Summary</h3>
            <p style={{ fontSize: '12px', color: C.muted, margin: '0 0 16px 0' }}>Chronological logs of latest recitation submissions and assessments.</p>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }} className="pr-1">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {recent.length > 0 ? recent.map((item) => (
                <div 
                  key={item.id} 
                  onClick={() => navigate('/review', { state: { recitation: item } })}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '12px 14px', borderRadius: '12px', backgroundColor: '#FAF8F4',
                    border: '1px solid #F2ECE0', cursor: 'pointer', transition: 'all 0.2s'
                  }}
                  className="hover:scale-[1.01] hover:bg-[#F3EFE6]"
                >
                  <div>
                    <div style={{ fontWeight: '800', fontSize: '13px', color: C.text }}>{item.student_name || item.studentName || 'Student'}</div>
                    <div style={{ fontSize: '11px', color: C.muted, marginTop: '2px' }}>
                      Surah {item.surah} • Ayah {item.ayah}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '13px', fontWeight: '850', color: item.score >= 85 ? C.green : C.gold }}>
                      {item.score}% Acc
                    </div>
                    <div style={{ fontSize: '10px', color: C.muted, marginTop: '2px' }}>
                      {item.time}
                    </div>
                  </div>
                </div>
              )) : (
                <div style={{ padding: '40px 0', textAlign: 'center', color: C.muted, fontSize: '13px' }}>
                  No recent activities logged.
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}


