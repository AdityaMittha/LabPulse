import { useState, useMemo, useEffect } from "react";
import { Plus, Search, Trash2, FlaskConical, MapPin, Cpu, Users, ChevronRight, Layers } from "lucide-react";
import { PageWrapper } from "../components/Shared";
import { Link } from "react-router-dom";
import { fetchLabs, fetchMachines, addLab, deleteLab, fetchDepartments } from "../api/apiClient";

export default function AdminLabsPage() {
  const [labs,       setLabs]       = useState([]);
  const [machines,   setMachines]   = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [search,     setSearch]     = useState("");
  const [deptFilter, setDeptFilter] = useState("ALL");
  const [showAdd,    setShowAdd]    = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    lab_id: "",
    name: "",
    department: "CSE",
    building: "D Block",
    floor: "Ground",
    capacity: 30,
  });

  const loadData = () => {
    setLoading(true);
    setError(null);
    Promise.all([fetchLabs(), fetchMachines(), fetchDepartments().catch(() => [])])
      .then(([labsList, machList, deptList]) => {
        setLabs(labsList);
        setMachines(machList);
        setDepartments(deptList);
        if (deptList.length > 0 && !form.department) {
          setForm(f => ({ ...f, department: deptList[0].department_id || deptList[0].code }));
        }
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAdd = async () => {
    if (!form.lab_id.trim() || !form.name.trim() || !form.department.trim() || !form.building.trim() || !form.floor.trim()) {
      alert("Please fill in all compulsory fields: Lab ID, Lab Name, Department, Building, and Floor.");
      return;
    }
    setSubmitting(true);
    try {
      await addLab({
        ...form,
        lab_id: form.lab_id.trim().toUpperCase(),
        name: form.name.trim(),
        department: form.department.trim(),
        building: form.building.trim(),
        floor: form.floor.trim(),
        capacity: Number(form.capacity) || 30,
      });
      setLabs(prev => [...prev, {
        ...form,
        lab_id: form.lab_id.trim().toUpperCase(),
        name: form.name.trim(),
        department: form.department.trim(),
        building: form.building.trim(),
        floor: form.floor.trim(),
        capacity: Number(form.capacity) || 30,
      }]);
      setShowAdd(false);
      setForm({ lab_id: "", name: "", department: "CSE", building: "D Block", floor: "Ground", capacity: 30 });
    } catch (err) {
      alert("Failed to add lab: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (labId, labName) => {
    if (!window.confirm(`Are you sure you want to delete lab "${labName || labId}"?\n\nThis will remove the lab configuration from the system.`)) return;
    try {
      await deleteLab(labId);
      setLabs(prev => prev.filter(l => l.lab_id !== labId));
    } catch (err) {
      alert("Failed to delete lab: " + err.message);
    }
  };

  const machineCountByLab = useMemo(() => {
    const counts = {};
    machines.forEach(m => {
      counts[m.lab_id] = (counts[m.lab_id] || 0) + 1;
    });
    return counts;
  }, [machines]);

  const filteredLabs = useMemo(() => labs.filter(l => {
    const matchDept = deptFilter === "ALL" || (l.department || "").toUpperCase().includes(deptFilter.toUpperCase());
    const matchSearch =
      (l.lab_id || "").toLowerCase().includes(search.toLowerCase()) ||
      (l.name || "").toLowerCase().includes(search.toLowerCase()) ||
      (l.building || "").toLowerCase().includes(search.toLowerCase());
    return matchDept && matchSearch;
  }), [labs, deptFilter, search]);

  if (loading) {
    return (
      <PageWrapper>
        <div className="flex items-center justify-center h-[calc(100vh-120px)]">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-slate-200 border-t-primary-600 rounded-full animate-spin"></div>
            <span className="text-sm text-slate-400">Loading labs…</span>
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
            <p className="text-red-500 font-medium text-sm">Failed to load labs</p>
            <p className="text-slate-400 text-xs mt-1">{error}</p>
            <button className="btn-secondary btn-sm mt-4" onClick={loadData}>Retry</button>
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
          <h1 className="page-title">Lab Management</h1>
          <p className="page-subtitle">Configure physical computer labs across departments ({labs.length} registered)</p>
        </div>
        <button className="btn-primary btn-sm" onClick={() => setShowAdd(true)}>
          <Plus size={14} /> Add Lab
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            className="form-input pl-9"
            placeholder="Search by lab name, ID, or building…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="form-select sm:w-48"
          value={deptFilter}
          onChange={e => setDeptFilter(e.target.value)}
        >
          <option value="ALL">All Departments</option>
          {departments.map(d => {
            const code = d.department_id || d.code;
            return <option key={code} value={code}>{code} – {d.name}</option>;
          })}
        </select>
      </div>

      {/* Labs List */}
      {filteredLabs.length === 0 ? (
        <div className="card card-body text-center py-16">
          <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
            <FlaskConical size={24} />
          </div>
          <h3 className="text-base font-semibold text-slate-700">No labs found</h3>
          <p className="text-slate-400 text-xs mt-1 max-w-sm mx-auto">
            {search || deptFilter !== "ALL"
              ? "No labs match your search or filter criteria."
              : "No computer labs are registered yet in the database. Click 'Add Lab' to create your first lab."}
          </p>
          <button className="btn-primary btn-sm mt-4 inline-flex items-center gap-1.5" onClick={() => setShowAdd(true)}>
            <Plus size={14} /> Add Lab
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredLabs.map(lab => {
            const machCount = machineCountByLab[lab.lab_id] || 0;
            return (
              <div key={lab.lab_id} className="card hover:border-slate-300 transition-all p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <span className="text-[10px] font-semibold tracking-wide uppercase px-2 py-0.5 rounded bg-primary-50 text-primary-700">
                        {lab.department || "General"}
                      </span>
                      <h3 className="text-base font-semibold text-slate-900 mt-1.5">{lab.name}</h3>
                      <p className="font-mono text-xs text-slate-400">{lab.lab_id}</p>
                    </div>
                    <button
                      className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                      title="Delete Lab"
                      onClick={() => handleDelete(lab.lab_id, lab.name)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>

                  <div className="space-y-2 text-xs text-slate-600 my-4 pt-3 border-t border-slate-100">
                    <div className="flex items-center gap-2">
                      <MapPin size={13} className="text-slate-400 shrink-0" />
                      <span>{lab.building ? `${lab.building}, ${lab.floor || "Ground"}` : "Location not specified"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Cpu size={13} className="text-slate-400 shrink-0" />
                      <span><strong>{machCount}</strong> machines registered</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Users size={13} className="text-slate-400 shrink-0" />
                      <span>Capacity: <strong>{lab.capacity || 30}</strong> seats</span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                  <Link
                    to={`/labs/${lab.lab_id}`}
                    className="text-xs font-semibold text-primary-600 hover:text-primary-700 inline-flex items-center gap-1"
                  >
                    View Lab Detail <ChevronRight size={13} />
                  </Link>
                  <Link
                    to={`/admin/machines?lab_id=${lab.lab_id}`}
                    className="text-xs text-slate-400 hover:text-slate-700"
                  >
                    Manage PCs
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Lab Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-800 mb-1">Add Computer Lab</h2>
            <p className="text-xs text-slate-400 mb-5">Register a physical lab space into DynamoDB.</p>

            <div className="space-y-3.5">
              <div>
                <label className="form-label">Lab ID <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  className="form-input font-mono uppercase"
                  placeholder="e.g. CS-LAB-1 or IT-LAB"
                  value={form.lab_id}
                  onChange={e => setForm(f => ({ ...f, lab_id: e.target.value }))}
                />
              </div>

              <div>
                <label className="form-label">Lab Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Computer Center 1"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="form-label mb-0">Department <span className="text-red-500 font-bold">*</span></label>
                    <Link to="/admin/departments" className="text-[11px] text-primary-600 hover:underline">
                      Manage Depts
                    </Link>
                  </div>
                  {departments.length === 0 ? (
                    <input
                      type="text"
                      className="form-input uppercase"
                      placeholder="e.g. CSE"
                      value={form.department}
                      onChange={e => setForm(f => ({ ...f, department: e.target.value.toUpperCase() }))}
                    />
                  ) : (
                    <select
                      className="form-select"
                      value={form.department}
                      onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                    >
                      {departments.map(d => {
                        const code = d.department_id || d.code;
                        return <option key={code} value={code}>{code} – {d.name}</option>;
                      })}
                    </select>
                  )}
                </div>
                <div>
                  <label className="form-label">Capacity (Seats) <span className="text-red-500 font-bold">*</span></label>
                  <input
                    type="number"
                    className="form-input"
                    placeholder="30"
                    min="1"
                    max="200"
                    value={form.capacity}
                    onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Building <span className="text-red-500 font-bold">*</span></label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. D Block"
                    value={form.building}
                    onChange={e => setForm(f => ({ ...f, building: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="form-label">Floor <span className="text-red-500 font-bold">*</span></label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Ground or First"
                    value={form.floor}
                    onChange={e => setForm(f => ({ ...f, floor: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                className="btn-secondary"
                onClick={() => setShowAdd(false)}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleAdd}
                disabled={!form.lab_id.trim() || !form.name.trim() || !form.department.trim() || !form.building.trim() || !form.floor.trim() || submitting}
              >
                {submitting ? "Adding…" : "Add Lab"}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageWrapper>
  );
}
