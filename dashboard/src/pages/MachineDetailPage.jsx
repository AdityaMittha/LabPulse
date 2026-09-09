import { useMemo, useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Monitor, Clock, Activity, CheckCircle2, Edit2 } from "lucide-react";
import { formatDuration, todayStr } from "../data/mockData";
import { StatCard, ComplianceBadge, MachineStatusBadge, SectionHeading, EmptyState, PageWrapper } from "../components/Shared";
import { fetchMachines, fetchUsage, fetchLabs, deleteMachine, updateMachine } from "../api/apiClient";
import ConfirmModal from "../components/ConfirmModal";

const APP_COLORS = ["#0d9488", "#14b8a6", "#78716c", "#d97706", "#16a34a", "#dc2626"];

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
      setAllLabs(labs);
      setLoading(false);
    }).catch(err => {
      console.error("MachineDetailPage fetch error:", err);
      if (active) { setError(err.message); setLoading(false); }
    });

    return () => { active = false; };
  }, [machineId]);

  const todaySessions = useMemo(() => sessions.filter(s => s.date === today), [sessions, today]);
  const totalActive   = todaySessions.reduce((a, s) => a + (s.total_duration || 0), 0);

  // App breakdown for pie chart
  const appData = useMemo(() => {
    const map = {};
    sessions.forEach(s => {
      (s.app_usages || []).forEach(a => {
        map[a.app_name] = (map[a.app_name] || 0) + (a.active_duration || 0);
      });
    });
    return Object.entries(map)
      .map(([name, val]) => ({ name: name.replace(".exe", ""), value: val }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [sessions]);

  // Hourly session count
  const hourlyData = useMemo(() => {
    const counts = Array(24).fill(0);
    todaySessions.forEach(s => {
      const h = new Date(s.login_time).getHours();
      if (h >= 0 && h < 24) counts[h]++;
    });
    return counts
      .map((c, h) => ({ hour: `${String(h).padStart(2, "0")}:00`, sessions: c }))
      .filter((_, h) => h >= 7 && h <= 20);
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
          <h1 className="page-title font-mono">{machine.machine_id}</h1>
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
          <MachineStatusBadge status={machine.status} />
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
