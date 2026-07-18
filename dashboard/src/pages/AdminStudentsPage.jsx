import { useState, useMemo } from "react";
import { Plus, Search, Trash2, Edit2 } from "lucide-react";
import { students as allStudents } from "../data/mockData";
import { PageWrapper } from "../components/Shared";
import { Link } from "react-router-dom";

const DEPTS = ["ALL","CSE","IT","E&TC","MECH"];
const YEARS = ["ALL","FE","SE","TE","BE"];

export default function AdminStudentsPage() {
  const [students, setStudents] = useState(allStudents);
  const [search,   setSearch]   = useState("");
  const [dept,     setDept]     = useState("ALL");
  const [year,     setYear]     = useState("ALL");
  const [showAdd,  setShowAdd]  = useState(false);
  const [form, setForm] = useState({ name:"", student_id:"", department:"CSE", year:"BE", college_login:"" });

  const filtered = useMemo(() => students.filter(s =>
    (dept === "ALL" || s.department === dept) &&
    (year === "ALL" || s.year === year) &&
    (s.name.toLowerCase().includes(search.toLowerCase()) || s.student_id.toLowerCase().includes(search.toLowerCase()))
  ), [students, dept, year, search]);

  const handleAdd = () => {
    setStudents(prev => [...prev, { ...form, role: "student" }]);
    setShowAdd(false);
    setForm({ name:"", student_id:"", department:"CSE", year:"BE", college_login:"" });
  };

  return (
    <PageWrapper>
      <div className="page-header">
        <div>
          <h1 className="page-title">Students</h1>
          <p className="page-subtitle">Manage student records ({students.length} total)</p>
        </div>
        <button className="btn-primary btn-sm" onClick={() => setShowAdd(true)}>
          <Plus size={14} /> Add Student
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="form-input pl-8" placeholder="Search name or ID…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="form-select w-28" value={dept} onChange={e => setDept(e.target.value)}>
          {DEPTS.map(d => <option key={d}>{d === "ALL" ? "All Depts" : d}</option>)}
        </select>
        <select className="form-select w-28" value={year} onChange={e => setYear(e.target.value)}>
          {YEARS.map(y => <option key={y}>{y === "ALL" ? "All Years" : y}</option>)}
        </select>
      </div>

      <div className="card">
        <div className="px-5 py-3 border-b border-slate-100 text-xs text-slate-500">{filtered.length} students</div>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr><th>Name</th><th>Student ID</th><th>Dept</th><th>Year</th><th>Email</th><th className="text-right">Actions</th></tr>
            </thead>
            <tbody>
              {filtered.slice(0, 30).map(s => (
                <tr key={s.student_id}>
                  <td>
                    <Link to={`/students/${s.student_id}`} className="font-medium text-primary-600 hover:underline">{s.name}</Link>
                  </td>
                  <td className="font-mono text-xs text-slate-600">{s.student_id}</td>
                  <td><span className="badge badge-blue">{s.department}</span></td>
                  <td className="text-slate-600 text-xs">{s.year}</td>
                  <td className="text-xs text-slate-500">{s.college_login}</td>
                  <td>
                    <div className="flex items-center justify-end gap-2">
                      <button className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded" title="Edit"><Edit2 size={13} /></button>
                      <button className="p-1.5 text-slate-400 hover:text-danger hover:bg-red-50 rounded" title="Remove"
                        onClick={() => setStudents(prev => prev.filter(x => x.student_id !== s.student_id))}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="text-center py-10 text-slate-400">No students match your filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add modal */}
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
                    value={form[key]} onChange={e => setForm(f=>({...f,[key]:e.target.value}))} />
                </div>
              ))}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Department</label>
                  <select className="form-select" value={form.department} onChange={e => setForm(f=>({...f,department:e.target.value}))}>
                    {["CSE","IT","E&TC","MECH"].map(d => <option key={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">Year</label>
                  <select className="form-select" value={form.year} onChange={e => setForm(f=>({...f,year:e.target.value}))}>
                    {["FE","SE","TE","BE"].map(y => <option key={y}>{y}</option>)}
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
