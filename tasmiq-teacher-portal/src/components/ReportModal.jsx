import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

const C = {
  primary: '#10B981',
  gold: '#D4AF37',
  text: '#1E2A22',
  muted: '#5C6E65',
  bg: '#F5F2E9',
  border: '#EAE3D5'
};

const SECTIONS = [
  { id: 'profile', label: 'Student Profile Summary' },
  { id: 'assessment', label: 'Tasmiq Assessment Results' },
  { id: 'history', label: 'Recitation History' },
  { id: 'analytics', label: 'Progress Analytics' },
  { id: 'tajwid', label: 'Tajwid Error Analysis' },
  { id: 'feedback', label: 'Teacher Feedback Records' },
  { id: 'class', label: 'Class Performance Summary' },
  { id: 'attendance', label: 'Attendance & Participation' },
  { id: 'achievements', label: 'Achievement & Milestones' }
];

export default function ReportModal({ isOpen, onClose, onGenerate }) {
  const [selected, setSelected] = useState({
    profile: true,
    assessment: true,
    history: true,
    analytics: true,
    tajwid: true,
    feedback: true,
    class: true,
    attendance: true,
    achievements: true
  });

  const [fullReport, setFullReport] = useState(true);

  // Sync fullReport with individual check states
  const handleToggleSection = (id) => {
    const nextSelected = { ...selected, [id]: !selected[id] };
    setSelected(nextSelected);
    
    // If all are true, fullReport is true, else false
    const allTrue = Object.values(nextSelected).every(v => v);
    setFullReport(allTrue);
  };

  const handleToggleFullReport = () => {
    const nextVal = !fullReport;
    setFullReport(nextVal);
    
    const nextSelected = {};
    SECTIONS.forEach(s => {
      nextSelected[s.id] = nextVal;
    });
    setSelected(nextSelected);
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', zIndex: 1000,
      animation: 'fadeIn 0.2s ease-out'
    }}>
      <div style={{
        backgroundColor: 'white', width: '100%', maxWidth: '500px',
        borderRadius: '24px', padding: '32px', boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
        boxSizing: 'border-box', position: 'relative',
        transform: 'scale(1)', animation: 'scaleUp 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)'
      }}>
        {/* Close Button */}
        <button 
          onClick={onClose}
          style={{
            position: 'absolute', top: '24px', right: '24px', background: 'none',
            border: 'none', cursor: 'pointer', color: C.muted
          }}
        >
          <X size={20} />
        </button>

        {/* Title */}
        <h2 style={{ fontSize: '22px', fontWeight: '900', color: C.primary, margin: '0 0 6px 0' }}>Generate Academic Report</h2>
        <p style={{ fontSize: '14px', color: C.muted, margin: '0 0 24px 0' }}>Select report sections to include in the PDF.</p>

        {/* Checklist Container */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '28px', maxHeight: '300px', overflowY: 'auto', paddingRight: '8px' }}>
          
          {/* Full Report Option */}
          <label style={{
            display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px',
            borderRadius: '12px', backgroundColor: '#F4F9F6', cursor: 'pointer',
            border: `1px solid ${C.primary}15`, fontWeight: '800', color: C.primary
          }}>
            <input 
              type="checkbox" 
              checked={fullReport}
              onChange={handleToggleFullReport}
              style={{ width: '18px', height: '18px', accentColor: C.primary }}
            />
            Full Academic Report
          </label>

          <div style={{ height: '1px', backgroundColor: C.border, margin: '8px 0' }} />

          {/* Individual Sections */}
          {SECTIONS.map((s) => (
            <label 
              key={s.id} 
              style={{
                display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px',
                borderRadius: '12px', backgroundColor: '#FAF8F4', cursor: 'pointer',
                border: '1px solid #FAF8F4', transition: 'all 0.15s',
                fontSize: '14px', fontWeight: '600', color: C.text
              }}
              className="hover:bg-[#F3EFE6]"
            >
              <input 
                type="checkbox" 
                checked={selected[s.id]}
                onChange={() => handleToggleSection(s.id)}
                style={{ width: '16px', height: '16px', accentColor: C.primary }}
              />
              {s.label}
            </label>
          ))}
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '16px' }}>
          <button 
            onClick={onClose}
            style={{
              flex: 1, padding: '14px', borderRadius: '14px', border: `1px solid ${C.border}`,
              backgroundColor: 'white', color: C.muted, fontWeight: '700', cursor: 'pointer'
            }}
          >
            Cancel
          </button>
          <button 
            onClick={() => {
              onGenerate(selected);
              onClose();
            }}
            style={{
              flex: 2, padding: '14px', borderRadius: '14px', border: 'none',
              backgroundColor: C.primary, color: 'white', fontWeight: '800', cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(20, 83, 45, 0.25)'
            }}
          >
            Generate PDF
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleUp {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}


