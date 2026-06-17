import React, { useState, useEffect } from 'react';
import { ArrowLeft, Plus, Copy, Users, Clock, Building, Pencil, Trash2 } from 'lucide-react';
import { supabase } from '../supabase';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

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
};

const generateUniqueCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I, O, 1, 0
  let code = 'TSMQ-';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

export default function ClassManagement() {
  const navigate = useNavigate();
  const { teacher } = useAuth();
  
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [showModal, setShowModal] = useState(false);
  const [newClass, setNewClass] = useState({ name: '', description: '', schedule: '' });
  const [creating, setCreating] = useState(false);
  const [editingClass, setEditingClass] = useState(null);

  useEffect(() => {
    loadClasses();
  }, [teacher]);

  const loadClasses = async () => {
    if (!teacher) return;
    try {
      const { data, error } = await supabase
        .from('classes')
        .select('*')
        .eq('teacher_id', teacher.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setClasses(data || []);
    } catch (err) {
      console.error("Error loading classes", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateClass = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      const uniqueCode = generateUniqueCode();
      const { data, error } = await supabase
        .from('classes')
        .insert([{
          teacher_id:  teacher.id,
          name:        newClass.name,
          description: newClass.description,
          schedule:    newClass.schedule,
          class_code:  uniqueCode,   // actual DB column
          unique_code: uniqueCode,   // our added alias column
          is_active:   true,
        }])
        .select();

      if (error) throw error;
      
      setClasses([data[0], ...classes]);
      setShowModal(false);
      setNewClass({ name: '', description: '', schedule: '' });
    } catch (err) {
      console.error("Error creating class", err);
      alert(`Failed to create class: ${err.message || JSON.stringify(err)}`);
    } finally {
      setCreating(false);
    }
  };

  const handleEditClick = (cls) => {
    setEditingClass(cls);
    setNewClass({ name: cls.name, description: cls.description, schedule: cls.schedule });
    setShowModal(true);
  };

  const handleUpdateClass = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      const { data, error } = await supabase
        .from('classes')
        .update({
          name: newClass.name,
          description: newClass.description,
          schedule: newClass.schedule,
        })
        .eq('id', editingClass.id)
        .select();

      if (error) throw error;
      
      setClasses(classes.map(c => c.id === editingClass.id ? data[0] : c));
      setShowModal(false);
      setNewClass({ name: '', description: '', schedule: '' });
      setEditingClass(null);
    } catch (err) {
      console.error("Error updating class", err);
      alert(`Failed to update class: ${err.message || JSON.stringify(err)}`);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteClick = async (id) => {
    const confirmDelete = window.confirm("Are you sure you want to delete this class? This action cannot be undone.");
    if (!confirmDelete) return;
    
    try {
      const { error } = await supabase
        .from('classes')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      setClasses(classes.filter(c => c.id !== id));
    } catch (err) {
      console.error("Error deleting class", err);
      alert(`Failed to delete class: ${err.message || JSON.stringify(err)}`);
    }
  };

  const copyToClipboard = (code) => {
    navigator.clipboard.writeText(code);
    alert('Code copied to clipboard: ' + code);
  };

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg }}>
        <div className="spinner" style={{ border: `4px solid ${C.primary}33`, borderTop: `4px solid ${C.primary}`, borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: C.bg, minHeight: '100vh', padding: '40px' }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', marginRight: '20px' }}>
              <ArrowLeft size={28} color={C.text} />
            </button>
            <div>
              <h1 style={{ fontSize: '28px', fontWeight: '900', color: C.text, margin: 0 }}>Class Management</h1>
              <p style={{ fontSize: '15px', color: C.muted }}>Manage your classes and join codes</p>
            </div>
          </div>
          
          <button 
            onClick={() => setShowModal(true)}
            style={{ 
              backgroundColor: C.primary, color: 'white', border: 'none', 
              padding: '12px 24px', borderRadius: '16px', fontWeight: '800', 
              display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer',
              boxShadow: `0 8px 20px ${C.primary}40`
            }}
          >
            <Plus size={20} /> Create New Class
          </button>
        </div>

        {/* Classes List */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '24px' }}>
          {classes.length > 0 ? classes.map((cls) => (
            <div key={cls.id} style={{ backgroundColor: C.card, borderRadius: '24px', padding: '24px', boxShadow: '0 8px 24px rgba(0,0,0,0.03)', border: '1px solid #F8F8F8' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '14px', backgroundColor: C.primary + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                  <Building size={24} color={C.primary} />
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => handleEditClick(cls)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px', borderRadius: '10px', backgroundColor: '#F9F9F9' }}>
                    <Pencil size={16} color={C.primary} />
                  </button>
                  <button onClick={() => handleDeleteClick(cls.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px', borderRadius: '10px', backgroundColor: '#F9F9F9' }}>
                    <Trash2 size={16} color={C.red} />
                  </button>
                </div>
              </div>
              <h3 style={{ fontSize: '20px', fontWeight: '800', color: C.text, marginBottom: '8px' }}>{cls.name}</h3>
              <p style={{ fontSize: '14px', color: C.muted, marginBottom: '16px', minHeight: '40px' }}>{cls.description}</p>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px', color: C.muted, fontSize: '13px' }}>
                <Clock size={16} /> {cls.schedule || 'Flexible Schedule'}
              </div>

              <div style={{ backgroundColor: C.bg, borderRadius: '16px', padding: '16px', border: `2px dashed ${C.primary}50` }}>
                <div style={{ fontSize: '12px', fontWeight: '800', color: C.primary, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>Join Code</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '24px', fontWeight: '900', color: C.text, letterSpacing: '2px' }}>
                    {cls.unique_code || cls.class_code || '—'}
                  </span>
                  <button onClick={() => copyToClipboard(cls.unique_code || cls.class_code)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px', backgroundColor: 'white', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                    <Copy size={18} color={C.primary} />
                  </button>
                </div>
              </div>
            </div>
          )) : (
            <div style={{ gridColumn: '1 / -1', padding: '60px', textAlign: 'center', backgroundColor: C.card, borderRadius: '24px' }}>
              <Building size={48} color="#DDD" style={{ marginBottom: '16px' }} />
              <h3 style={{ fontSize: '20px', color: C.text, fontWeight: '800', marginBottom: '8px' }}>No Classes Yet</h3>
              <p style={{ color: C.muted, fontSize: '16px' }}>Create your first class to get a unique join code for your students.</p>
            </div>
          )}
        </div>

        {/* Create Modal */}
        {showModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
            <div style={{ backgroundColor: C.card, borderRadius: '32px', padding: '40px', width: '100%', maxWidth: '500px', boxShadow: '0 24px 48px rgba(0,0,0,0.2)' }}>
              <h2 style={{ fontSize: '24px', fontWeight: '900', color: C.text, marginBottom: '8px' }}>{editingClass ? 'Edit Class' : 'Create New Class'}</h2>
              <p style={{ color: C.muted, marginBottom: '24px' }}>Fill in the details for your class.</p>
              
              <form onSubmit={editingClass ? handleUpdateClass : handleCreateClass}>
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '800', color: C.text, marginBottom: '8px' }}>CLASS NAME *</label>
                  <input 
                    required
                    type="text" 
                    value={newClass.name}
                    onChange={e => setNewClass({...newClass, name: e.target.value})}
                    placeholder="e.g. Form 1 Tahfiz"
                    style={{ width: '100%', padding: '16px', borderRadius: '16px', border: '1px solid #E5E5E5', fontSize: '16px', boxSizing: 'border-box' }}
                  />
                </div>
                
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '800', color: C.text, marginBottom: '8px' }}>DESCRIPTION (OPTIONAL)</label>
                  <textarea 
                    value={newClass.description}
                    onChange={e => setNewClass({...newClass, description: e.target.value})}
                    placeholder="Brief description of the class"
                    rows={3}
                    style={{ width: '100%', padding: '16px', borderRadius: '16px', border: '1px solid #E5E5E5', fontSize: '16px', boxSizing: 'border-box', fontFamily: 'inherit' }}
                  />
                </div>
                
                <div style={{ marginBottom: '32px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '800', color: C.text, marginBottom: '8px' }}>SCHEDULE (OPTIONAL)</label>
                  <input 
                    type="text" 
                    value={newClass.schedule}
                    onChange={e => setNewClass({...newClass, schedule: e.target.value})}
                    placeholder="e.g. Mon & Wed, 8:00 AM"
                    style={{ width: '100%', padding: '16px', borderRadius: '16px', border: '1px solid #E5E5E5', fontSize: '16px', boxSizing: 'border-box' }}
                  />
                </div>
                
                <div style={{ display: 'flex', gap: '16px' }}>
                  <button 
                    type="button" 
                    onClick={() => { setShowModal(false); setEditingClass(null); setNewClass({ name: '', description: '', schedule: '' }); }}
                    style={{ flex: 1, padding: '16px', borderRadius: '16px', border: 'none', backgroundColor: '#F0F0F0', color: C.text, fontWeight: '800', fontSize: '16px', cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    disabled={creating}
                    style={{ flex: 1, padding: '16px', borderRadius: '16px', border: 'none', backgroundColor: C.primary, color: 'white', fontWeight: '800', fontSize: '16px', cursor: 'pointer', opacity: creating ? 0.7 : 1 }}
                  >
                    {creating ? 'Saving...' : (editingClass ? 'Save Changes' : 'Create Class')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}



