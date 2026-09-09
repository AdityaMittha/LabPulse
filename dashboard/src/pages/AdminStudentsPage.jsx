import { useState, useMemo, useEffect } from "react";
import { Plus, Search, Trash2, Edit2, ChevronDown, ChevronRight, Users, GraduationCap } from "lucide-react";
import { PageWrapper } from "../components/Shared";
import { Link } from "react-router-dom";
import { fetchStudents, deleteStudent, addStudent, updateStudent, fetchDepartments } from "../api/apiClient";
import ConfirmModal from "../components/ConfirmModal";
const YEARS = ["FE", "SE", "TE", "BE"];
const YEAR_LABELS = { FE: "First Year", SE: "Second Year", TE: "Third Year", BE: "Final Year" };

const DEPT_COLORS = {
  CSE:    { bg: "bg-slate-50",   border: "border-slate-200",  accent: "bg-slate-600",   text: "text-slate-700",   ring: "ring-slate-300" },
  IT:     { bg: "bg-slate-50",   border: "border-slate-200",  accent: "bg-primary-600", text: "text-primary-700", ring: "ring-primary-200" },
  "E&TC": { bg: "bg-slate-50",   border: "border-slate-200",  accent: "bg-amber-600",   text: "text-amber-700",   ring: "ring-amber-200" },
};

const YEAR_COLORS = {
  FE: "bg-slate-100 text-slate-600",
  SE: "bg-slate-100 text-slate-600",
  TE: "bg-slate-100 text-slate-600",
  BE: "bg-slate-100 text-slate-600",
};

