import React from 'react';
import { AlertCircle } from 'lucide-react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './screens/Login';
import Dashboard from './screens/Dashboard';
import Students from './screens/Students';
import RecitationReview from './screens/RecitationReview';
import ClassManagement from './screens/ClassManagement';
import PendingRequests from './screens/PendingRequests';
import ProfileSettings from './screens/ProfileSettings';

const ProtectedRoute = ({ children }) => {
  const { teacher, loading, logout } = useAuth();
  const [isStudent, setIsStudent] = React.useState(false);

  React.useEffect(() => {
    // If not loading, check if user exists in Supabase but is not a 'teacher'
    import('./supabase').then(({ supabase }) => {
        supabase.auth.getUser().then(({ data: { user } }) => {
            if (user && !teacher) {
                setIsStudent(true);
            } else {
                setIsStudent(false);
            }
        });
    });
  }, [teacher, loading]);
  
  if (loading) return null;

  if (isStudent) {
    return (
        <div style={{ height: '100vh', backgroundColor: '#F5F2E9', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '20px' }}>
            <div style={{ backgroundColor: 'white', padding: '40px', borderRadius: '24px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', maxWidth: '400px' }}>
                <div style={{ width: '80px', height: '80px', borderRadius: '40px', backgroundColor: '#E0525210', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
                    <AlertCircle size={40} color="#E05252" />
                </div>
                <h2 style={{ fontSize: '24px', fontWeight: '900', color: '#1E2A22', marginBottom: '12px' }}>Access Denied</h2>
                <p style={{ color: '#5C6E65', lineHeight: '1.6', marginBottom: '24px' }}>
                    This portal is reserved for **Teachers & Staff**. Students please use the TasmiqAI Mobile App.
                </p>
                <button 
                    onClick={logout}
                    style={{ backgroundColor: '#4A8C73', color: 'white', border: 'none', padding: '14px 28px', borderRadius: '16px', fontWeight: '800', cursor: 'pointer' }}
                >
                    Back to Login
                </button>
            </div>
        </div>
    );
  }

  if (!teacher) return <Navigate to="/login" replace />;
  
  return children;
};

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route 
        path="/dashboard" 
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/students" 
        element={
          <ProtectedRoute>
            <Students />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/review" 
        element={
          <ProtectedRoute>
            <RecitationReview />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/classes" 
        element={
          <ProtectedRoute>
            <ClassManagement />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/requests" 
        element={
          <ProtectedRoute>
            <PendingRequests />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/profile" 
        element={
          <ProtectedRoute>
            <ProfileSettings />
          </ProtectedRoute>
        } 
      />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
      </Router>
    </AuthProvider>
  );
}

export default App;
