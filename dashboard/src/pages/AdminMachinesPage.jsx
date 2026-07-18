import { useState } from "react";
import { Plus, Search, Trash2, Edit2, Copy, Check } from "lucide-react";
import { labs, machines as allMachines } from "../data/mockData";
import { MachineStatusBadge, SectionHeading, PageWrapper } from "../components/Shared";

function generateApiKey() {
  return "lp_" + Array.from({ length: 32 }, () =>
    "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 36)]
  ).join("");
}

export default function AdminMachinesPage() {
  const [machines, setMachines] = useState(allMachines);
  const [search, setSearch] = useState("");
  const [labFilter, setLabFilter] = useState("ALL");
  const [showAddModal, setShowAddModal] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({ machine_id: "", lab_id: labs[0].lab_id, hostname: "", status: "active" });

  const filtered = machines.filter(m =>
    (labFilter === "ALL" || m.lab_id === labFilter) &&
    (m.machine_id.toLowerCase().includes(search.toLowerCase()) ||
     m.hostname.toLowerCase().includes(search.toLowerCase()))
  );

  const handleAdd = () => {
    const key = generateApiKey();
    const newMachine = {
      ...form,
      last_seen_at: null,
      ip_address: "—",
      api_key_hash: "sha256:" + key.slice(3, 11) + "…",
    };
    setMachines(prev => [...prev, newMachine]);
    setNewKey(key);
    setShowAddModal(false);
  };

  const handleDelete = id => {
    if (window.confirm(`Remove machine ${id}? This cannot be undone.`)) {
      setMachines(prev => prev.filter(m => m.machine_id !== id));
    }
  };

  const copyKey = () => {
    navigator.clipboard.writeText(newKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <PageWrapper>
      <div className="page-header">
        <div>
          <h1 className="page-title">Machines</h1>
          <p className="page-subtitle">Register and manage lab computers</p>
        </div>
        <button className="btn-primary btn-sm" onClick={() => setShowAddModal(true)}>
          <Plus size={14} /> Add Machine
        </button>
      </div>

      {/* New key banner */}
      {newKey && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-green-800">✅ Machine registered! Copy the API key — it won't be shown again.</p>
            <code className="text-xs font-mono text-green-700 mt-1 block">{newKey}</code>
          </div>
          <button onClick={copyKey} className="btn-secondary btn-sm shrink-0">
            {copied ? <><Check size={13} className="text-green-600" /> Copied!</> : <><Copy size={13} /> Copy Key</>}
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-5">
        <div className="relative flex-1 max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="form-input pl-8 text-sm" placeholder="Search by ID or hostname…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="form-select text-sm py-1.5 w-36" value={labFilter} onChange={e => setLabFilter(e.target.value)}>
          <option value="ALL">All Labs</option>
          {labs.map(l => <option key={l.lab_id} value={l.lab_id}>{l.name}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="card">
        <div className="px-5 py-3 border-b border-slate-100 text-xs text-slate-500">{filtered.length} machines</div>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr><th>Machine ID</th><th>Hostname</th><th>Lab</th><th>IP</th><th>Status</th><th>Last Seen</th><th className="text-right">Actions</th></tr>
            </thead>
            <tbody>
              {filtered.map(m => (
                <tr key={m.machine_id}>
                  <td><code className="font-mono text-xs bg-slate-50 px-1.5 py-0.5 rounded">{m.machine_id}</code></td>
                  <td className="text-slate-700">{m.hostname}</td>
                  <td className="text-slate-500 text-xs">{labs.find(l=>l.lab_id===m.lab_id)?.name}</td>
                  <td className="font-mono text-xs text-slate-500">{m.ip_address || "—"}</td>
                  <td><MachineStatusBadge status={m.status} /></td>
                  <td className="text-xs text-slate-400">{m.last_seen_at ? new Date(m.last_seen_at).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"}) : "—"}</td>
                  <td>
                    <div className="flex items-center justify-end gap-2">
                      <button className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors" title="Edit">
                        <Edit2 size={13} />
                      </button>
                      <button onClick={() => handleDelete(m.machine_id)} className="p-1.5 text-slate-400 hover:text-danger hover:bg-red-50 rounded transition-colors" title="Remove">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-base font-semibold text-slate-900 mb-4">Register New Machine</h2>
            <div className="space-y-4">
              <div>
                <label className="form-label">Machine ID</label>
                <input className="form-input" placeholder="e.g. CSL1-PC-11" value={form.machine_id}
                  onChange={e => setForm(f=>({...f, machine_id: e.target.value}))} />
              </div>
              <div>
                <label className="form-label">Lab</label>
                <select className="form-select" value={form.lab_id}
                  onChange={e => setForm(f=>({...f, lab_id: e.target.value}))}>
                  {labs.map(l => <option key={l.lab_id} value={l.lab_id}>{l.name}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Windows Hostname</label>
                <input className="form-input" placeholder="e.g. WIT-CSL1-11" value={form.hostname}
                  onChange={e => setForm(f=>({...f, hostname: e.target.value}))} />
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
