import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Auth/Login";
import Signup from "./pages/Auth/Signup";
import ForgotPassword from "./pages/Auth/ForgotPassword";
import Dashboard from "./pages/Dashboard/Dashboard";
import ProtectedRoute from "./components/ProtectedRoute";
import UploadPage from "./pages/Upload/Upload";
import { useAuth } from "./context/AuthContext";
import ATSReport from "./pages/ATSReport/ATSReport";
import MatchReport from "./pages/MatchReport/MatchReport";
import SkillGapPlan from "./pages/SkillGapPlan/SkillGapPlan";

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return <Navigate to={user ? "/upload" : "/login"} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />

      <Route
        path="/upload"
        element={
          <ProtectedRoute>
            <UploadPage />
          </ProtectedRoute>
        }
      />

      <Route
  path="/ats-report"
  element={
    <ProtectedRoute>
      <ATSReport />
    </ProtectedRoute>
  }
/>
<Route
  path="/match-report"
  element={
    <ProtectedRoute>
      <MatchReport />
    </ProtectedRoute>
  }
/>

<Route
  path="/skill-gap"
  element={
    <ProtectedRoute>
      <SkillGapPlan />
    </ProtectedRoute>
  }
/>

      <Route path="/" element={<RootRedirect />} />
      <Route path="*" element={<RootRedirect />} />
    </Routes>
  );
}