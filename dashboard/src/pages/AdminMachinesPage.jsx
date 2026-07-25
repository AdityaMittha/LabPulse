import { useState, useMemo } from "react";
import { Plus, Search, Trash2, Edit2, Copy, Check, ChevronDown, ChevronRight, Monitor, Wifi, WifiOff, Server } from "lucide-react";
import { labs, machines as allMachines } from "../data/mockData";
import { MachineStatusBadge, PageWrapper } from "../components/Shared";
import { Link } from "react-router-dom";
import { deleteMachine } from "../api/apiClient";

const STATUSES = ["active", "inactive"];
const STATUS_LABELS = { active: "Active Machines", inactive: "Inactive Machines" };

const LAB_COLORS = {
  "CS-LAB-1": { bg: "bg-slate-50",    border: "border-slate-200",    accent: "bg-slate-600",    text: "text-slate-700",    ring: "ring-slate-300" },
  "CS-LAB-2": { bg: "bg-slate-50",    border: "border-slate-200",    accent: "bg-slate-500",    text: "text-slate-700",    ring: "ring-slate-300" },
  "IT-LAB":   { bg: "bg-slate-50",    border: "border-slate-200",    accent: "bg-primary-600",  text: "text-primary-700",  ring: "ring-primary-200" },
  "ETC-LAB":  { bg: "bg-slate-50",    border: "border-slate-200",    accent: "bg-amber-600",    text: "text-amber-700",    ring: "ring-amber-200" },
};

const STATUS_COLORS = {
  active:   "bg-emerald-50 text-emerald-700",
  inactive: "bg-red-50 text-red-600",
};

function generateApiKey() {
  return "lp_" + Array.from({ length: 32 }, () =>
    "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 36)]
  ).join("");
}

