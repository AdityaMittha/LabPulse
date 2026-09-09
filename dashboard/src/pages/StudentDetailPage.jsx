import { useMemo, useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { User, Clock, Monitor, CheckCircle2, Activity, Globe, ExternalLink, Edit2 } from "lucide-react";
import { formatDuration } from "../data/mockData";
import { StatCard, ComplianceBadge, SectionHeading, EmptyState, PageWrapper } from "../components/Shared";
import { fetchUsage, fetchStudents, fetchStudentBrowserActivity, deleteStudent, updateStudent, fetchLabs } from "../api/apiClient";
import ConfirmModal from "../components/ConfirmModal";

export default function StudentDetailPage() {
  const { studentId } = useParams();
  const navigate      = useNavigate();

  const [student,        setStudent]        = useState(null);
  const [labsMap,        setLabsMap]        = useState({});
  const [sessions,       setSessions]       = useState([]);
  const [browserData,    setBrowserData]    = useState({ sites: [], page_log: [] });
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState(null);

  const [showEdit,       setShowEdit]       = useState(false);
  const [editForm,       setEditForm]       = useState({ name: "", student_id: "", pnr_no: "", password: "", department: "", year: "", college_login: "" });
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    Promise.all([
      fetchStudents(),
      fetchUsage({ student_id: studentId }),
      fetchStudentBrowserActivity(studentId),
      fetchLabs(),
    ]).then(([students, sess, browser, labs]) => {
      if (!active) return;
      setStudent(students.find(s => s.student_id === studentId) || null);
      setSessions(sess.sort((a, b) => new Date(b.login_time) - new Date(a.login_time)));
      setBrowserData(browser);
      const map = {};
      labs.forEach(l => { map[l.lab_id] = l; });
      setLabsMap(map);
      setLoading(false);
    }).catch(err => {
      console.error("StudentDetailPage fetch error:", err);
      if (active) { setError(err.message); setLoading(false); }
    });

    return () => { active = false; };
  }, [studentId]);

  const complianceCount = useMemo(() => ({
    compliant:     sessions.filter(s => s.compliance_status === "compliant").length,
    partial:       sessions.filter(s => s.compliance_status === "partial").length,
    non_compliant: sessions.filter(s => s.compliance_status === "non_compliant").length,
  }), [sessions]);

  const compliancePct = sessions.length > 0
    ? Math.round((complianceCount.compliant / sessions.length) * 100) : 0;

  const totalTime = sessions.reduce((a, s) => a + (s.total_duration || 0), 0);

  // Per-day session count for bar chart
  const dailyData = useMemo(() => {
    const map = {};
    sessions.forEach(s => { map[s.date] = (map[s.date] || 0) + 1; });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date: date.slice(5), count }));
  }, [sessions]);

  // Top apps aggregated from session app_usages if available
  const topApps = useMemo(() => {
    const map = {};
    sessions.forEach(s => {
      (s.app_usages || []).forEach(a => {
        map[a.app_name] = (map[a.app_name] || 0) + (a.active_duration || 0);
      });
    });
    return Object.entries(map)
      .map(([name, dur]) => ({ name: name.replace(".exe", ""), dur }))
      .sort((a, b) => b.dur - a.dur)
      .slice(0, 5);
  }, [sessions]);

  if (loading) {
    return (
      <PageWrapper>
        <div className="flex items-center justify-center h-[calc(100vh-120px)]">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-slate-200 border-t-primary-600 rounded-full animate-spin"></div>
            <span className="text-sm text-slate-400">Loading student profile…</span>
          </div>
        </div>
      </PageWrapper>
    );
  }

  if (error) {
    return (
      <PageWrapper>
        <div className="flex items-center justify-center h-[calc(100vh-120px)]">
          <div className="text-center">
            <p className="text-red-500 font-medium text-sm">Failed to load student data</p>
            <p className="text-slate-400 text-xs mt-1">{error}</p>
          </div>
        </div>
      </PageWrapper>
    );
  }

  if (!student) {
    return <PageWrapper><EmptyState title="Student not found" description="This student ID doesn't exist in the system." /></PageWrapper>;
  }

  return (
    <PageWrapper>
      {/* Header */}
      <div className="page-header flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 font-semibold text-base">
            {student.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
          </div>
          <div>
            <h1 className="page-title">{student.name}</h1>
            <p className="page-subtitle">{student.student_id} · {student.department} · {student.year}{student.college_login ? ` · ${student.college_login}` : ""}</p>
          </div>
        </div>
        <button
          className="btn-secondary btn-sm inline-flex items-center gap-1.5"
          onClick={() => {
            setEditForm({
              name: student.name || "",
              student_id: student.student_id || student.pnr_no || "",
              pnr_no: student.student_id || student.pnr_no || "",
              password: "",
              department: student.department || "CSE",
              year: student.year || "BE",
              college_login: student.college_login || "",
            });
            setShowEdit(true);
          }}
        >
          <Edit2 size={14} /> Edit Student
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Sessions"    value={sessions.length}             icon={Activity}    color="blue"   />
        <StatCard label="Total Lab Time"    value={formatDuration(totalTime)}   icon={Clock}       color="green"  />
        <StatCard label="Compliance Rate"   value={`${compliancePct}%`}         icon={CheckCircle2} color="purple" />
        <StatCard label="Sites Visited"     value={browserData.sites.length}    icon={Globe}        color="amber"  />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Activity trend */}
        <div className="card card-body">
          <SectionHeading title="Daily Sessions" />
          {dailyData.length === 0
            ? <EmptyState title="No sessions found" />
            : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={dailyData} margin={{ top: 4, right: 8, bottom: 0, left: -24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#78716c" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#78716c" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ border: "1px solid #e7e5e4", borderRadius: 10, fontSize: 12 }} cursor={{ fill: "#f5f5f4" }} />
                  <Bar dataKey="count" fill="#0d9488" radius={[4, 4, 0, 0]} name="Sessions" />
                </BarChart>
              </ResponsiveContainer>
            )
          }
        </div>

        {/* Compliance + Top apps */}
        <div className="space-y-4">
          {/* Compliance breakdown */}
          <div className="card card-body">
            <SectionHeading title="Compliance Breakdown" />
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-emerald-50 rounded-lg p-3">
                <p className="text-2xl font-semibold text-emerald-600">{complianceCount.compliant}</p>
                <p className="text-xs text-emerald-700 mt-0.5">Compliant</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-3">
                <p className="text-2xl font-semibold text-amber-600">{complianceCount.partial}</p>
                <p className="text-xs text-amber-700 mt-0.5">Partial</p>
              </div>
              <div className="bg-red-50 rounded-lg p-3">
                <p className="text-2xl font-semibold text-red-500">{complianceCount.non_compliant}</p>
                <p className="text-xs text-red-700 mt-0.5">Non-compliant</p>
              </div>
            </div>
          </div>

          {/* Top apps */}
          <div className="card card-body">
            <SectionHeading title="Top Apps Used" />
            <div className="space-y-2">
              {topApps.length === 0
                ? <p className="text-sm text-slate-400 text-center py-4">No app usage data available</p>
                : topApps.map((app, i) => {
                  const maxDur = topApps[0].dur;
                  return (
                    <div key={app.name} className="flex items-center gap-3">
                      <span className="text-xs text-slate-400 w-4">{i+1}</span>
                      <span className="text-sm text-slate-700 flex-1 truncate">{app.name}</span>
                      <div className="w-24 h-1 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-primary-500 rounded-full" style={{ width: `${(app.dur/maxDur)*100}%` }} />
                      </div>
                      <span className="text-xs font-mono text-slate-500 w-14 text-right">{formatDuration(app.dur)}</span>
                    </div>
                  );
                })
              }
            </div>
          </div>
        </div>
      </div>

      {/* Browser Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Top Sites */}
        <div className="card card-body">
          <SectionHeading title="Top Websites Visited" />
          <div className="space-y-2.5">
            {browserData.sites.length === 0
              ? <p className="text-sm text-slate-400 text-center py-4">No browser data</p>
              : browserData.sites.map((site, i) => {
                const maxDur = browserData.sites[0].active_duration;
                return (
                  <div key={site.domain} className="flex items-center gap-3">
                    <span className="text-xs text-slate-400 w-4 shrink-0">{i+1}</span>
                    <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="text-sm text-slate-700 flex-1 truncate font-medium">{site.domain}</span>
                    <div className="w-20 h-1 bg-slate-100 rounded-full overflow-hidden shrink-0">
                      <div className="h-full bg-primary-500 rounded-full" style={{ width: `${(site.active_duration / maxDur) * 100}%` }} />
                    </div>
                    <span className="text-xs font-mono text-slate-500 w-12 text-right shrink-0">{formatDuration(site.active_duration)}</span>
                    <span className="text-[10px] text-slate-400 w-8 text-right shrink-0">{site.visit_count}×</span>
                  </div>
                );
              })
            }
          </div>
        </div>

        {/* Recent Page Log */}
        <div className="card card-body">
          <SectionHeading title="Recent Page Visits" />
          <div className="space-y-2">
            {browserData.page_log.length === 0
              ? <p className="text-sm text-slate-400 text-center py-4">No page log data</p>
              : browserData.page_log.slice(0, 10).map((entry, i) => (
                <div key={i} className="flex items-start gap-2.5 py-1.5 border-b border-slate-50 last:border-0">
                  <div className="w-5 h-5 rounded bg-slate-50 flex items-center justify-center shrink-0 mt-0.5">
                    <Globe className="w-3 h-3 text-slate-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-700 truncate font-medium">{entry.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-primary-600 truncate max-w-[180px]">{entry.domain}</span>
                      <span className="text-[10px] text-slate-300">·</span>
                      <span className="text-[10px] text-slate-400">{entry.browser}</span>
                      <span className="text-[10px] text-slate-300">·</span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(entry.timestamp).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  </div>
                  {entry.url && (
                    <a href={entry.url} target="_blank" rel="noopener noreferrer"
                       className="text-slate-300 hover:text-primary-500 transition-colors shrink-0 mt-1">
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              ))
            }
          </div>
        </div>
      </div>

      {/* Session history */}
      <div className="card">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-semibold text-sm text-slate-700">Session History</h3>
          <span className="text-xs text-slate-400">{sessions.length} sessions</span>
        </div>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr><th>Date</th><th>Lab</th><th>Machine</th><th>Login</th><th>Duration</th><th>Course</th><th>Compliance</th></tr>
            </thead>
            <tbody>
              {sessions.length === 0
                ? <tr><td colSpan={7} className="text-center text-slate-400 py-8">No lab sessions found for this student.</td></tr>
                : sessions.slice(0, 15).map(s => (
                  <tr key={s.session_id}>
                    <td className="text-xs text-slate-400">{s.date}</td>
                    <td className="text-xs">{labsMap[s.lab_id]?.name || s.lab_id}</td>
                    <td><Link to={`/machines/${s.machine_id}`} className="font-mono text-xs text-primary-600 hover:underline">{s.machine_id}</Link></td>
                    <td className="text-xs">{new Date(s.login_time).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}</td>
                    <td className="num">{formatDuration(s.total_duration)}</td>
                    <td className="text-xs text-slate-400 max-w-[100px] truncate">{s.course_code}</td>
                    <td><ComplianceBadge status={s.compliance_status} /></td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="card mt-6 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-sm text-red-600">Danger Zone</h3>
        </div>
        <div className="p-5">
          <p className="text-xs text-red-600 font-medium">Permanently Delete Student Record</p>
          <p className="text-xs text-slate-500 mt-1">
            This action cannot be undone. It will permanently delete student <strong>{student.name} ({student.student_id})</strong> and purge all associated session logs, app usage metrics, and behavior history.
          </p>
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={() => setShowDeleteModal(true)}
              className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-medium transition-colors"
            >
              Delete Student &amp; All Data
            </button>
          </div>
        </div>
      </div>

      {/* Edit Student Modal */}
      {showEdit && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <h2 className="text-base font-semibold text-slate-800 mb-1">Edit Student</h2>
            <p className="text-xs text-slate-400 mb-4 font-mono">{editForm.student_id}</p>
            <div className="space-y-3">
              <div>
                <label className="form-label">Name <span className="text-red-500 font-bold">*</span></label>
                <input
                  type="text"
                  className="form-input"
                  value={editForm.name}
                  onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div>
                <label className="form-label">Email <span className="text-xs text-slate-400 font-normal">(Optional)</span></label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="name@college.ac.in (optional)"
                  value={editForm.college_login}
                  onChange={e => setEditForm(f => ({ ...f, college_login: e.target.value }))}
                />
              </div>
              <div>
                <label className="form-label">Password <span className="text-xs text-slate-400 font-normal">(Leave blank to keep unchanged)</span></label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="New password (optional)"
                  value={editForm.password}
                  onChange={e => setEditForm(f => ({ ...f, password: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Department <span className="text-red-500 font-bold">*</span></label>
                  <input
                    type="text"
                    className="form-input"
                    value={editForm.department}
                    onChange={e => setEditForm(f => ({ ...f, department: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="form-label">Year <span className="text-red-500 font-bold">*</span></label>
                  <input
                    type="text"
                    className="form-input"
                    value={editForm.year}
                    onChange={e => setEditForm(f => ({ ...f, year: e.target.value }))}
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button className="btn-secondary" onClick={() => setShowEdit(false)} disabled={editSubmitting}>Cancel</button>
              <button
                className="btn-primary"
                onClick={async () => {
                  if (!editForm.name.trim()) {
                    alert("Name is required.");
                    return;
                  }
                  if (editForm.college_login.trim() && !editForm.college_login.includes("@")) {
                    alert("Please enter a valid email address or leave it blank.");
                    return;
                  }
                  setEditSubmitting(true);
                  try {
                    await updateStudent(editForm);
                    setStudent(prev => ({ ...prev, ...editForm }));
                    setShowEdit(false);
                  } catch (err) {
                    alert("Failed to update student: " + err.message);
                  } finally {
                    setEditSubmitting(false);
                  }
                }}
                disabled={!editForm.name.trim() || editSubmitting}
              >
                {editSubmitting ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      <ConfirmModal
        isOpen={showDeleteModal}
        title={`Delete Student: ${student?.name || student?.student_id}`}
        message={`Are you sure you want to permanently delete student "${student?.name}" (${student?.student_id})? This will erase the student record and ALL associated session history, app usage metrics, and activity logs.`}
        confirmLabel="Delete & Erase All Data"
        onConfirm={async () => {
          await deleteStudent(student.student_id);
          navigate("/admin/students");
        }}
        onClose={() => setShowDeleteModal(false)}
      />
    </PageWrapper>
  );
}
