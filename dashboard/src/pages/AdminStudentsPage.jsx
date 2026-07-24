import { useState, useMemo } from "react";
import { Plus, Search, Trash2, Edit2, ChevronDown, ChevronRight, Users, GraduationCap } from "lucide-react";
import { students as allStudents } from "../data/mockData";
import { PageWrapper, StatCard } from "../components/Shared";
import { Link } from "react-router-dom";
import { deleteStudent } from "../api/apiClient";

const DEPTS = ["CSE", "IT", "E&TC", "MECH"];
const YEARS = ["FE", "SE", "TE", "BE"];
const YEAR_LABELS = { FE: "First Year", SE: "Second Year", TE: "Third Year", BE: "Final Year" };

const DEPT_COLORS = {
  CSE:    { bg: "bg-blue-50",   border: "border-blue-200",  accent: "bg-blue-600",   text: "text-blue-700",   badge: "bg-blue-100 text-blue-700",   ring: "ring-blue-200" },
  IT:     { bg: "bg-emerald-50", border: "border-emerald-200", accent: "bg-emerald-600", text: "text-emerald-700", badge: "bg-emerald-100 text-emerald-700", ring: "ring-emerald-200" },
  "E&TC": { bg: "bg-amber-50",  border: "border-amber-200", accent: "bg-amber-600",  text: "text-amber-700",  badge: "bg-amber-100 text-amber-700",  ring: "ring-amber-200" },
  MECH:   { bg: "bg-purple-50", border: "border-purple-200", accent: "bg-purple-600", text: "text-purple-700", badge: "bg-purple-100 text-purple-700", ring: "ring-purple-200" },
};

const YEAR_COLORS = {
  FE: "bg-sky-50 text-sky-700 border-sky-200",
  SE: "bg-violet-50 text-violet-700 border-violet-200",
  TE: "bg-orange-50 text-orange-700 border-orange-200",
  BE: "bg-rose-50 text-rose-700 border-rose-200",
};

