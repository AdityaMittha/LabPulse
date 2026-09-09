import { useState, useMemo, useEffect } from "react";
import { Plus, Search, Trash2, Edit2, Copy, Check, ChevronDown, ChevronRight, Monitor, Wifi, WifiOff, Server } from "lucide-react";
import { MachineStatusBadge, PageWrapper, getMachineStatus } from "../components/Shared";
import { Link } from "react-router-dom";
import { fetchMachines, fetchLabs, fetchUsage, addMachine, updateMachine, deleteMachine, copyToClipboard } from "../api/apiClient";
import ConfirmModal from "../components/ConfirmModal";

const STATUSES     = ["online", "offline", "inactive"];
const STATUS_LABELS = { online: "Online Machines", offline: "Offline Machines", inactive: "Disabled / Inactive Machines" };

const STATUS_COLORS = {
  online:   "bg-emerald-50 text-emerald-700",
  offline:  "bg-slate-100 text-slate-600",
  inactive: "bg-red-50 text-red-600",
};

export default function AdminMachinesPage() {
  const [labs,           setLabs]           = useState([]);
  const [machines,       setMachines]       = useState([]);
  const [activeSessions, setActiveSessions] = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState(null);
  const [search,         setSearch]         = useState("");
  const [labFilter,      setLabFilter]      = useState("ALL");
  const [statusFilter,   setStatusFilter]   = useState("ALL");
  const [showAddModal,   setShowAddModal]   = useState(false);
  const [newKey,         setNewKey]         = useState("");
  const [copied,         setCopied]         = useState(false);
  const [submitting,     setSubmitting]     = useState(false);
  const [form, setForm] = useState({ machine_id: "", lab_id: "", hostname: "" });

  const [expandedLabs,     setExpandedLabs]     = useState(() => new Set());
  const [expandedStatuses, setExpandedStatuses] = useState(() => new Set());

  // Load labs, machines, and today's sessions from API
  useEffect(() => {
    setLoading(true);
    setError(null);
    const today = new Date().toISOString().slice(0, 10);
    Promise.all([fetchLabs(), fetchMachines(), fetchUsage({ date: today }).catch(() => [])])
      .then(([labsList, machList, sessionsList]) => {
        setLabs(labsList);
        setMachines(machList);
        setActiveSessions(sessionsList || []);
        if (labsList.length > 0) {
          setExpandedLabs(new Set(labsList.map(l => l.lab_id)));
          setForm(f => ({ ...f, lab_id: labsList[0].lab_id }));
        }
        setLoading(false);
      })
      .catch(err => { setError(err.message); setLoading(false); });
  }, []);

  const toggleLab = labId => {
    setExpandedLabs(prev => {
      const next = new Set(prev);
      next.has(labId) ? next.delete(labId) : next.add(labId);
      return next;
    });
  };

  const toggleStatus = key => {
    setExpandedStatuses(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const filtered = useMemo(() => machines.filter(m => {
    const liveStatus = getMachineStatus(m, activeSessions);
    const matchesLab = labFilter === "ALL" || m.lab_id === labFilter;
    const matchesStatus = statusFilter === "ALL" ||
      (statusFilter === "active" ? m.status === "active" :
       statusFilter === "inactive" ? m.status === "inactive" :
       statusFilter === liveStatus);
    const matchesSearch = m.machine_id.toLowerCase().includes(search.toLowerCase()) ||
      (m.hostname || "").toLowerCase().includes(search.toLowerCase());
    return matchesLab && matchesStatus && matchesSearch;
  }), [machines, labFilter, statusFilter, search, activeSessions]);

  const grouped = useMemo(() => {
    const map = {};
    labs.forEach(l => {
      map[l.lab_id] = {};
      STATUSES.forEach(s => { map[l.lab_id][s] = []; });
    });
    filtered.forEach(m => {
      const liveStatus = getMachineStatus(m, activeSessions);
      if (map[m.lab_id]) {
        if (map[m.lab_id][liveStatus]) {
          map[m.lab_id][liveStatus].push(m);
        } else {
          map[m.lab_id].offline.push(m);
        }
      }
    });
    return map;
  }, [filtered, labs, activeSessions]);

  const labCounts = useMemo(() => {
    const counts = {};
    labs.forEach(l => {
      const labMachines = machines.filter(m => m.lab_id === l.lab_id);
      const onlineCount = labMachines.filter(m => getMachineStatus(m, activeSessions) === "online").length;
      const offlineCount = labMachines.filter(m => getMachineStatus(m, activeSessions) === "offline").length;
      const inactiveCount = labMachines.filter(m => m.status === "inactive").length;
      counts[l.lab_id] = {
        total:    labMachines.length,
        online:   onlineCount,
        offline:  offlineCount,
        inactive: inactiveCount,
      };
    });
    return counts;
  }, [machines, labs, activeSessions]);

  const handleAdd = async () => {
    if (!form.machine_id.trim() || !form.hostname.trim() || !form.lab_id.trim()) {
      alert("Please fill in all compulsory fields: Machine ID, Lab, and Windows Hostname.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await addMachine(form);
      // Backend returns { machine_id, api_key, message }
      const newMachine = {
        machine_id:   form.machine_id,
        lab_id:       form.lab_id,
        hostname:     form.hostname,
        status:       "active",
        last_seen_at: null,
        ip_address:   "—",
      };
      setMachines(prev => [...prev, newMachine]);
      setNewKey(result.api_key || "");
      setShowAddModal(false);
      setForm(f => ({ ...f, machine_id: "", hostname: "" }));
    } catch (err) {
      alert("Failed to add machine: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const [editingMachine, setEditingMachine] = useState(null);
  const [editForm, setEditForm] = useState({ machine_id: "", lab_id: "", hostname: "", status: "active", regenerate_key: false });
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const handleOpenEdit = m => {
    setEditingMachine(m);
    setEditForm({
      machine_id: m.machine_id,
      lab_id: m.lab_id || (labs[0]?.lab_id || ""),
      hostname: m.hostname || "",
      status: m.status || "active",
      regenerate_key: false,
    });
  };

  const handleSaveEdit = async () => {
    if (!editForm.hostname.trim() || !editForm.lab_id.trim()) {
      alert("Hostname and Lab are required.");
      return;
    }
    setEditSubmitting(true);
    try {
      const res = await updateMachine(editForm);
      setMachines(prev => prev.map(m => m.machine_id === editingMachine.machine_id ? { ...m, ...editForm } : m));
      if (res.api_key) {
        setNewKey(res.api_key);
      }
      setEditingMachine(null);
    } catch (err) {
      alert("Failed to update machine: " + err.message);
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    await deleteMachine(deleteTarget.machine_id);
    setMachines(prev => prev.filter(m => m.machine_id !== deleteTarget.machine_id));
    setDeleteTarget(null);
  };

  const copyKey = async () => {
    await copyToClipboard(newKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const visibleLabs     = labFilter === "ALL" ? labs : labs.filter(l => l.lab_id === labFilter);
  const visibleStatuses = statusFilter === "ALL" ? STATUSES : [statusFilter];
  const totalOnline     = machines.filter(m => getMachineStatus(m, activeSessions) === "online").length;
  const totalOffline    = machines.filter(m => getMachineStatus(m, activeSessions) === "offline").length;
  const totalInactive   = machines.filter(m => m.status === "inactive").length;

  // Generate a color class for a lab given its index
  const getLabColor = idx => {
    const colors = [
      { accent: "bg-slate-600",   ring: "ring-slate-300" },
      { accent: "bg-slate-500",   ring: "ring-slate-300" },
      { accent: "bg-primary-600", ring: "ring-primary-200" },
      { accent: "bg-amber-600",   ring: "ring-amber-200" },
    ];
    return colors[idx % colors.length];
  };

  if (loading) {
    return (
      <PageWrapper>
        <div className="flex items-center justify-center h-[calc(100vh-120px)]">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-slate-200 border-t-primary-600 rounded-full animate-spin"></div>
            <span className="text-sm text-slate-400">Loading machines…</span>
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
            <p className="text-red-500 font-medium text-sm">Failed to load machines</p>
            <p className="text-slate-400 text-xs mt-1">{error}</p>
          </div>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Machines</h1>
          <p className="page-subtitle">Categorized by lab ({machines.length} total · {totalOnline} online · {totalOffline} offline{totalInactive > 0 ? ` · ${totalInactive} inactive` : ""})</p>
        </div>
        <button className="btn-primary btn-sm" onClick={() => setShowAddModal(true)}>
          <Plus size={14} /> Add Machine
        </button>
      </div>

      {/* New key banner */}
      {newKey && (
        <div className="mb-6 p-4 bg-emerald-50 rounded-xl flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-emerald-800">Machine registered! Copy the API key — it won't be shown again.</p>
            <code className="text-xs font-mono text-emerald-700 mt-1 block">{newKey}</code>
          </div>
          <button onClick={copyKey} className="btn-secondary btn-sm shrink-0">
            {copied ? <><Check size={13} className="text-emerald-600" /> Copied!</> : <><Copy size={13} /> Copy Key</>}
          </button>
        </div>
      )}

      {/* Lab stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {labs.map((l, idx) => {
          const c      = getLabColor(idx);
          const counts = labCounts[l.lab_id] || { total: 0, active: 0, inactive: 0 };
          return (
            <button key={l.lab_id} onClick={() => setLabFilter(prev => prev === l.lab_id ? "ALL" : l.lab_id)}
              className={`stat-card text-left transition-all ${labFilter === l.lab_id ? `ring-2 ${c.ring}` : "hover:bg-slate-50/50"}`}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="stat-label">{l.name}</p>
                  <p className="stat-value mt-1">{counts.total}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="flex items-center gap-1 text-[10px] text-emerald-600 font-medium" title="Online now">
                      <Wifi size={10} /> {counts.online}
                    </span>
                    <span className="flex items-center gap-1 text-[10px] text-slate-400 font-medium" title="Offline">
                      <WifiOff size={10} /> {counts.offline}
                    </span>
                    {counts.inactive > 0 && (
                      <span className="flex items-center gap-1 text-[10px] text-red-400 font-medium" title="Disabled / Inactive">
                        ● {counts.inactive}
                      </span>
                    )}
                  </div>
                </div>
                <Monitor size={18} className="text-slate-300 mt-0.5" />
              </div>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="form-input pl-8" placeholder="Search by ID or hostname..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="form-select w-32" value={labFilter} onChange={e => setLabFilter(e.target.value)}>
          <option value="ALL">All Labs</option>
          {labs.map(l => <option key={l.lab_id} value={l.lab_id}>{l.name}</option>)}
        </select>
        <select className="form-select w-28" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="ALL">All Status</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
          <option value="inactive">Inactive</option>
        </select>
        <button className="btn-secondary btn-sm text-xs"
          onClick={() => { setExpandedLabs(new Set(labs.map(l => l.lab_id))); setExpandedStatuses(new Set(labs.flatMap(l => STATUSES.map(s => `${l.lab_id}-${s}`)))); }}>
          Expand All
        </button>
        <button className="btn-secondary btn-sm text-xs"
          onClick={() => { setExpandedLabs(new Set()); setExpandedStatuses(new Set()); }}>
          Collapse All
        </button>
      </div>

      {/* Lab accordion cards */}
      <div className="space-y-4">
        {visibleLabs.map((lab, idx) => {
          const c            = getLabColor(idx);
          const labMachines  = filtered.filter(m => m.lab_id === lab.lab_id);
          const isLabOpen    = expandedLabs.has(lab.lab_id);
          const activeCount  = labMachines.filter(m => m.status === "active").length;
          const inactiveCount = labMachines.filter(m => m.status === "inactive").length;

          if (labMachines.length === 0 && search) return null;

          return (
            <div key={lab.lab_id} className="card overflow-hidden transition-all">
              <button
                className="w-full flex items-center gap-3 px-5 py-4 bg-slate-50 hover:bg-slate-100/50 transition-all"
                onClick={() => toggleLab(lab.lab_id)}
              >
                <div className={`w-7 h-7 rounded-lg ${c.accent} text-white flex items-center justify-center shrink-0`}>
                  <Server size={14} />
                </div>
                <div className="flex-1 text-left">
                  <h2 className="font-semibold text-sm text-slate-700">{lab.name}</h2>
                  <p className="text-xs text-slate-400 mt-0.5">{lab.building} · {lab.floor} Floor · {labMachines.length} machines</p>
                </div>
                <div className="hidden sm:flex items-center gap-1.5 mr-2">
                  {labMachines.filter(m => getMachineStatus(m, activeSessions) === "online").length > 0 && (
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md ${STATUS_COLORS.online}`}>
                      Online: {labMachines.filter(m => getMachineStatus(m, activeSessions) === "online").length}
                    </span>
                  )}
                  {labMachines.filter(m => getMachineStatus(m, activeSessions) === "offline").length > 0 && (
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md ${STATUS_COLORS.offline}`}>
                      Offline: {labMachines.filter(m => getMachineStatus(m, activeSessions) === "offline").length}
                    </span>
                  )}
                  {labMachines.filter(m => m.status === "inactive").length > 0 && (
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md ${STATUS_COLORS.inactive}`}>
                      Inactive: {labMachines.filter(m => m.status === "inactive").length}
                    </span>
                  )}
                </div>
                {isLabOpen ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
              </button>

              {isLabOpen && (
                <div className="divide-y divide-slate-100/60">
                  {visibleStatuses.map(status => {
                    const statusMachines = grouped[lab.lab_id]?.[status] || [];
                    const statusKey      = `${lab.lab_id}-${status}`;
                    const isStatusOpen   = expandedStatuses.has(statusKey);

                    if (statusMachines.length === 0) return null;

                    return (
                      <div key={statusKey}>
                        <button
                          className="w-full flex items-center gap-3 px-5 py-3 hover:bg-slate-50/50 transition-colors"
                          onClick={() => toggleStatus(statusKey)}
                        >
                          {isStatusOpen
                            ? <ChevronDown size={14} className="text-slate-400 shrink-0" />
                            : <ChevronRight size={14} className="text-slate-400 shrink-0" />
                          }
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md ${STATUS_COLORS[status]}`}>
                            {status === "online" ? <Wifi size={10} className="inline mr-1" /> : <WifiOff size={10} className="inline mr-1" />}
                            {status.toUpperCase()}
                          </span>
                          <span className="text-sm font-medium text-slate-600">{STATUS_LABELS[status]}</span>
                          <span className="text-xs text-slate-400 ml-auto">{statusMachines.length} machines</span>
                        </button>

                        {isStatusOpen && (
                          <div className="bg-white">
                            <table className="table">
                              <thead>
                                <tr>
                                  <th className="!text-[10px] !py-2">Machine ID</th>
                                  <th className="!text-[10px] !py-2">Hostname</th>
                                  <th className="!text-[10px] !py-2">IP Address</th>
                                  <th className="!text-[10px] !py-2">Status</th>
                                  <th className="!text-[10px] !py-2">Last Seen</th>
                                  <th className="!text-[10px] !py-2 text-right">Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {statusMachines.map(m => (
                                  <tr key={m.machine_id}>
                                    <td>
                                      <Link to={`/machines/${m.machine_id}`} className="font-mono text-xs font-medium text-primary-600 hover:underline">
                                        {m.machine_id}
                                      </Link>
                                    </td>
                                    <td className="text-sm text-slate-600">{m.hostname}</td>
                                    <td className="font-mono text-xs text-slate-400">{m.ip_address || "—"}</td>
                                    <td><MachineStatusBadge machine={m} activeSessions={activeSessions} /></td>
                                    <td className="text-xs text-slate-400">
                                      {m.last_seen_at
                                        ? new Date(m.last_seen_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) +
                                          (new Date(m.last_seen_at).toDateString() !== new Date().toDateString()
                                            ? ` (${new Date(m.last_seen_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" })})`
                                            : "")
                                        : "Never"}
                                    </td>
                                    <td>
                                      <div className="flex items-center justify-end gap-1">
                                        <button
                                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded"
                                          title="Edit Machine"
                                          onClick={() => handleOpenEdit(m)}
                                        >
                                          <Edit2 size={12} />
                                        </button>
                                        <button
                                          onClick={() => setDeleteTarget(m)}
                                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded"
                                          title="Delete Machine & Erase Data"
                                        >
                                          <Trash2 size={12} />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {visibleStatuses.every(s => (grouped[lab.lab_id]?.[s] || []).length === 0) && (
                    <p className="text-center text-slate-400 py-6 text-sm">No machines match your filters in {lab.name}.</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="card card-body text-center py-12 mt-4">
          <p className="text-slate-400 text-sm">No machines match your search or filters.</p>
        </div>
      )}

      {/* Add Machine Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <h2 className="text-base font-semibold text-slate-800 mb-4">Register New Machine</h2>
            <div className="space-y-4">
              <div>
                <label className="form-label">Machine ID <span className="text-red-500 font-bold ml-1">*</span></label>
                <input className="form-input font-mono uppercase" placeholder="e.g. CSL1-PC-11" value={form.machine_id}
                  onChange={e => setForm(f => ({ ...f, machine_id: e.target.value.toUpperCase() }))} />
              </div>
              <div>
                <label className="form-label">Lab <span className="text-red-500 font-bold ml-1">*</span></label>
                {labs.length === 0 ? (
                  <div className="text-xs text-amber-700 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                    No computer labs exist yet. Please{" "}
                    <Link to="/admin/labs" className="underline font-semibold text-primary-600 hover:text-primary-700">
                      create a lab
                    </Link>{" "}
                    first before registering machines.
                  </div>
                ) : (
                  <select className="form-select" value={form.lab_id}
                    onChange={e => setForm(f => ({ ...f, lab_id: e.target.value }))}>
                    {labs.map(l => <option key={l.lab_id} value={l.lab_id}>{l.name} ({l.lab_id})</option>)}
                  </select>
                )}
              </div>
              <div>
                <label className="form-label">Windows Hostname <span className="text-red-500 font-bold ml-1">*</span></label>
                <input className="form-input font-mono" placeholder="e.g. WIT-CSL1-11" value={form.hostname}
                  onChange={e => setForm(f => ({ ...f, hostname: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button className="btn-secondary" onClick={() => setShowAddModal(false)} disabled={submitting}>Cancel</button>
              <button
                className="btn-primary"
                onClick={handleAdd}
                disabled={!form.machine_id.trim() || !form.hostname.trim() || !form.lab_id.trim() || submitting}
              >
                {submitting ? "Registering…" : "Register & Generate Key"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Machine Modal */}
      {editingMachine && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <h2 className="text-base font-semibold text-slate-800 mb-1">Edit Machine</h2>
            <p className="text-xs text-slate-400 mb-4 font-mono">{editForm.machine_id}</p>
            <div className="space-y-4">
              <div>
                <label className="form-label">Lab <span className="text-red-500 font-bold ml-1">*</span></label>
                <select className="form-select" value={editForm.lab_id}
                  onChange={e => setEditForm(f => ({ ...f, lab_id: e.target.value }))}>
                  {labs.map(l => <option key={l.lab_id} value={l.lab_id}>{l.name} ({l.lab_id})</option>)}
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
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button className="btn-secondary" onClick={() => setEditingMachine(null)} disabled={editSubmitting}>Cancel</button>
              <button
                className="btn-primary"
                onClick={handleSaveEdit}
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
        isOpen={!!deleteTarget}
        title={`Delete Machine: ${deleteTarget?.machine_id}`}
        message={`Are you sure you want to delete machine "${deleteTarget?.machine_id}" (${deleteTarget?.hostname})? This will permanently delete this machine record and erase ALL associated session history, app usage, and activity logs.`}
        confirmLabel="Delete & Erase All Data"
        onConfirm={handleConfirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </PageWrapper>
  );
}