export default function AdminMachinesPage() {
  const [machines, setMachines] = useState(allMachines);
  const [search, setSearch] = useState("");
  const [labFilter, setLabFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [showAddModal, setShowAddModal] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({ machine_id: "", lab_id: labs[0].lab_id, hostname: "", status: "active" });

  // Track expanded labs and statuses
  const [expandedLabs, setExpandedLabs] = useState(() => new Set(labs.map(l => l.lab_id)));
  const [expandedStatuses, setExpandedStatuses] = useState(() => new Set());

  const toggleLab = (labId) => {
    setExpandedLabs(prev => {
      const next = new Set(prev);
      next.has(labId) ? next.delete(labId) : next.add(labId);
      return next;
    });
  };

  const toggleStatus = (key) => {
    setExpandedStatuses(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  // Filter machines
  const filtered = useMemo(() => machines.filter(m =>
    (labFilter === "ALL" || m.lab_id === labFilter) &&
    (statusFilter === "ALL" || m.status === statusFilter) &&
    (m.machine_id.toLowerCase().includes(search.toLowerCase()) ||
     m.hostname.toLowerCase().includes(search.toLowerCase()))
  ), [machines, labFilter, statusFilter, search]);

  // Group by lab -> status
  const grouped = useMemo(() => {
    const map = {};
    labs.forEach(l => {
      map[l.lab_id] = {};
      STATUSES.forEach(s => { map[l.lab_id][s] = []; });
    });
    filtered.forEach(m => {
      if (map[m.lab_id] && map[m.lab_id][m.status]) {
        map[m.lab_id][m.status].push(m);
      }
    });
    return map;
  }, [filtered]);

  // Lab counts
  const labCounts = useMemo(() => {
    const counts = {};
    labs.forEach(l => {
      const labMachines = machines.filter(m => m.lab_id === l.lab_id);
      counts[l.lab_id] = {
        total: labMachines.length,
        active: labMachines.filter(m => m.status === "active").length,
        inactive: labMachines.filter(m => m.status === "inactive").length,
      };
    });
    return counts;
  }, [machines]);

  const handleAdd = () => {
    const key = generateApiKey();
    const newMachine = {
      ...form,
      last_seen_at: null,
      ip_address: "—",
      api_key_hash: "sha256:" + key.slice(3, 11) + "...",
    };
    setMachines(prev => [...prev, newMachine]);
    setNewKey(key);
    setShowAddModal(false);
  };

  const handleDelete = async id => {
    const confirmDelete = window.confirm(
      `Are you sure you want to delete machine "${id}"?\n\nThis will permanently delete this machine record and ALL of its associated sessions, app usages, and behavior metrics.`
    );
    if (confirmDelete) {
      try {
        await deleteMachine(id);
        setMachines(prev => prev.filter(m => m.machine_id !== id));
        alert("Machine and all associated data successfully deleted.");
      } catch (err) {
        alert("Failed to delete machine: " + err.message);
      }
    }
  };

  const copyKey = () => {
    navigator.clipboard.writeText(newKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const visibleLabs = labFilter === "ALL" ? labs : labs.filter(l => l.lab_id === labFilter);
  const visibleStatuses = statusFilter === "ALL" ? STATUSES : [statusFilter];

  const totalActive = machines.filter(m => m.status === "active").length;
  const totalInactive = machines.filter(m => m.status === "inactive").length;

  return (
    <PageWrapper>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Machines</h1>
          <p className="page-subtitle">Categorized by lab ({machines.length} total · {totalActive} active · {totalInactive} inactive)</p>
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
        {labs.map(l => {
          const c = LAB_COLORS[l.lab_id] || LAB_COLORS["CS-LAB-1"];
          const counts = labCounts[l.lab_id];
          return (
            <button key={l.lab_id} onClick={() => setLabFilter(prev => prev === l.lab_id ? "ALL" : l.lab_id)}
              className={`stat-card text-left transition-all ${labFilter === l.lab_id ? `ring-2 ${c.ring}` : "hover:bg-slate-50/50"}`}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="stat-label">{l.name}</p>
                  <p className="stat-value mt-1">{counts.total}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="flex items-center gap-1 text-[10px] text-emerald-600 font-medium">
                      <Wifi size={10} /> {counts.active}
                    </span>
                    <span className="flex items-center gap-1 text-[10px] text-red-400 font-medium">
                      <WifiOff size={10} /> {counts.inactive}
                    </span>
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
          <option value="active">Active</option>
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
        {visibleLabs.map(lab => {
          const c = LAB_COLORS[lab.lab_id] || LAB_COLORS["CS-LAB-1"];
          const labMachines = filtered.filter(m => m.lab_id === lab.lab_id);
          const isLabOpen = expandedLabs.has(lab.lab_id);
          const activeCount = labMachines.filter(m => m.status === "active").length;
          const inactiveCount = labMachines.filter(m => m.status === "inactive").length;

          if (labMachines.length === 0 && search) return null;

          return (
            <div key={lab.lab_id} className="card overflow-hidden transition-all">
              {/* Lab header */}
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
                {/* Status breakdown badges */}
                <div className="hidden sm:flex items-center gap-1.5 mr-2">
                  {activeCount > 0 && (
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md ${STATUS_COLORS.active}`}>
                      Active: {activeCount}
                    </span>
                  )}
                  {inactiveCount > 0 && (
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md ${STATUS_COLORS.inactive}`}>
                      Inactive: {inactiveCount}
                    </span>
                  )}
                </div>
                {isLabOpen ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
              </button>

              {/* Status subcategories */}
              {isLabOpen && (
                <div className="divide-y divide-slate-100/60">
                  {visibleStatuses.map(status => {
                    const statusMachines = grouped[lab.lab_id]?.[status] || [];
                    const statusKey = `${lab.lab_id}-${status}`;
                    const isStatusOpen = expandedStatuses.has(statusKey);

                    if (statusMachines.length === 0) return null;

                    return (
                      <div key={statusKey}>
                        {/* Status subheader */}
                        <button
                          className="w-full flex items-center gap-3 px-5 py-3 hover:bg-slate-50/50 transition-colors"
                          onClick={() => toggleStatus(statusKey)}
                        >
                          {isStatusOpen
                            ? <ChevronDown size={14} className="text-slate-400 shrink-0" />
                            : <ChevronRight size={14} className="text-slate-400 shrink-0" />
                          }
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md ${STATUS_COLORS[status]}`}>
                            {status === "active" ? <Wifi size={10} className="inline mr-1" /> : <WifiOff size={10} className="inline mr-1" />}
                            {status.toUpperCase()}
                          </span>
                          <span className="text-sm font-medium text-slate-600">{STATUS_LABELS[status]}</span>
                          <span className="text-xs text-slate-400 ml-auto">{statusMachines.length} machines</span>
                        </button>

                        {/* Machine rows */}
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
                                    <td><MachineStatusBadge status={m.status} /></td>
                                    <td className="text-xs text-slate-400">
                                      {m.last_seen_at
                                        ? new Date(m.last_seen_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
                                        : "—"}
                                    </td>
                                    <td>
                                      <div className="flex items-center justify-end gap-1">
                                        <button className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded" title="Edit">
                                          <Edit2 size={12} />
                                        </button>
                                        <button onClick={() => handleDelete(m.machine_id)}
                                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded" title="Remove">
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

                  {/* Empty state */}
                  {visibleStatuses.every(s => (grouped[lab.lab_id]?.[s] || []).length === 0) && (
                    <p className="text-center text-slate-400 py-6 text-sm">No machines match your filters in {lab.name}.</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* No results */}
      {filtered.length === 0 && (
        <div className="card card-body text-center py-12 mt-4">
          <p className="text-slate-400 text-sm">No machines match your search or filters.</p>
        </div>
      )}

      {/* Add Machine modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <h2 className="text-base font-semibold text-slate-800 mb-4">Register New Machine</h2>
            <div className="space-y-4">
              <div>
                <label className="form-label">Machine ID</label>
                <input className="form-input" placeholder="e.g. CSL1-PC-11" value={form.machine_id}
                  onChange={e => setForm(f => ({ ...f, machine_id: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">Lab</label>
                <select className="form-select" value={form.lab_id}
                  onChange={e => setForm(f => ({ ...f, lab_id: e.target.value }))}>
                  {labs.map(l => <option key={l.lab_id} value={l.lab_id}>{l.name}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Windows Hostname</label>
                <input className="form-input" placeholder="e.g. WIT-CSL1-11" value={form.hostname}
                  onChange={e => setForm(f => ({ ...f, hostname: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button className="btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleAdd} disabled={!form.machine_id || !form.hostname}>
                Register & Generate Key
              </button>
            </div>
          </div>
        </div>
      )}
    </PageWrapper>
  );
}
