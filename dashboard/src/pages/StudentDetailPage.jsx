import { useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { User, Clock, Monitor, CheckCircle2, Activity, Globe, ExternalLink } from "lucide-react";
import { students, sessions, appUsages, behaviorMetrics, labs, machines, todayStr, formatDuration, getStudentBrowserActivity } from "../data/mockData";
import { StatCard, ComplianceBadge, SectionHeading, EmptyState, PageWrapper } from "../components/Shared";
import { deleteStudent } from "../api/apiClient";

export default function StudentDetailPage() {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const student = useMemo(() => students.find(s => s.student_id === studentId), [studentId]);

  const studentSessions = useMemo(
    () => sessions.filter(s => s.student_id === studentId).sort((a, b) => new Date(b.login_time) - new Date(a.login_time)),
    [studentId]
  );

  const complianceCount = {
    compliant:     studentSessions.filter(s => s.compliance_status === "compliant").length,
    partial:       studentSessions.filter(s => s.compliance_status === "partial").length,
    non_compliant: studentSessions.filter(s => s.compliance_status === "non_compliant").length,
  };
  const compliancePct = studentSessions.length > 0
    ? Math.round((complianceCount.compliant / studentSessions.length) * 100) : 0;

  const totalTime = studentSessions.reduce((a, s) => a + (s.total_duration || 0), 0);

  // Per-day session count for bar chart
  const dailyData = useMemo(() => {
    const map = {};
    studentSessions.forEach(s => {
      map[s.date] = (map[s.date] || 0) + 1;
    });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date: date.slice(5), count }));
  }, [studentSessions]);

  // Top apps
  const topApps = useMemo(() => {
    const map = {};
    studentSessions.forEach(s => {
      (appUsages[s.session_id] || []).forEach(a => {
        map[a.app_name] = (map[a.app_name] || 0) + a.active_duration;
      });
    });
    return Object.entries(map)
      .map(([name, dur]) => ({ name: name.replace(".exe",""), dur }))
      .sort((a, b) => b.dur - a.dur)
      .slice(0, 5);
  }, [studentSessions]);

  // Browser activity
  const browserData = useMemo(() => getStudentBrowserActivity(studentId), [studentId]);

  if (!student) {
    return <PageWrapper><EmptyState title="Student not found" description="This student ID doesn't exist in the system." /></PageWrapper>;
  }

  return (
    <PageWrapper>
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center text-primary-700 font-bold text-lg">
            {student.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
          </div>
          <div>
            <h1 className="page-title">{student.name}</h1>
            <p className="page-subtitle">{student.student_id} · {student.department} · {student.year} · {student.college_login}</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Sessions"    value={studentSessions.length}     icon={Activity}    color="blue"   />
        <StatCard label="Total Lab Time"    value={formatDuration(totalTime)}  icon={Clock}       color="green"  />
        <StatCard label="Compliance Rate"   value={`${compliancePct}%`}        icon={CheckCircle2} color="purple" />
        <StatCard label="Sites Visited"     value={browserData.sites.length}   icon={Globe}        color="amber"  />
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
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748B" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#64748B" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 12 }} cursor={{ fill: "#F1F5F9" }} />
                  <Bar dataKey="count" fill="#2563EB" radius={[4, 4, 0, 0]} name="Sessions" />
                </BarChart>
              </ResponsiveContainer>
            )
          }
        </div>

        {/* Top apps + compliance */}
        <div className="space-y-4">
          {/* Compliance breakdown */}
          <div className="card card-body">
            <SectionHeading title="Compliance Breakdown" />
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-green-50 rounded-lg p-3">
                <p className="text-2xl font-bold text-green-600">{complianceCount.compliant}</p>
                <p className="text-xs text-green-700 mt-0.5">Compliant</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-3">
                <p className="text-2xl font-bold text-amber-600">{complianceCount.partial}</p>
                <p className="text-xs text-amber-700 mt-0.5">Partial</p>
              </div>
              <div className="bg-red-50 rounded-lg p-3">
                <p className="text-2xl font-bold text-red-500">{complianceCount.non_compliant}</p>
                <p className="text-xs text-red-700 mt-0.5">Absent</p>
              </div>
            </div>
          </div>

          {/* Top apps */}
          <div className="card card-body">
            <SectionHeading title="Top Apps Used" />
            <div className="space-y-2">
              {topApps.length === 0
                ? <p className="text-sm text-slate-400 text-center py-4">No app data</p>
                : topApps.map((app, i) => {
                  const maxDur = topApps[0].dur;
                  return (
                    <div key={app.name} className="flex items-center gap-3">
                      <span className="text-xs text-slate-500 w-4">{i+1}</span>
                      <span className="text-sm text-slate-800 flex-1 truncate">{app.name}</span>
                      <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-primary-500 rounded-full" style={{ width: `${(app.dur/maxDur)*100}%` }} />
                      </div>
                      <span className="text-xs font-mono text-slate-600 w-14 text-right">{formatDuration(app.dur)}</span>
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
                    <Globe className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    <span className="text-sm text-slate-800 flex-1 truncate font-medium">{site.domain}</span>
                    <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden shrink-0">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(site.active_duration / maxDur) * 100}%` }} />
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
                  <div className="w-5 h-5 rounded bg-blue-50 flex items-center justify-center shrink-0 mt-0.5">
                    <Globe className="w-3 h-3 text-blue-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-800 truncate font-medium">{entry.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-blue-600 truncate max-w-[180px]">{entry.domain}</span>
                      <span className="text-[10px] text-slate-400">·</span>
                      <span className="text-[10px] text-slate-400">{entry.browser}</span>
                      <span className="text-[10px] text-slate-400">·</span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(entry.timestamp).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  </div>
                  {entry.url && (
                    <a href={entry.url} target="_blank" rel="noopener noreferrer"
                       className="text-slate-300 hover:text-blue-500 transition-colors shrink-0 mt-1">
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
          <h3 className="font-semibold text-sm text-slate-900">Session History</h3>
          <span className="text-xs text-slate-400">{studentSessions.length} sessions</span>
        </div>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr><th>Date</th><th>Lab</th><th>Machine</th><th>Login</th><th>Duration</th><th>Course</th><th>Compliance</th></tr>
            </thead>
            <tbody>
              {studentSessions.length === 0
                ? <tr><td colSpan={7} className="text-center text-slate-400 py-8">No lab sessions found for this student.</td></tr>
                : studentSessions.slice(0, 15).map(s => (
                  <tr key={s.session_id}>
                    <td className="text-xs text-slate-500">{s.date}</td>
                    <td className="text-xs">{labs.find(l=>l.lab_id===s.lab_id)?.name || s.lab_id}</td>
                    <td><Link to={`/machines/${s.machine_id}`} className="font-mono text-xs text-primary-600 hover:underline">{s.machine_id}</Link></td>
                    <td className="text-xs">{new Date(s.login_time).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}</td>
                    <td className="num">{formatDuration(s.total_duration)}</td>
                    <td className="text-xs text-slate-500 max-w-[100px] truncate">{s.course_code}</td>
                    <td><ComplianceBadge status={s.compliance_status} /></td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="card border-red-200 bg-red-50/20 mt-6 overflow-hidden">
        <div className="px-5 py-4 border-b border-red-100 bg-red-50/50 flex items-center justify-between">
          <h3 className="font-semibold text-sm text-red-800">Danger Zone</h3>
        </div>
        <div className="p-5">
          <p className="text-xs text-red-600 font-medium">Permanently Delete Student Record</p>
          <p className="text-xs text-slate-500 mt-1">
            This action cannot be undone. It will permanently delete student <strong>{student.name} ({student.student_id})</strong> and purge all associated session logs, app usage metrics, and behavior history.
          </p>
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={async () => {
                const conf = window.prompt(`To confirm deletion, type the student ID "${student.student_id}":`);
                if (conf === student.student_id) {
                  try {
                    await deleteStudent(student.student_id);
                    alert("Student and all associated data successfully deleted.");
                    navigate("/admin/students");
                  } catch (err) {
                    alert("Failed to delete student: " + err.message);
                  }
                } else if (conf !== null) {
                  alert("Incorrect student ID. Deletion cancelled.");
                }
              }}
              className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-semibold shadow transition-colors"
            >
              Delete Student & All Data
            </button>
          </div>
        </div>
      </div>
    </PageWrapper>
  );
}
