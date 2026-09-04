import { useMemo, useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Monitor, Clock, Activity, CheckCircle2 } from "lucide-react";
import { formatDuration, todayStr } from "../data/mockData";
import { StatCard, ComplianceBadge, MachineStatusBadge, SectionHeading, EmptyState, PageWrapper } from "../components/Shared";
import { fetchMachines, fetchUsage, fetchLabs, deleteMachine } from "../api/apiClient";

const APP_COLORS = ["#0d9488", "#14b8a6", "#78716c", "#d97706", "#16a34a", "#dc2626"];

export default function MachineDetailPage() {
  const { machineId } = useParams();
  const navigate      = useNavigate();
  const today         = todayStr();

  const [machine,  setMachine]  = useState(null);
  const [lab,      setLab]      = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    Promise.all([
      fetchMachines(),
      fetchUsage({ machine_id: machineId }),
      fetchLabs(),
    ]).then(([machines, sess, labs]) => {
      if (!active) return;
      const found = machines.find(m => m.machine_id === machineId) || null;
      setMachine(found);
      setSessions(sess.sort((a, b) => new Date(b.login_time) - new Date(a.login_time)));
      if (found) {
        setLab(labs.find(l => l.lab_id === found.lab_id) || null);
      }
      setLoading(false);
    }).catch(err => {
      console.error("MachineDetailPage fetch error:", err);
      if (active) { setError(err.message); setLoading(false); }
    });

    return () => { active = false; };
  }, [machineId]);

  const todaySessions = useMemo(
    () => sessions.filter(s => s.date === today),
    [sessions, today]
  );

  const totalActive = todaySessions.reduce((a, s) => a + (s.total_duration || 0), 0);

  // App usage breakdown aggregated from session data
  const appData = useMemo(() => {
    const map = {};
    sessions.slice(0, 20).forEach(s => {
      (s.app_usages || []).forEach(a => {
        map[a.app_name] = (map[a.app_name] || 0) + (a.active_duration || 0);
      });
    });
    return Object.entries(map)
      .map(([name, duration]) => ({ name, duration }))
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 6);
  }, [sessions]);

  if (loading) {
    return (
      <PageWrapper>
        <div className="flex items-center justify-center h-[calc(100vh-120px)]">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-slate-200 border-t-primary-600 rounded-full animate-spin"></div>
            <span className="text-sm text-slate-400">Loading machine details…</span>
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
            <p className="text-red-500 font-medium text-sm">Failed to load machine data</p>
            <p className="text-slate-400 text-xs mt-1">{error}</p>
          </div>
        </div>
      </PageWrapper>
    );
  }

  if (!machine) {
    return <PageWrapper><EmptyState title="Machine not found" description="This machine doesn't exist or has been removed." /></PageWrapper>;
  }

  const lastSeen = machine.last_seen_at ? new Date(machine.last_seen_at) : null;
  const minAgo   = lastSeen ? Math.round((Date.now() - lastSeen) / 60000) : null;

  return (
    <PageWrapper>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title font-mono">{machine.machine_id}</h1>
          <p className="page-subtitle">
            {lab?.name} · {machine.hostname} · {machine.ip_address}
            {minAgo !== null && <span className="ml-2 text-slate-400">· last seen {minAgo}m ago</span>}
          </p>
        </div>
        <MachineStatusBadge status={machine.status} />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Sessions Today"    value={todaySessions.length}          icon={Activity}    color="blue"  />
        <StatCard label="Active Time Today" value={formatDuration(totalActive)}   icon={Clock}       color="green" />
        <StatCard label="Total Sessions"    value={sessions.length}               icon={Monitor}     color="purple"/>
        <StatCard label="Lab"               value={lab?.name || "—"}              icon={CheckCircle2} color="slate" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* App usage pie */}
        <div className="card card-body">
          <SectionHeading title="App Usage Breakdown" />
          {appData.length === 0
            ? <EmptyState title="No app data yet" />
            : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={appData} dataKey="duration" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={e => e.name.replace(".exe","")}>
                    {appData.map((_, i) => <Cell key={i} fill={APP_COLORS[i % APP_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={v => formatDuration(v)} contentStyle={{ border:"1px solid #e7e5e4", borderRadius:10, fontSize:12 }} />
                  <Legend formatter={v => v.replace(".exe","")} iconSize={10} wrapperStyle={{ fontSize:11 }} />
                </PieChart>
              </ResponsiveContainer>
            )
          }
        </div>

        {/* Machine info */}
        <div className="card card-body">
          <SectionHeading title="Machine Info" />
          <dl className="divide-y divide-slate-100/60 text-sm">
            {[
              ["Machine ID", <code key="id" className="font-mono text-xs bg-slate-50 px-1 rounded">{machine.machine_id}</code>],
              ["Hostname",   machine.hostname],
              ["IP Address", machine.ip_address || "—"],
              ["Lab",        lab?.name || "—"],
              ["Building",   lab?.building || "—"],
              ["Status",     <MachineStatusBadge key="status" status={machine.status} />],
              ["Last Seen",  lastSeen?.toLocaleString("en-IN") || "—"],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center py-2.5 gap-4">
                <dt className="w-32 text-slate-400 shrink-0 text-xs font-medium">{label}</dt>
                <dd className="text-slate-800">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {/* Session history */}
      <div className="card">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-semibold text-sm text-slate-700">Session History</h3>
          <span className="text-xs text-slate-400">{sessions.length} total</span>
        </div>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Date</th>
                <th>Login</th>
                <th>Duration</th>
                <th>Course</th>
                <th>Compliance</th>
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0
                ? <tr><td colSpan={6} className="text-center text-slate-400 py-8">No sessions found for this machine.</td></tr>
                : sessions.slice(0, 15).map(s => (
                  <tr key={s.session_id}>
                    <td><Link to={`/students/${s.student_id}`} className="font-medium text-primary-600 hover:underline">{s.student_name}</Link></td>
                    <td className="text-xs text-slate-400">{s.date}</td>
                    <td className="text-xs">{new Date(s.login_time).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}</td>
                    <td className="num">{formatDuration(s.total_duration)}</td>
                    <td className="text-xs text-slate-400 max-w-[120px] truncate">{s.course_code}</td>
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
          <p className="text-xs text-red-600 font-medium">Permanently Delete Machine Record</p>
          <p className="text-xs text-slate-500 mt-1">
            This action cannot be undone. It will permanently delete machine <strong>{machine.machine_id} ({machine.hostname})</strong> and purge all associated session logs, app usage metrics, and behavior history.
          </p>
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={async () => {
                const conf = window.prompt(`To confirm deletion, type the machine ID "${machine.machine_id}":`);
                if (conf === machine.machine_id) {
                  try {
                    await deleteMachine(machine.machine_id);
                    alert("Machine and all associated data successfully deleted.");
                    navigate("/admin/machines");
                  } catch (err) {
                    alert("Failed to delete machine: " + err.message);
                  }
                } else if (conf !== null) {
                  alert("Incorrect machine ID. Deletion cancelled.");
                }
              }}
              className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-medium transition-colors"
            >
              Delete Machine &amp; All Data
            </button>
          </div>
        </div>
      </div>
    </PageWrapper>
  );
}
