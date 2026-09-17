import { useMemo, useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Monitor, Clock, Activity, CheckCircle2, Edit2 } from "lucide-react";
import { formatDuration, todayStr, COLLEGE_PERIODS, formatTimeIST } from "../data/collegeConfig";
import { StatCard, ComplianceBadge, MachineStatusBadge, SectionHeading, EmptyState, PageWrapper } from "../components/Shared";
import { fetchMachines, fetchUsage, fetchLabs, deleteMachine, updateMachine } from "../api/apiClient";
import ConfirmModal from "../components/ConfirmModal";

const APP_COLORS = [
  "#2563eb", // Blue
  "#10b981", // Emerald
  "#f59e0b", // Amber
  "#8b5cf6", // Purple
  "#ec4899", // Pink
  "#06b6d4", // Cyan
  "#f97316", // Orange
];

export default function MachineDetailPage() {
  const { machineId } = useParams();
  const navigate      = useNavigate();
  const today         = todayStr();

  const [machine,  setMachine]  = useState(null);
  const [lab,      setLab]      = useState(null);
  const [allLabs,  setAllLabs]  = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState({ machine_id: "", lab_id: "", hostname: "", status: "active", regenerate_key: false });
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [newKey, setNewKey] = useState("");

  const [lastUpdated, setLastUpdated] = useState(new Date());

  const loadData = (silent = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    return Promise.all([
      fetchMachines(),
      fetchUsage({ machine_id: machineId }),
      fetchLabs(),
    ]).then(([machines, sess, labs]) => {
      const found = machines.find(m => m.machine_id === machineId) || null;
      setMachine(found);
      setSessions((sess || []).sort((a, b) => new Date(b.login_time) - new Date(a.login_time)));
      if (found) {
        setLab(labs.find(l => l.lab_id === found.lab_id) || null);
      }
      setAllLabs(labs || []);
      setLastUpdated(new Date());
      if (!silent) setLoading(false);
    }).catch(err => {
      console.error("MachineDetailPage fetch error:", err);
      if (!silent) {
        setError(err.message);
        setLoading(false);
      }
    });
  };

  useEffect(() => {
    loadData(false);
    // Poll every 10 seconds for real-time machine telemetry
    const interval = setInterval(() => {
      loadData(true);
    }, 10000);
    return () => clearInterval(interval);
  }, [machineId]);

  const activeSession = useMemo(() => sessions.find(s => !s.logout_time), [sessions]);

  const getSessionDuration = (s) => {
    if (!s.logout_time) {
      const liveSecs = Math.max(0, Math.floor((Date.now() - new Date(s.login_time).getTime()) / 1000));
      return Math.max(Number(s.total_duration || 0), liveSecs);
    }
    return Number(s.total_duration || 0);
  };

  const todaySessions = useMemo(() => sessions.filter(s => s.date === today), [sessions, today]);
  const totalActive   = useMemo(() => todaySessions.reduce((a, s) => a + getSessionDuration(s), 0), [todaySessions]);

  // App breakdown for pie chart
  const appData = useMemo(() => {
    const map = {};
    sessions.forEach(s => {
      (s.app_usages || []).forEach(a => {
        const rawName = a.app_name || "";
        if (!rawName) return;
        map[rawName] = (map[rawName] || 0) + Number(a.active_duration || 0);
      });
    });
    return Object.entries(map)
      .map(([name, val]) => ({ name: name.replace(/\.exe$/i, ""), rawName: name, duration: Number(val), value: Number(val) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [sessions]);

  // Period session count (09:15-10:15, etc.)
  const hourlyData = useMemo(() => {
    return COLLEGE_PERIODS.map(period => {
      const startMins = period.startH * 60 + period.startM;
      const endMins   = period.endH * 60 + period.endM;
      const count = todaySessions.filter(s => {
        if (!s.login_time) return false;
        const d = new Date(s.login_time);
        const mins = d.getHours() * 60 + d.getMinutes();
        return mins >= startMins && mins < endMins;
      }).length;
      return { hour: period.label, range: period.range, sessions: count };
    });
  }, [todaySessions]);

  if (loading) {
    return (
      <PageWrapper>
        <div className="flex items-center justify-center h-[calc(100vh-120px)]">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-slate-200 border-t-primary-600 rounded-full animate-spin"></div>
            <span className="text-sm text-slate-400">Loading machine…</span>
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
      <div className="page-header flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="page-title font-mono">{machine.machine_id}</h1>
            {activeSession ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                Active: {activeSession.student_name || activeSession.student_id}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] text-slate-500 bg-slate-100/80 border border-slate-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                Telemetry Live
              </span>
            )}
          </div>
          <p className="page-subtitle">
            {lab?.name} · {machine.hostname} · {machine.ip_address || "No IP logged"}
            {minAgo !== null && <span className="ml-2 text-slate-400">· last seen {minAgo}m ago</span>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            className="btn-secondary btn-sm inline-flex items-center gap-1.5"
            onClick={() => {
              setEditForm({
                machine_id: machine.machine_id,
                lab_id: machine.lab_id || "",
                hostname: machine.hostname || "",
                status: machine.status || "active",
                regenerate_key: false,
              });
              setShowEdit(true);
            }}
          >
            <Edit2 size={14} /> Edit Machine
          </button>
          <MachineStatusBadge machine={machine} activeSessions={sessions} />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Sessions Today"    value={todaySessions.length}          icon={Activity}    color="blue"  />
        <StatCard label="Active Time Today" value={formatDuration(totalActive)}   icon={Clock}       color="green" />
        <StatCard label="Total Sessions"    value={sessions.length}               icon={Monitor}     color="purple"/>
        <StatCard label="Lab"               value={lab?.name || "—"}              icon={CheckCircle2} color="slate" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* App usage breakdown */}
        <div className="card card-body">
          <div className="flex items-center justify-between mb-2">
            <SectionHeading title="App Usage Breakdown" />
            <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Live Telemetry
            </span>
          </div>
          {appData.length === 0 ? (
            <EmptyState title="No app data yet" />
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-6 pt-1">
              {/* Donut Chart with center total */}
              <div className="w-44 h-44 relative shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={appData}
                      dataKey="duration"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={48}
                      outerRadius={70}
                      paddingAngle={3}
                      stroke="#fff"
                      strokeWidth={2}
                    >
                      {appData.map((_, i) => (
                        <Cell key={i} fill={APP_COLORS[i % APP_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v, name) => [formatDuration(v), name]}
                      contentStyle={{
                        backgroundColor: "#0f172a",
                        color: "#fff",
                        borderRadius: "8px",
                        border: "none",
                        fontSize: "12px",
                        boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.2)",
                        padding: "8px 12px",
                      }}
                      itemStyle={{ color: "#f8fafc" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                {/* Center text */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-[11px] font-medium text-slate-400">Total</span>
                  <span className="text-xs font-bold text-slate-800 font-mono">
                    {formatDuration(appData.reduce((a, b) => a + (b.duration || 0), 0))}
                  </span>
                </div>
              </div>

              {/* Clean arranged breakdown list */}
              <div className="flex-1 w-full space-y-2.5">
                {appData.map((app, i) => {
                  const total = appData.reduce((a, b) => a + (b.duration || 0), 0);
                  const pct = total > 0 ? Math.round((app.duration / total) * 100) : 0;
                  return (
                    <div key={app.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-3">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
                          style={{ backgroundColor: APP_COLORS[i % APP_COLORS.length] }}
                        />
                        <span className="font-medium text-slate-700 truncate">{app.name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-slate-400 font-mono text-[11px]">{pct}%</span>
                        <span className="font-mono font-medium text-slate-600 bg-slate-50 border border-slate-100 px-2 py-0.5 rounded text-[11px]">
                          {formatDuration(app.duration)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Machine info */}
        <div className="card card-body">
          <SectionHeading title="Machine Info" />
          <dl className="divide-y divide-slate-100/60 text-sm">
            {[
              ["Machine ID",    <code key="id" className="font-mono text-xs bg-slate-50 px-1 rounded">{machine.machine_id}</code>],
              ["Hostname",      machine.hostname],
              ["IP Address",    machine.ip_address || "—"],
              ["Lab",           lab?.name || "—"],
              ["Building",      lab?.building || "—"],
              ["Live Status",   <MachineStatusBadge key="status" machine={machine} activeSessions={sessions} />],
              ["Admin Status",  <span key="adm" className="capitalize font-medium text-slate-700">{machine.status || "active"}</span>],
              ["Last Seen",     lastSeen ? lastSeen.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "Never logged in"],
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
                : sessions.slice(0, 15).map(s => {
                  const isLive = !s.logout_time;
                  return (
                    <tr key={s.session_id} className={isLive ? "bg-emerald-50/40" : ""}>
                      <td>
                        <div className="flex items-center gap-2">
                          {isLive && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>}
                          <Link to={`/students/${s.student_id}`} className="font-medium text-primary-600 hover:underline">{s.student_name || s.student_id}</Link>
                        </div>
                      </td>
                      <td className="text-xs text-slate-400">{s.date}</td>
                      <td className="text-xs">{formatTimeIST(s.login_time)}</td>
                      <td className="num">
                        {isLive ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-emerald-600">
                            {formatDuration(getSessionDuration(s))}
                          </span>
                        ) : (
                          formatDuration(s.total_duration)
                        )}
                      </td>
                      <td className="text-xs text-slate-400 max-w-[120px] truncate">{s.course_code || "—"}</td>
                      <td>
                        {isLive ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                            Active Now
                          </span>
                        ) : (
                          <ComplianceBadge status={s.compliance_status} />
                        )}
                      </td>
                    </tr>
                  );
                })
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
              onClick={() => setShowDeleteModal(true)}
              className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-medium transition-colors"
            >
              Delete Machine &amp; All Data
            </button>
          </div>
        </div>
      </div>

      {/* Edit Machine Modal */}
      {showEdit && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <h2 className="text-base font-semibold text-slate-800 mb-1">Edit Machine</h2>
            <p className="text-xs text-slate-400 mb-4 font-mono">{editForm.machine_id}</p>
            <div className="space-y-4">
              <div>
                <label className="form-label">Lab <span className="text-red-500 font-bold ml-1">*</span></label>
                <select className="form-select" value={editForm.lab_id}
                  onChange={e => setEditForm(f => ({ ...f, lab_id: e.target.value }))}>
                  {allLabs.map(l => <option key={l.lab_id} value={l.lab_id}>{l.name} ({l.lab_id})</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Windows Hostname <span className="text-red-500 font-bold ml-1">*</span></label>
                <input className="form-input font-mono" value={editForm.hostname}
                  onChange={e => setEditForm(f => ({ ...f, hostname: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">Status</label>
                <select className="form-select" value={editForm.status}
                  onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={editForm.regenerate_key}
                    onChange={e => setEditForm(f => ({ ...f, regenerate_key: e.target.checked }))}
                    className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                  />
                  Regenerate API Key (will invalidate previous key)
                </label>
              </div>
              {newKey && (
                <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200 text-xs text-emerald-800 font-mono break-all">
                  New Key: {newKey}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button className="btn-secondary" onClick={() => setShowEdit(false)} disabled={editSubmitting}>Cancel</button>
              <button
                className="btn-primary"
                onClick={async () => {
                  if (!editForm.hostname.trim() || !editForm.lab_id.trim()) {
                    alert("Hostname and Lab are required.");
                    return;
                  }
                  setEditSubmitting(true);
                  try {
                    const res = await updateMachine(editForm);
                    setMachine(prev => ({ ...prev, ...editForm }));
                    const foundLab = allLabs.find(l => l.lab_id === editForm.lab_id);
                    if (foundLab) setLab(foundLab);
                    if (res.api_key) {
                      setNewKey(res.api_key);
                      alert("Machine updated. New API key: " + res.api_key);
                    }
                    setShowEdit(false);
                  } catch (err) {
                    alert("Failed to update machine: " + err.message);
                  } finally {
                    setEditSubmitting(false);
                  }
                }}
                disabled={!editForm.hostname.trim() || !editForm.lab_id.trim() || editSubmitting}
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
        title={`Delete Machine: ${machine?.machine_id}`}
        message={`Are you sure you want to permanently delete machine "${machine?.machine_id}" (${machine?.hostname})? This will erase the machine record and ALL associated session history, app usage metrics, and activity logs.`}
        confirmLabel="Delete & Erase All Data"
        onConfirm={async () => {
          await deleteMachine(machine.machine_id);
          navigate("/admin/machines");
        }}
        onClose={() => setShowDeleteModal(false)}
      />
    </PageWrapper>
  );
}
