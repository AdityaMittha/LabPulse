// Main app shell with routing and layout
import { useState } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import { todayStr } from "./data/mockData";

// Pages
import LoginPage from "./pages/LoginPage";
import OverviewPage from "./pages/OverviewPage";
import LabsPage from "./pages/LabsPage";
import LabDetailPage from "./pages/LabDetailPage";
import MachineDetailPage from "./pages/MachineDetailPage";
import StudentDetailPage from "./pages/StudentDetailPage";
import CompliancePage from "./pages/CompliancePage";
import ReportsPage from "./pages/ReportsPage";
import AdminMachinesPage from "./pages/AdminMachinesPage";
import AdminStudentsPage from "./pages/AdminStudentsPage";
import AdminTimetablePage from "./pages/AdminTimetablePage";
import NotFoundPage from "./pages/NotFoundPage";

// Breadcrumb map
const BREADCRUMBS = {
  "/":                [{ label: "Overview" }],
  "/labs":            [{ label: "Overview", to: "/" }, { label: "Labs" }],
  "/compliance":      [{ label: "Overview", to: "/" }, { label: "Compliance" }],
  "/reports":         [{ label: "Overview", to: "/" }, { label: "Reports" }],
  "/admin/machines":  [{ label: "Admin" }, { label: "Machines" }],
  "/admin/students":  [{ label: "Admin" }, { label: "Students" }],
  "/admin/timetable": [{ label: "Admin" }, { label: "Timetable" }],
};

function ProtectedLayout({ requireAdmin = false }) {
  const { user, isAdmin } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [globalDate, setGlobalDate] = useState(todayStr());

  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (requireAdmin && !isAdmin) return <Navigate to="/" replace />;

  const breadcrumbs = BREADCRUMBS[location.pathname] || [{ label: "Overview", to: "/" }, { label: location.pathname.split("/").pop() }];

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar collapsed={collapsed} onCollapse={() => setCollapsed(c => !c)} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar
          onToggleSidebar={() => setCollapsed(c => !c)}
          breadcrumbs={breadcrumbs}
          dateRange={globalDate}
          onDateChange={setGlobalDate}
        />
        <main className="flex-1 overflow-y-auto">
          <Routes>
            <Route path="/" element={<OverviewPage globalDate={globalDate} />} />
            <Route path="/labs" element={<LabsPage globalDate={globalDate} />} />
            <Route path="/labs/:labId" element={<LabDetailPage globalDate={globalDate} />} />
            <Route path="/machines/:machineId" element={<MachineDetailPage />} />
            <Route path="/students/:studentId" element={<StudentDetailPage />} />
            <Route path="/compliance" element={<CompliancePage globalDate={globalDate} />} />
            <Route path="/reports" element={<ReportsPage />} />
            {isAdmin && <>
              <Route path="/admin/machines"  element={<AdminMachinesPage />} />
              <Route path="/admin/students"  element={<AdminStudentsPage />} />
              <Route path="/admin/timetable" element={<AdminTimetablePage />} />
            </>}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/*" element={<ProtectedLayout />} />
    </Routes>
  );
}