export default function AdminStudentsPage() {
  const [students, setStudents] = useState(allStudents);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("ALL");
  const [yearFilter, setYearFilter] = useState("ALL");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", student_id: "", department: "CSE", year: "BE", college_login: "" });

  // Track which departments and years are expanded
  const [expandedDepts, setExpandedDepts] = useState(() => new Set(DEPTS));
  const [expandedYears, setExpandedYears] = useState(() => new Set());

  const toggleDept = (dept) => {
    setExpandedDepts(prev => {
      const next = new Set(prev);
      next.has(dept) ? next.delete(dept) : next.add(dept);
      return next;
    });
  };

  const toggleYear = (key) => {
    setExpandedYears(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  // Filter students by search
  const filtered = useMemo(() => students.filter(s =>
    (deptFilter === "ALL" || s.department === deptFilter) &&
    (yearFilter === "ALL" || s.year === yearFilter) &&
    (s.name.toLowerCase().includes(search.toLowerCase()) || s.student_id.toLowerCase().includes(search.toLowerCase()))
  ), [students, deptFilter, yearFilter, search]);

  // Group by department -> year
  const grouped = useMemo(() => {
    const map = {};
    DEPTS.forEach(d => {
      map[d] = {};
      YEARS.forEach(y => { map[d][y] = []; });
    });
    filtered.forEach(s => {
      if (map[s.department] && map[s.department][s.year]) {
        map[s.department][s.year].push(s);
      }
    });
    return map;
  }, [filtered]);

  // Dept counts (from all students, not filtered)
  const deptCounts = useMemo(() => {
    const counts = {};
    DEPTS.forEach(d => { counts[d] = students.filter(s => s.department === d).length; });
    return counts;
  }, [students]);

  const handleAdd = () => {
    setStudents(prev => [...prev, { ...form, role: "student" }]);
    setShowAdd(false);
    setForm({ name: "", student_id: "", department: "CSE", year: "BE", college_login: "" });
  };

  const handleDelete = async (studentId) => {
    const studentName = students.find(s => s.student_id === studentId)?.name || studentId;
    const confirmDelete = window.confirm(
      `Are you sure you want to delete student "${studentName}"?\n\nThis will permanently delete this student record and ALL of their associated sessions, app usages, and behavior metrics.`
    );
    if (confirmDelete) {
      try {
        await deleteStudent(studentId);
        setStudents(prev => prev.filter(x => x.student_id !== studentId));
        alert("Student and all associated data successfully deleted.");
      } catch (err) {
        alert("Failed to delete student: " + err.message);
      }
    }
  };

  const visibleDepts = deptFilter === "ALL" ? DEPTS : [deptFilter];
  const visibleYears = yearFilter === "ALL" ? YEARS : [yearFilter];

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
        {DEPTS.map(d => {
          const c = DEPT_COLORS[d];
          const count = deptCounts[d];
          return (
            <button key={d} onClick={() => setDeptFilter(prev => prev === d ? "ALL" : d)}
              className={`stat-card text-left transition-all ${deptFilter === d ? `ring-2 ${c.ring} shadow-md` : "hover:shadow-md"}`}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="stat-label">{d} Department</p>
                  <p className="stat-value mt-1">{count}</p>
                  <p className="text-xs text-slate-500 mt-1">students</p>
                </div>
                <div className={`p-2.5 rounded-lg ${c.bg} ${c.text}`}>
                  <Users size={20} />
                </div>
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
          {DEPTS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select className="form-select w-28" value={yearFilter} onChange={e => setYearFilter(e.target.value)}>
          <option value="ALL">All Years</option>
          {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <button className="btn-secondary btn-sm text-xs"
          onClick={() => { setExpandedDepts(new Set(DEPTS)); setExpandedYears(new Set(DEPTS.flatMap(d => YEARS.map(y => `${d}-${y}`)))); }}>
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
          const c = DEPT_COLORS[dept];
          const deptStudents = filtered.filter(s => s.department === dept);
          const isDeptOpen = expandedDepts.has(dept);

          if (deptStudents.length === 0 && search) return null;

          return (
            <div key={dept} className={`card overflow-hidden border ${c.border} transition-all`}>
              {/* Department header */}
              <button
                className={`w-full flex items-center gap-3 px-5 py-4 ${c.bg} hover:brightness-[0.97] transition-all`}
                onClick={() => toggleDept(dept)}
              >
                <div className={`w-8 h-8 rounded-lg ${c.accent} text-white flex items-center justify-center shrink-0`}>
                  <GraduationCap size={16} />
                </div>
                <div className="flex-1 text-left">
                  <h2 className={`font-semibold text-sm ${c.text}`}>{dept} Department</h2>
                  <p className="text-xs text-slate-500 mt-0.5">{deptStudents.length} students</p>
                </div>
                {/* Year breakdown badges */}
                <div className="hidden sm:flex items-center gap-1.5 mr-2">
                  {visibleYears.map(y => {
                    const count = grouped[dept]?.[y]?.length || 0;
                    if (count === 0) return null;
                    return (
                      <span key={y} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${YEAR_COLORS[y]}`}>
                        {y}: {count}
                      </span>
                    );
                  })}
                </div>
                {isDeptOpen ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
              </button>

              {/* Year subcategories */}
              {isDeptOpen && (
                <div className="divide-y divide-slate-100">
                  {visibleYears.map(year => {
                    const yearStudents = grouped[dept]?.[year] || [];
                    const yearKey = `${dept}-${year}`;
                    const isYearOpen = expandedYears.has(yearKey);

                    if (yearStudents.length === 0) return null;

                    return (
                      <div key={yearKey}>
                        {/* Year subheader */}
                        <button
                          className="w-full flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors"
                          onClick={() => toggleYear(yearKey)}
                        >
                          {isYearOpen
                            ? <ChevronDown size={14} className="text-slate-400 shrink-0" />
                            : <ChevronRight size={14} className="text-slate-400 shrink-0" />
                          }
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${YEAR_COLORS[year]}`}>
                            {year}
                          </span>
                          <span className="text-sm font-medium text-slate-700">{YEAR_LABELS[year]}</span>
                          <span className="text-xs text-slate-400 ml-auto">{yearStudents.length} students</span>
                        </button>

                        {/* Student rows */}
                        {isYearOpen && (
                          <div className="bg-white">
                            <table className="table">
                              <thead>
                                <tr className="!bg-slate-50/70">
                                  <th className="!text-[10px] !py-2">Name</th>
                                  <th className="!text-[10px] !py-2">Student ID</th>
                                  <th className="!text-[10px] !py-2">Email</th>
                                  <th className="!text-[10px] !py-2 text-right">Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {yearStudents.map(s => (
                                  <tr key={s.student_id} className="hover:bg-slate-50/50">
                                    <td>
                                      <Link to={`/students/${s.student_id}`} className="font-medium text-primary-600 hover:underline text-sm">
                                        {s.name}
                                      </Link>
                                    </td>
                                    <td className="font-mono text-xs text-slate-600">{s.student_id}</td>
                                    <td className="text-xs text-slate-500">{s.college_login}</td>
                                    <td>
                                      <div className="flex items-center justify-end gap-1">
                                        <button className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded" title="Edit">
                                          <Edit2 size={12} />
                                        </button>
                                        <button className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded" title="Remove"
                                          onClick={() => handleDelete(s.student_id)}>
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

                  {/* Empty state for this department */}
                  {visibleYears.every(y => (grouped[dept]?.[y] || []).length === 0) && (
                    <p className="text-center text-slate-400 py-6 text-sm">No students match your filters in {dept}.</p>
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
          <p className="text-slate-400 text-sm">No students match your search or filters.</p>
        </div>
      )}

      {/* Add Student modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-base font-semibold mb-4">Add Student</h2>
            <div className="space-y-3">
              {[
                ["Name", "name", "text", "Full name"],
                ["Student ID", "student_id", "text", "e.g. CS2024001"],
                ["Email", "college_login", "email", "name@wit.ac.in"],
              ].map(([label, key, type, placeholder]) => (
                <div key={key}>
                  <label className="form-label">{label}</label>
                  <input type={type} className="form-input" placeholder={placeholder}
                    value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
                </div>
              ))}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Department</label>
                  <select className="form-select" value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}>
                    {DEPTS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">Year</label>
                  <select className="form-select" value={form.year} onChange={e => setForm(f => ({ ...f, year: e.target.value }))}>
                    {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button className="btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleAdd} disabled={!form.name || !form.student_id}>Add Student</button>
            </div>
          </div>
        </div>
      )}
    </PageWrapper>
  );
}
