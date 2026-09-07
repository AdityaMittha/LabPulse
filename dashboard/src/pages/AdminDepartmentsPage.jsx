import { useState, useMemo, useEffect } from "react";
import { Plus, Search, Trash2, Building2, FlaskConical, Users, AlertCircle, BookOpen } from "lucide-react";
import { PageWrapper } from "../components/Shared";
import { Link } from "react-router-dom";
import { fetchDepartments, addDepartment, deleteDepartment, fetchLabs, fetchStudents } from "../api/apiClient";

export default function AdminDepartmentsPage() {
  const [departments, setDepartments] = useState([]);
  const [labs,        setLabs]        = useState([]);
  const [students,    setStudents]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [search,      setSearch]      = useState("");
  const [showAdd,     setShowAdd]     = useState(false);
  const [submitting,  setSubmitting]  = useState(false);
  const [form, setForm] = useState({
    department_id: "",
    name: "",
    building: "Main Building",
    hod_name: "",
  });

  const loadData = () => {
    setLoading(true);
    setError(null);
    Promise.all([fetchDepartments(), fetchLabs(), fetchStudents()])
      .then(([deptList, labList, studentList]) => {
        setDepartments(deptList);
        setLabs(labList);
        setStudents(studentList);
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

  const labCountByDept = useMemo(() => {
    const counts = {};
    labs.forEach(l => {
      const d = (l.department || "General").toUpperCase();
      counts[d] = (counts[d] || 0) + 1;
    });
    return counts;
  }, [labs]);

  const studentCountByDept = useMemo(() => {
    const counts = {};
    students.forEach(s => {
      const d = (s.department || "General").toUpperCase();
      counts[d] = (counts[d] || 0) + 1;
    });
    return counts;
  }, [students]);

  const filteredDepts = useMemo(() => {
    return departments.filter(d => {
      const q = search.toLowerCase();
      const matchSearch =
        !search ||
        (d.department_id || "").toLowerCase().includes(q) ||
        (d.name || "").toLowerCase().includes(q) ||
        (d.building || "").toLowerCase().includes(q) ||
        (d.hod_name || "").toLowerCase().includes(q);
      return matchSearch;
    });
  }, [departments, search]);

  const handleAdd = async e => {
    e.preventDefault();
    const deptId = form.department_id.trim().toUpperCase();
    const deptName = form.name.trim();

    if (!deptId || !deptName) {
      alert("Department Code and Department Name are required.");
      return;
    }

    setSubmitting(true);
    try {
      await addDepartment({
        department_id: deptId,
        name: deptName,
        code: deptId,
        building: form.building.trim(),
        hod_name: form.hod_name.trim(),
      });
      setShowAdd(false);
      setForm({ department_id: "", name: "", building: "Main Building", hod_name: "" });
      loadData();
    } catch (err) {
      alert("Failed to add department: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (deptId, deptName) => {
    const associatedLabs = labCountByDept[deptId] || 0;
    const msg = associatedLabs > 0
      ? `Department "${deptName}" (${deptId}) currently has ${associatedLabs} lab(s) associated with it. Are you sure you want to delete it?`
      : `Are you sure you want to delete department "${deptName}" (${deptId})?`;

    if (!window.confirm(msg)) return;

    try {
      await deleteDepartment(deptId);
      setDepartments(prev => prev.filter(d => d.department_id !== deptId));
    } catch (err) {
      alert("Failed to delete department: " + err.message);
    }
  };

  const handleQuickAdd = async (code, name, building) => {
    try {
      await addDepartment({
        department_id: code,
        name: name,
        code: code,
        building: building,
        hod_name: "",
      });
      loadData();
    } catch (err) {
      alert("Failed to add default department: " + err.message);
    }
  };

  if (loading && departments.length === 0) {
    return (
      <PageWrapper>
        <div className="flex items-center justify-center h-[calc(100vh-120px)]">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-slate-200 border-t-primary-600 rounded-full animate-spin"></div>
            <span className="text-sm text-slate-400">Loading departments…</span>
          </div>
        </div>
      </PageWrapper>
    );
  }

  if (error && departments.length === 0) {
    return (
      <PageWrapper>
        <div className="flex items-center justify-center h-[calc(100vh-120px)]">
          <div className="text-center max-w-sm">
            <AlertCircle size={32} className="text-red-500 mx-auto mb-2" />
            <p className="text-red-600 font-semibold text-sm">Failed to load departments</p>
            <p className="text-slate-400 text-xs mt-1">{error}</p>
            <button className="btn-primary btn-sm mt-4" onClick={loadData}>Retry</button>
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
          <h1 className="page-title">Department Management</h1>
          <p className="page-subtitle">Configure academic departments and faculties ({departments.length} registered)</p>
        </div>
        <button className="btn-primary btn-sm inline-flex items-center gap-1.5" onClick={() => setShowAdd(true)}>
          <Plus size={14} /> Add Department
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center text-primary-600 shrink-0">
            <Building2 size={20} />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-medium">Departments</p>
            <p className="text-xl font-bold text-slate-800">{departments.length}</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center text-sky-600 shrink-0">
            <FlaskConical size={20} />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-medium">Total Labs</p>
            <p className="text-xl font-bold text-slate-800">{labs.length}</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
            <Users size={20} />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-medium">Total Students</p>
            <p className="text-xl font-bold text-slate-800">{students.length}</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            className="form-input pl-9"
            placeholder="Search department code, full name, building, or HOD…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Department Cards Grid */}
      {filteredDepts.length === 0 ? (
        <div className="card card-body text-center py-16">
          <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
            <Building2 size={24} />
          </div>
          <h3 className="text-base font-semibold text-slate-700">No departments found</h3>
          <p className="text-slate-400 text-xs mt-1 max-w-md mx-auto">
            {search
              ? "No departments match your search query."
              : "No departments have been added to the database yet. Add your academic departments to categorize labs, students, and timetables."}
          </p>

          {!search && (
            <div className="mt-6 flex flex-col items-center gap-3">
              <button className="btn-primary btn-sm inline-flex items-center gap-1.5" onClick={() => setShowAdd(true)}>
                <Plus size={14} /> Add Custom Department
              </button>
              <div className="text-xs text-slate-400">Or quickly add standard engineering departments:</div>
              <div className="flex flex-wrap gap-2 justify-center">
                <button
                  onClick={() => handleQuickAdd("CSE", "Computer Science & Engineering", "D Block")}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-colors"
                >
                  + Add CSE
                </button>
                <button
                  onClick={() => handleQuickAdd("IT", "Information Technology", "A Block")}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-colors"
                >
                  + Add IT
                </button>
                <button
                  onClick={() => handleQuickAdd("E&TC", "Electronics & Telecommunication", "B Block")}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-colors"
                >
                  + Add E&TC
                </button>
                <button
                  onClick={() => handleQuickAdd("AIDS", "Artificial Intelligence & Data Science", "D Block")}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-colors"
                >
                  + Add AI & DS
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDepts.map(dept => {
            const code = dept.department_id || dept.code;
            const labCount = labCountByDept[code.toUpperCase()] || 0;
            const studentCount = studentCountByDept[code.toUpperCase()] || 0;

            return (
              <div key={dept.department_id} className="card hover:border-slate-300 transition-all p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <span className="text-[11px] font-bold tracking-wider px-2 py-0.5 rounded bg-primary-50 text-primary-700 border border-primary-100 font-mono">
                        {dept.department_id}
                      </span>
                      <h3 className="text-base font-semibold text-slate-900 mt-2">{dept.name}</h3>
                    </div>
                    <button
                      className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                      title="Delete Department"
                      onClick={() => handleDelete(dept.department_id, dept.name)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>

                  <div className="space-y-2 text-xs text-slate-600 my-4 pt-3 border-t border-slate-100">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Building / Location:</span>
                      <span className="font-medium text-slate-700">{dept.building || "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Head of Department (HOD):</span>
                      <span className="font-medium text-slate-700">{dept.hod_name || "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Registered Labs:</span>
                      <span className="font-medium text-slate-700">{labCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Enrolled Students:</span>
                      <span className="font-medium text-slate-700">{studentCount}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <Link
                    to={`/admin/labs`}
                    className="text-primary-600 hover:text-primary-700 font-medium inline-flex items-center gap-1"
                  >
                    View Labs <FlaskConical size={12} />
                  </Link>
                  <Link
                    to={`/admin/students`}
                    className="text-slate-500 hover:text-slate-700 font-medium inline-flex items-center gap-1"
                  >
                    View Students <Users size={12} />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Department Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 relative">
            <h2 className="text-lg font-semibold text-slate-900 mb-1">Add Department</h2>
            <p className="text-xs text-slate-400 mb-4">Register a new academic department into LabPulse.</p>

            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="form-label">Department Code / ID *</label>
                <input
                  type="text"
                  required
                  className="form-input font-mono uppercase"
                  placeholder="e.g. CSE, IT, E&TC, MECH"
                  value={form.department_id}
                  onChange={e => setForm(f => ({ ...f, department_id: e.target.value.toUpperCase() }))}
                />
                <span className="text-[11px] text-slate-400">Unique identifier used for tagging labs and students</span>
              </div>

              <div>
                <label className="form-label">Department Full Name *</label>
                <input
                  type="text"
                  required
                  className="form-input"
                  placeholder="e.g. Computer Science & Engineering"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>

              <div>
                <label className="form-label">Building / Block</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. D Block / Main Campus"
                  value={form.building}
                  onChange={e => setForm(f => ({ ...f, building: e.target.value }))}
                />
              </div>

              <div>
                <label className="form-label">Head of Department (HOD)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Dr. S. K. Dixit"
                  value={form.hod_name}
                  onChange={e => setForm(f => ({ ...f, hod_name: e.target.value }))}
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowAdd(false)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={submitting || !form.department_id || !form.name}
                >
                  {submitting ? "Saving…" : "Add Department"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageWrapper>
  );
}
