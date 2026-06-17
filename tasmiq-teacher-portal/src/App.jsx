import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';

import Layout from './components/Layout';
import Login from './screens/Login';
import Dashboard from './screens/Dashboard';
import Students from './screens/Students';
import StudentProfile from './screens/StudentProfile';
import RecitationReview from './screens/RecitationReview';
import ClassManagement from './screens/ClassManagement';
import PendingRequests from './screens/PendingRequests';
import MurajaahMonitoring from './screens/MurajaahMonitoring';
import Analytics from './screens/Analytics';
import Reports from './screens/Reports';
import Announcements from './screens/Announcements';
import Settings from './screens/Settings';
import ProfileSettings from './screens/ProfileSettings';
import DbTest from './screens/DbTest';

// Protected route wrapper — redirects to /login if not authenticated
function ProtectedRoute({ children }) {
  const { teacher, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', backgroundColor: '#F5F2E9'
      }}>
        <div style={{
          border: '4px solid #14532D33', borderTop: '4px solid #14532D',
          borderRadius: '50%', width: '40px', height: '40px',
          animation: 'spin 1s linear infinite'
        }} />
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!teacher) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<Login />} />
      <Route path="/dbtest" element={<DbTest />} />

      {/* Protected — wrapped in Layout (sidebar + topbar) */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="students" element={<Students />} />
        <Route path="students/:id" element={<StudentProfile />} />
        <Route path="review" element={<RecitationReview />} />
        <Route path="classes" element={<ClassManagement />} />
        <Route path="requests" element={<PendingRequests />} />
        <Route path="murajaah" element={<MurajaahMonitoring />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="reports" element={<Reports />} />
        <Route path="announcements" element={<Announcements />} />
        <Route path="settings" element={<Settings />} />
        <Route path="profile" element={<ProfileSettings />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
