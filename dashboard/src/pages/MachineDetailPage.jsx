import { useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Monitor, Clock, Activity, CheckCircle2 } from "lucide-react";
import { machines, sessions, appUsages, labs, todayStr, formatDuration } from "../data/mockData";
import { StatCard, ComplianceBadge, MachineStatusBadge, SectionHeading, EmptyState, PageWrapper } from "../components/Shared";
import { deleteMachine } from "../api/apiClient";

const APP_COLORS = ["#2563EB", "#0EA5E9", "#8B5CF6", "#F59E0B", "#10B981", "#F43F5E"];

export default function MachineDetailPage() {
  const { machineId } = useParams();
  const navigate = useNavigate();
  const machine = useMemo(() => machines.find(m => m.machine_id === machineId), [machineId]);
  const lab     = useMemo(() => machine ? labs.find(l => l.lab_id === machine.lab_id) : null, [machine]);
  const today   = todayStr();

  const machineSessions = useMemo(
    () => sessions.filter(s => s.machine_id === machineId).sort((a, b) => new Date(b.login_time) - new Date(a.login_time)),
    [machineId]
  );

  const todaySessions = machineSessions.filter(s => s.date === today);
  const totalActive = todaySessions.reduce((a, s) => a + (s.total_duration || 0), 0);

  // App usage breakdown across all sessions
  const appData = useMemo(() => {
    const map = {};
    machineSessions.slice(0, 20).forEach(s => {
      (appUsages[s.session_id] || []).forEach(a => {
        map[a.app_name] = (map[a.app_name] || 0) + a.active_duration;
      });
    });
    return Object.entries(map)
      .map(([name, duration]) => ({ name, duration }))
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 6);
  }, [machineSessions]);

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
        <StatCard label="Sessions Today"   value={todaySessions.length}          icon={Activity}    color="blue"  />
        <StatCard label="Active Time Today" value={formatDuration(totalActive)}   icon={Clock}       color="green" />
        <StatCard label="Total Sessions"   value={machineSessions.length}        icon={Monitor}     color="purple"/>
        <StatCard label="Lab"             value={lab?.name || "—"}              icon={CheckCircle2} color="slate" />
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
                  <Tooltip formatter={v => formatDuration(v)} contentStyle={{ border:"1px solid #E2E8F0", borderRadius:8, fontSize:12 }} />
                  <Legend formatter={v => v.replace(".exe","")} iconSize={10} wrapperStyle={{ fontSize:11 }} />
                </PieChart>
              </ResponsiveContainer>
            )
          }
        </div>

        {/* Machine info */}
        <div className="card card-body">
          <SectionHeading title="Machine Info" />
          <dl className="divide-y divide-slate-100 text-sm">
            {[
              ["Machine ID", <code className="font-mono text-xs bg-slate-50 px-1 rounded">{machine.machine_id}</code>],
              ["Hostname",   machine.hostname],
              ["IP Address", machine.ip_address],
              ["Lab",        lab?.name || "—"],
              ["Building",   lab?.building],
              ["Status",     <MachineStatusBadge status={machine.status} />],
              ["Last Seen",  lastSeen?.toLocaleString("en-IN") || "—"],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center py-2.5 gap-4">
                <dt className="w-32 text-slate-500 shrink-0 text-xs font-medium">{label}</dt>
                <dd className="text-slate-900">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {/* Session history */}
      <div className="card">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-semibold text-sm text-slate-900">Session History</h3>
          <span className="text-xs text-slate-400">{machineSessions.length} total</span>
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
              {machineSessions.length === 0
                ? <tr><td colSpan={6} className="text-center text-slate-400 py-8">No sessions found for this machine.</td></tr>
                : machineSessions.slice(0, 15).map(s => (
                  <tr key={s.session_id}>
                    <td><Link to={`/students/${s.student_id}`} className="font-medium text-primary-600 hover:underline">{s.student_name}</Link></td>
                    <td className="text-xs text-slate-500">{s.date}</td>
                    <td className="text-xs">{new Date(s.login_time).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}</td>
                    <td className="num">{formatDuration(s.total_duration)}</td>
                    <td className="text-xs text-slate-500 max-w-[120px] truncate">{s.course_code}</td>
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
              className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-semibold shadow transition-colors"
            >
              Delete Machine & All Data
            </button>
          </div>
        </div>
      </div>
    </PageWrapper>
  );
}
