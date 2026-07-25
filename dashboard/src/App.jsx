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

function DepartmentSelector() {
  const { setDepartment, logout } = useAuth();
  const [selected, setSelected] = useState("");

  const depts = [
    { code: "CSE", name: "Computer Science & Engineering", desc: "CS Lab 1, CS Lab 2" },
    { code: "IT", name: "Information Technology", desc: "IT Lab" },
    { code: "E&TC", name: "Electronics & Telecommunication", desc: "E&TC Lab" },
  ];

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="p-6 text-center border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">Select Department</h2>
          <p className="text-slate-500 text-xs mt-1">Please select your academic department to continue</p>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="space-y-3">
            {depts.map(d => (
              <button
                key={d.code}
                onClick={() => setSelected(d.code)}
                className={`w-full text-left p-4 rounded-xl border-2 transition-all flex items-center justify-between ${
                  selected === d.code
                    ? "border-primary-600 bg-primary-50/30 text-primary-900"
                    : "border-slate-200 hover:border-slate-350 text-slate-700 bg-white"
                }`}
              >
                <div>
                  <p className="font-semibold text-sm">{d.code} — {d.name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Assigned labs: {d.desc}</p>
                </div>
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                  selected === d.code ? "border-primary-600 bg-primary-600" : "border-slate-300"
                }`}>
                  {selected === d.code && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
              </button>
            ))}
          </div>

          <div className="mt-6 flex gap-3">
            <button onClick={logout} className="btn-secondary flex-1 justify-center text-xs py-2">
              Sign Out
            </button>
            <button
              onClick={() => setDepartment(selected)}
              disabled={!selected}
              className="btn-primary flex-1 justify-center text-xs py-2"
            >
              Confirm & Enter
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProtectedLayout({ requireAdmin = false }) {
  const { user, isAdmin } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [globalDate, setGlobalDate] = useState(todayStr());

  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (user.role === "faculty" && !user.department) return <DepartmentSelector />;
  if (requireAdmin && !isAdmin) return <Navigate to="/" replace />;

  const breadcrumbs = BREADCRUMBS[location.pathname] || [{ label: "Overview", to: "/" }, { label: location.pathname.split("/").pop() }];

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100">
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