export default function AdminStudentsPage() {
  const [departments, setDepartments] = useState([]);
  const [students,    setStudents]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [search,      setSearch]      = useState("");
  const [deptFilter,  setDeptFilter]  = useState("ALL");
  const [yearFilter,  setYearFilter]  = useState("ALL");
  const [showAdd,     setShowAdd]     = useState(false);
  const [submitting,  setSubmitting]  = useState(false);
  const [form, setForm] = useState({ name: "", student_id: "", pnr_no: "", password: "", department: "CSE", year: "BE", college_login: "" });

  // Load students & departments from API
  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([fetchStudents(), fetchDepartments().catch(() => [])])
      .then(([studentsData, deptsData]) => {
        const normalized = (studentsData || []).map(s => {
          const id = s.student_id || s.pnr_no || "";
          return { ...s, student_id: id, pnr_no: id };
        });
        setStudents(normalized);
        setDepartments(deptsData);
        if (deptsData.length > 0) {
          setForm(f => ({ ...f, department: deptsData[0].department_id || deptsData[0].code }));
        }
        setLoading(false);
      })
      .catch(err => { setError(err.message); setLoading(false); });
  }, []);

  const deptList = useMemo(() => {
    const list = departments.map(d => d.department_id || d.code);
    students.forEach(s => {
      if (s.department && !list.includes(s.department)) {
        list.push(s.department);
      }
    });
    return list.length > 0 ? list : ["CSE", "IT", "E&TC"];
  }, [departments, students]);

  const [expandedDepts, setExpandedDepts] = useState(() => new Set());
  const [expandedYears, setExpandedYears] = useState(() => new Set());

  useEffect(() => {
    if (deptList.length > 0) {
      setExpandedDepts(new Set(deptList));
      setExpandedYears(new Set(deptList.flatMap(d => YEARS.map(y => `${d}-${y}`))));
    }
  }, [deptList]);

  const toggleDept = dept => {
    setExpandedDepts(prev => {
      const next = new Set(prev);
      next.has(dept) ? next.delete(dept) : next.add(dept);
      return next;
    });
  };

  const toggleYear = key => {
    setExpandedYears(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const filtered = useMemo(() => students.filter(s =>
    (deptFilter === "ALL" || s.department === deptFilter) &&
    (yearFilter === "ALL" || s.year === yearFilter) &&
    (s.name.toLowerCase().includes(search.toLowerCase()) ||
     s.student_id.toLowerCase().includes(search.toLowerCase()) ||
     (s.pnr_no && s.pnr_no.toLowerCase().includes(search.toLowerCase())))
  ), [students, deptFilter, yearFilter, search]);

  const grouped = useMemo(() => {
    const map = {};
    deptList.forEach(d => {
      map[d] = {};
      YEARS.forEach(y => { map[d][y] = []; });
    });
    filtered.forEach(s => {
      if (!map[s.department]) {
        map[s.department] = {};
        YEARS.forEach(y => { map[s.department][y] = []; });
      }
      if (map[s.department][s.year]) {
        map[s.department][s.year].push(s);
      }
    });
    return map;
  }, [filtered, deptList]);

  const deptCounts = useMemo(() => {
    const counts = {};
    deptList.forEach(d => { counts[d] = students.filter(s => s.department === d).length; });
    return counts;
  }, [students, deptList]);

  const handleAdd = async () => {
    const idVal = (form.student_id || form.pnr_no || "").trim();
    const nameVal = form.name.trim();
    const passVal = form.password.trim();
    const emailVal = form.college_login.trim();
    if (!nameVal || !idVal || !passVal || !emailVal) {
      alert("Please enter Name, PNR No., Password, and Email (all are compulsory).");
      return;
    }
    setSubmitting(true);
    try {
      const newStudent = { ...form, student_id: idVal, pnr_no: idVal, role: "student" };
      await addStudent(newStudent);
      setStudents(prev => [...prev, newStudent]);
      setShowAdd(false);
      setForm({ name: "", student_id: "", pnr_no: "", password: "", department: "CSE", year: "BE", college_login: "" });
    } catch (err) {
      alert("Failed to add student: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const [editingStudent, setEditingStudent] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", student_id: "", pnr_no: "", password: "", department: "CSE", year: "BE", college_login: "" });
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const handleOpenEdit = (student) => {
    const sId = student.student_id || student.pnr_no || "";
    setEditingStudent(student);
    setEditForm({
      name: student.name || "",
      student_id: sId,
      pnr_no: sId,
      password: "",
      department: student.department || "CSE",
      year: student.year || "BE",
      college_login: student.college_login || "",
    });
  };

  const handleSaveEdit = async () => {
    const nameVal = editForm.name.trim();
    const emailVal = editForm.college_login.trim();
    if (!nameVal || !emailVal) {
      alert("Name and Email are compulsory.");
      return;
    }
    setEditSubmitting(true);
    try {
      await updateStudent(editForm);
      setStudents(prev => prev.map(s => {
        if (s.student_id === editingStudent.student_id) {
          return {
            ...s,
            name: nameVal,
            college_login: emailVal,
            department: editForm.department,
            year: editForm.year,
          };
        }
        return s;
      }));
      setEditingStudent(null);
    } catch (err) {
      alert("Failed to update student: " + err.message);
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    await deleteStudent(deleteTarget.student_id);
    setStudents(prev => prev.filter(x => x.student_id !== deleteTarget.student_id));
    setDeleteTarget(null);
  };

  const visibleDepts = deptFilter === "ALL" ? deptList : [deptFilter];
  const visibleYears = yearFilter === "ALL" ? YEARS : [yearFilter];

  if (loading) {
    return (
      <PageWrapper>
        <div className="flex items-center justify-center h-[calc(100vh-120px)]">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-slate-200 border-t-primary-600 rounded-full animate-spin"></div>
            <span className="text-sm text-slate-400">Loading students…</span>
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
            <p className="text-red-500 font-medium text-sm">Failed to load students</p>
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
          <h1 className="page-title">Students</h1>
          <p className="page-subtitle">Categorized by department and year ({students.length} total)</p>
        </div>
        <button className="btn-primary btn-sm" onClick={() => setShowAdd(true)}>
          <Plus size={14} /> Add Student
        </button>
      </div>

      {/* Department stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {deptList.map(d => {
          const c     = DEPT_COLORS[d] || { bg: "bg-slate-50", border: "border-slate-200", accent: "bg-primary-600", text: "text-primary-700", ring: "ring-primary-200" };
          const count = deptCounts[d] || 0;
          return (
            <button key={d} onClick={() => setDeptFilter(prev => prev === d ? "ALL" : d)}
              className={`stat-card text-left transition-all ${deptFilter === d ? `ring-2 ${c.ring}` : "hover:bg-slate-50/50"}`}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="stat-label">{d} Department</p>
                  <p className="stat-value mt-1">{count}</p>
                  <p className="text-xs text-slate-400 mt-1">students</p>
                </div>
                <Users size={18} className="text-slate-300 mt-0.5" />
              </div>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="form-input pl-8" placeholder="Search name or ID..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="form-select w-28" value={deptFilter} onChange={e => setDeptFilter(e.target.value)}>
          <option value="ALL">All Depts</option>
          {deptList.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select className="form-select w-28" value={yearFilter} onChange={e => setYearFilter(e.target.value)}>
          <option value="ALL">All Years</option>
          {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <button className="btn-secondary btn-sm text-xs"
          onClick={() => { setExpandedDepts(new Set(deptList)); setExpandedYears(new Set(deptList.flatMap(d => YEARS.map(y => `${d}-${y}`)))); }}>
          Expand All
        </button>
        <button className="btn-secondary btn-sm text-xs"
          onClick={() => { setExpandedDepts(new Set()); setExpandedYears(new Set()); }}>
          Collapse All
        </button>
      </div>

      {/* Department accordion cards */}
      <div className="space-y-4">
        {visibleDepts.map(dept => {
          const c            = DEPT_COLORS[dept] || { bg: "bg-slate-50", border: "border-slate-200", accent: "bg-primary-600", text: "text-primary-700", ring: "ring-primary-200" };
          const deptStudents = filtered.filter(s => s.department === dept);
          const isDeptOpen   = expandedDepts.has(dept);

          if (deptStudents.length === 0 && search) return null;

          return (
            <div key={dept} className="card overflow-hidden transition-all">
              {/* Department header */}
              <button
                className="w-full flex items-center gap-3 px-5 py-4 bg-slate-50 hover:bg-slate-100/50 transition-all"
                onClick={() => toggleDept(dept)}
              >
                <div className={`w-7 h-7 rounded-lg ${c.accent} text-white flex items-center justify-center shrink-0`}>
                  <GraduationCap size={14} />
                </div>
                <div className="flex-1 text-left">
                  <h2 className="font-semibold text-sm text-slate-700">{dept} Department</h2>
                  <p className="text-xs text-slate-400 mt-0.5">{deptStudents.length} students</p>
                </div>
                <div className="hidden sm:flex items-center gap-1.5 mr-2">
                  {visibleYears.map(y => {
                    const count = grouped[dept]?.[y]?.length || 0;
                    if (count === 0) return null;
                    return (
                      <span key={y} className={`text-[10px] font-medium px-2 py-0.5 rounded-md ${YEAR_COLORS[y]}`}>
                        {y}: {count}
                      </span>
                    );
                  })}
                </div>
                {isDeptOpen ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
              </button>

              {isDeptOpen && (
                <div className="divide-y divide-slate-100/60">
                  {visibleYears.map(year => {
                    const yearStudents = grouped[dept]?.[year] || [];
                    const yearKey      = `${dept}-${year}`;
                    const isYearOpen   = expandedYears.has(yearKey);

                    if (yearStudents.length === 0) return null;

                    return (
                      <div key={yearKey}>
                        <button
                          className="w-full flex items-center gap-3 px-5 py-3 hover:bg-slate-50/50 transition-colors"
                          onClick={() => toggleYear(yearKey)}
                        >
                          {isYearOpen
                            ? <ChevronDown size={14} className="text-slate-400 shrink-0" />
                            : <ChevronRight size={14} className="text-slate-400 shrink-0" />
                          }
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md ${YEAR_COLORS[year]}`}>{year}</span>
                          <span className="text-sm font-medium text-slate-600">{YEAR_LABELS[year]}</span>
                          <span className="text-xs text-slate-400 ml-auto">{yearStudents.length} students</span>
                        </button>

                        {isYearOpen && (
                          <div className="bg-white">
                            <table className="table">
                              <thead>
                                <tr>
                                  <th className="!text-[10px] !py-2">Name</th>
                                  <th className="!text-[10px] !py-2">Student ID / PNR No.</th>
                                  <th className="!text-[10px] !py-2">Email</th>
                                  <th className="!text-[10px] !py-2 text-right">Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {yearStudents.map(s => (
                                  <tr key={s.student_id}>
                                    <td>
                                      <Link to={`/students/${s.student_id}`} className="font-medium text-primary-600 hover:underline text-sm">
                                        {s.name}
                                      </Link>
                                    </td>
                                    <td className="font-mono text-xs font-semibold text-slate-700">{s.student_id || s.pnr_no}</td>
                                    <td className="text-xs text-slate-400">{s.college_login}</td>
                                    <td>
                                      <div className="flex items-center justify-end gap-1">
                                        <button
                                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded"
                                          title="Edit Student"
                                          onClick={() => handleOpenEdit(s)}
                                        >
                                          <Edit2 size={12} />
                                        </button>
                                        <button
                                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded"
                                          title="Delete Student & Erase Data"
                                          onClick={() => setDeleteTarget(s)}
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

                  {visibleYears.every(y => (grouped[dept]?.[y] || []).length === 0) && (
                    <p className="text-center text-slate-400 py-6 text-sm">No students match your filters in {dept}.</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="card card-body text-center py-12 mt-4">
          <p className="text-slate-400 text-sm">No students match your search or filters.</p>
        </div>
      )}

      {/* Add Student modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <h2 className="text-base font-semibold text-slate-800 mb-4">Add Student</h2>
            <div className="space-y-3">
              {[
                ["Name", "name", "text", "Full name", true],
                ["Student ID / PNR No.", "student_id", "text", "e.g. 2024WIT001 (used for ID & PC login)", true],
                ["Password", "password", "password", "Password for PC login (compulsory)", true],
                ["Email", "college_login", "email", "name@college.ac.in", true],
              ].map(([label, key, type, placeholder, compulsory]) => (
                <div key={key}>
                  <label className="form-label">
                    {label}
                    {compulsory && <span className="text-red-500 ml-1 font-bold">*</span>}
                  </label>
                  <input
                    type={type}
                    className="form-input"
                    placeholder={placeholder}
                    required={compulsory}
                    value={form[key]}
                    onChange={e => {
                      const val = e.target.value;
                      if (key === "student_id") {
                        setForm(f => ({ ...f, student_id: val, pnr_no: val }));
                      } else {
                        setForm(f => ({ ...f, [key]: val }));
                      }
                    }}
                  />
                </div>
              ))}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Department <span className="text-red-500 font-bold">*</span></label>
                  <select className="form-select" value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}>
                    {deptList.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">Year <span className="text-red-500 font-bold">*</span></label>
                  <select className="form-select" value={form.year} onChange={e => setForm(f => ({ ...f, year: e.target.value }))}>
                    {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button className="btn-secondary" onClick={() => setShowAdd(false)} disabled={submitting}>Cancel</button>
              <button
                className="btn-primary"
                onClick={handleAdd}
                disabled={!form.name.trim() || !form.student_id.trim() || !form.password.trim() || !form.college_login.trim() || submitting}
              >
                {submitting ? "Adding…" : "Add Student"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Student modal */}
      {editingStudent && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <h2 className="text-base font-semibold text-slate-800 mb-1">Edit Student</h2>
            <p className="text-xs text-slate-400 mb-4 font-mono">{editForm.student_id}</p>
            <div className="space-y-3">
              <div>
                <label className="form-label">Name <span className="text-red-500 font-bold">*</span></label>
                <input
                  type="text"
                  className="form-input"
                  value={editForm.name}
                  onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div>
                <label className="form-label">Email <span className="text-red-500 font-bold">*</span></label>
                <input
                  type="email"
                  className="form-input"
                  value={editForm.college_login}
                  onChange={e => setEditForm(f => ({ ...f, college_login: e.target.value }))}
                />
              </div>
              <div>
                <label className="form-label">Password <span className="text-xs text-slate-400 font-normal">(Leave blank to keep unchanged)</span></label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="New password (optional)"
                  value={editForm.password}
                  onChange={e => setEditForm(f => ({ ...f, password: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Department <span className="text-red-500 font-bold">*</span></label>
                  <select className="form-select" value={editForm.department} onChange={e => setEditForm(f => ({ ...f, department: e.target.value }))}>
                    {deptList.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">Year <span className="text-red-500 font-bold">*</span></label>
                  <select className="form-select" value={editForm.year} onChange={e => setEditForm(f => ({ ...f, year: e.target.value }))}>
                    {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button className="btn-secondary" onClick={() => setEditingStudent(null)} disabled={editSubmitting}>Cancel</button>
              <button
                className="btn-primary"
                onClick={handleSaveEdit}
                disabled={!editForm.name.trim() || !editForm.college_login.trim() || editSubmitting}
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
        title={`Delete Student: ${deleteTarget?.name || deleteTarget?.student_id}`}
        message={`Are you sure you want to delete student "${deleteTarget?.name}" (${deleteTarget?.student_id})? This will permanently delete this student record and erase ALL associated session history, app usage, and activity logs.`}
        confirmLabel="Delete & Erase All Data"
        onConfirm={handleConfirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </PageWrapper>
  );
}
