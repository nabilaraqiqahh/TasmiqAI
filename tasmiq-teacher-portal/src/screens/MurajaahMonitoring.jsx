import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, AlertTriangle, BookOpen, Clock, Star, Search, ChevronRight } from 'lucide-react';

const C = {
  bg: '#F5F2E9',
  card: '#FFFFFF',
  primary: '#10B981',
  gold: '#C9A84C',
  lilac: '#9B8EC4',
  text: '#1E2A22',
  muted: '#5C6E65',
  red: '#E05252',
  green: '#10B981',
  border: '#EAE3D5',
};

export default function MurajaahMonitoring() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState('All');
  const [search, setSearch] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);

      // Fetch classes
      const { data: classesData } = await supabase
        .from('classes')
        .select('*');
      setClasses(classesData || []);

      // Fetch class memberships
      const { data: membersData } = await supabase
        .from('class_members')
        .select('*');

      // Fetch students
      const { data: studentsData } = await supabase
        .from('users')
        .select('*')
        .eq('role', 'student');

      // Fetch recitations — use actual DB column submitted_at
      const { data: recsData } = await supabase
        .from('recitations')
        .select('*')
        .order('submitted_at', { ascending: false });

      if (studentsData) {
        const formatted = studentsData.map(student => {
          // Find which class the student belongs to
          const studentClasses = (membersData || [])
            .filter(m => m.student_id === student.id)
            .map(m => {
              const cls = (classesData || []).find(c => c.id === m.class_id);
              return cls ? cls.name : null;
            })
            .filter(Boolean);

          const classId = (membersData || []).find(m => m.student_id === student.id)?.class_id || null;

          // Find their recitations — actual column is user_id
          const studentRecs = (recsData || []).filter(r => r.user_id === student.id);
          const lastRec = studentRecs[0] || null;

          // Calculate status using submitted_at (actual column)
          let status = 'On Track';
          let daysInactive = 999;
          const lastTs = lastRec?.submitted_at || lastRec?.recorded_at;
          if (lastRec && lastTs) {
            const lastDate = new Date(lastTs);
            const today = new Date();
            daysInactive = Math.floor((today - lastDate) / (1000 * 60 * 60 * 24));
          }

          if ((student.avg_score || 0) < 70 || daysInactive > 5) {
            status = 'Needs Attention';
          } else if ((student.avg_score || 0) >= 85 && daysInactive <= 2) {
            status = 'Excellent Progress';
          }

          return {
            id: student.id,
            displayName: student.full_name || student.display_name || 'Student',
            email: student.email,
            avgScore: student.avg_score || 0,
            progress: student.progress || 0,
            className: studentClasses.join(', ') || 'Unassigned',
            classId: classId,
            lastSurah: lastRec
              ? `${lastRec.surah || `Surah ${lastRec.surah_number}`} (Ayah ${lastRec.ayah || `${lastRec.start_verse}–${lastRec.end_verse}`})`
              : 'No submissions yet',
            lastActive: lastTs
              ? new Date(lastTs).toLocaleDateString()
              : 'Inactive',
            status,
            daysInactive
          };
        });
        setStudents(formatted);
      }
    } catch (err) {
      console.error("Error loading Murajaah Monitoring:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filter students based on selected class and search query
  const filteredStudents = students.filter(s => {
    const matchesClass = selectedClass === 'All' || s.classId === selectedClass;
    const name = (s.displayName || '').toLowerCase();
    const cls  = (s.className || '').toLowerCase();
    const matchesSearch = name.includes(search.toLowerCase()) || cls.includes(search.toLowerCase());
    return matchesClass && matchesSearch;
  });

  const needsAttentionCount = filteredStudents.filter(s => s.status === 'Needs Attention').length;
  const excellentCount = filteredStudents.filter(s => s.status === 'Excellent Progress').length;
  const onTrackCount = filteredStudents.filter(s => s.status === 'On Track').length;

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div className="spinner" style={{ border: `4px solid ${C.primary}33`, borderTop: `4px solid ${C.primary}`, borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      
      {/* HEADER SECTION */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
        <div>
          <h2 style={{ fontSize: '15px', fontWeight: '800', color: C.primary, margin: '0 0 8px 0' }}>Academic Module</h2>
          <h1 style={{ fontSize: '28px', fontWeight: '900', color: C.primary, margin: '0 0 4px 0' }}>Murajaah Monitoring</h1>
          <p style={{ fontSize: '14px', color: C.muted, margin: 0 }}>Track Quranic revision status, completion rates, and prioritize students who require immediate guidance.</p>
        </div>
      </div>

      {/* QUICK STATS CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px', marginBottom: '32px' }}>
        {/* Card 1: Needs Attention */}
        <div style={{ backgroundColor: C.card, borderRadius: '16px', padding: '24px', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', borderTop: `4px solid ${C.red}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ fontSize: '11px', fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 8px 0' }}>Needs Attention</p>
              <h3 style={{ fontSize: '32px', fontWeight: '900', color: C.text, margin: 0 }}>{needsAttentionCount}</h3>
            </div>
            <div style={{ width: '40px', height: '40px', borderRadius: '20px', backgroundColor: '#FDF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AlertTriangle size={20} color={C.red} />
            </div>
          </div>
          <p style={{ fontSize: '12px', color: C.muted, marginTop: '8px' }}>Inactive or average score below 70%</p>
        </div>

        {/* Card 2: Excellent Progress */}
        <div style={{ backgroundColor: C.card, borderRadius: '16px', padding: '24px', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', borderTop: `4px solid ${C.primary}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ fontSize: '11px', fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 8px 0' }}>Excellent Progress</p>
              <h3 style={{ fontSize: '32px', fontWeight: '900', color: C.text, margin: 0 }}>{excellentCount}</h3>
            </div>
            <div style={{ width: '40px', height: '40px', borderRadius: '20px', backgroundColor: '#E8F5E9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircle size={20} color={C.green} />
            </div>
          </div>
          <p style={{ fontSize: '12px', color: C.muted, marginTop: '8px' }}>High activity and score above 85%</p>
        </div>

        {/* Card 3: On Track */}
        <div style={{ backgroundColor: C.card, borderRadius: '16px', padding: '24px', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', borderTop: `4px solid ${C.gold}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ fontSize: '11px', fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 8px 0' }}>Steady Progress</p>
              <h3 style={{ fontSize: '32px', fontWeight: '900', color: C.text, margin: 0 }}>{onTrackCount}</h3>
            </div>
            <div style={{ width: '40px', height: '40px', borderRadius: '20px', backgroundColor: '#FFFDF0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Clock size={20} color={C.gold} />
            </div>
          </div>
          <p style={{ fontSize: '12px', color: C.muted, marginTop: '8px' }}>Active within the last 5 days</p>
        </div>
      </div>

      {/* FILTER & SEARCH CONTROL BAR */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', alignItems: 'center' }}>
        {/* Class Filter */}
        <div style={{ position: 'relative', width: '220px' }}>
          <select 
            value={selectedClass}
            onChange={e => setSelectedClass(e.target.value)}
            style={{ 
              width: '100%', backgroundColor: C.card, borderRadius: '12px', 
              padding: '12px 16px', fontSize: '14px', fontWeight: '700', color: C.text,
              border: '1px solid #EAE3D5', outline: 'none', appearance: 'none', cursor: 'pointer'
            }}
          >
            <option value="All">All Classes</option>
            {classes.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <div style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: C.muted }}>▼</div>
        </div>

        {/* Search Input */}
        <div style={{ display: 'flex', alignItems: 'center', flex: 1, backgroundColor: C.card, borderRadius: '12px', padding: '0 16px', border: '1px solid #EAE3D5' }}>
          <Search size={18} color={C.muted} style={{ marginRight: '8px' }} />
          <input 
            type="text" 
            placeholder="Search student or class..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, border: 'none', outline: 'none', padding: '12px 0', fontSize: '14px', color: C.text, backgroundColor: 'transparent' }}
          />
        </div>
      </div>

      {/* MURAJAAH ROSTER */}
      <div style={{ backgroundColor: C.card, borderRadius: '16px', padding: '24px', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}`, textAlign: 'left', color: C.muted, fontSize: '11px', textTransform: 'uppercase' }}>
              <th style={{ padding: '12px 16px', fontWeight: '700' }}>Student Name</th>
              <th style={{ padding: '12px 16px', fontWeight: '700' }}>Class</th>
              <th style={{ padding: '12px 16px', fontWeight: '700' }}>Last Active Date</th>
              <th style={{ padding: '12px 16px', fontWeight: '700' }}>Current Revision</th>
              <th style={{ padding: '12px 16px', fontWeight: '700' }}>Revision Accuracy</th>
              <th style={{ padding: '12px 16px', fontWeight: '700' }}>Revision Progress</th>
              <th style={{ padding: '12px 16px', fontWeight: '700' }}>Status</th>
              <th style={{ padding: '12px 16px' }}></th>
            </tr>
          </thead>
          <tbody>
            {filteredStudents.length > 0 ? filteredStudents.map((item, i) => (
              <tr 
                key={item.id} 
                onClick={() => navigate(`/students/${item.id}`)}
                style={{ 
                  borderBottom: i < filteredStudents.length - 1 ? `1px solid ${C.border}` : 'none',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s'
                }}
                onMouseOver={e => e.currentTarget.style.backgroundColor = '#FAF8F4'}
                onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <td style={{ padding: '16px', fontWeight: '700', color: C.text, fontSize: '14px' }}>
                  {item.displayName}
                </td>
                <td style={{ padding: '16px', color: C.text, fontSize: '14px' }}>
                  {item.className}
                </td>
                <td style={{ padding: '16px', color: C.muted, fontSize: '14px' }}>
                  {item.lastActive}
                </td>
                <td style={{ padding: '16px', color: C.text, fontSize: '14px', fontWeight: '600' }}>
                  {item.lastSurah}
                </td>
                <td style={{ padding: '16px', fontWeight: '800', fontSize: '14px', color: item.avgScore >= 85 ? C.green : item.avgScore >= 70 ? C.gold : C.red }}>
                  {item.avgScore}%
                </td>
                <td style={{ padding: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '80px', height: '6px', backgroundColor: '#F0F0F0', borderRadius: '3px' }}>
                      <div style={{ width: `${item.progress}%`, height: '100%', backgroundColor: C.primary, borderRadius: '3px' }} />
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: '700', color: C.muted }}>{item.progress}%</span>
                  </div>
                </td>
                <td style={{ padding: '16px' }}>
                  <span style={{ 
                    backgroundColor: item.status === 'Excellent Progress' ? '#10B98115' : item.status === 'Needs Attention' ? '#E0525215' : '#D4AF3715', 
                    color: item.status === 'Excellent Progress' ? C.green : item.status === 'Needs Attention' ? C.red : C.gold, 
                    padding: '6px 12px', 
                    borderRadius: '20px', 
                    fontSize: '12px', 
                    fontWeight: '700',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    {item.status === 'Needs Attention' ? <AlertTriangle size={12} /> : null}
                    {item.status}
                  </span>
                </td>
                <td style={{ padding: '16px', textAlign: 'right' }}>
                  <ChevronRight size={18} color="#CCC" />
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan="8" style={{ padding: '40px', textAlign: 'center', color: C.muted }}>No students found matching filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}



