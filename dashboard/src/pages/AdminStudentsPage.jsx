import { useState, useMemo, useEffect, useRef } from "react";
import { Plus, Search, Trash2, Edit2, ChevronDown, ChevronRight, Users, GraduationCap, Upload, Download, FileSpreadsheet, X, CheckCircle2, RefreshCw, AlertCircle } from "lucide-react";
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
  const [batchFilter, setBatchFilter] = useState("ALL");
  const [showAdd,     setShowAdd]     = useState(false);
  const [submitting,  setSubmitting]  = useState(false);
  const [form, setForm] = useState({ name: "", roll_no: "", student_id: "", pnr_no: "", batch: "", password: "", department: "CSE", year: "BE" });

  // CSV Import & Export State
  const [showCsvModal,     setShowCsvModal]     = useState(false);
  const [csvFile,          setCsvFile]          = useState(null);
  const [parsedRows,       setParsedRows]       = useState([]);
  const [importing,        setImporting]        = useState(false);
  const [importProgress,   setImportProgress]   = useState({ current: 0, total: 0 });
  const [importResults,    setImportResults]    = useState(null);
  const [defaultDept,      setDefaultDept]      = useState("CSE");
  const [defaultYear,      setDefaultYear]      = useState("BE");
  const [defaultPassword,  setDefaultPassword]  = useState("Welcome@123");
  const fileInputRef = useRef(null);

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
          const d0 = deptsData[0].department_id || deptsData[0].code;
          setForm(f => ({ ...f, department: d0 }));
          setDefaultDept(d0);
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

  const batchList = useMemo(() => {
    const set = new Set();
    students.forEach(s => {
      if (s.batch && s.batch.trim()) set.add(s.batch.trim().toUpperCase());
    });
    return Array.from(set).sort();
  }, [students]);

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
    (batchFilter === "ALL" || (s.batch || "").toUpperCase() === batchFilter.toUpperCase()) &&
    (s.name.toLowerCase().includes(search.toLowerCase()) ||
     s.student_id.toLowerCase().includes(search.toLowerCase()) ||
     (s.pnr_no && s.pnr_no.toLowerCase().includes(search.toLowerCase())) ||
     (s.roll_no && s.roll_no.toLowerCase().includes(search.toLowerCase())) ||
     (s.batch && s.batch.toLowerCase().includes(search.toLowerCase())))
  ), [students, deptFilter, yearFilter, batchFilter, search]);

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
    const rollVal = (form.roll_no || "").trim();
    const batchVal = (form.batch || "").trim().toUpperCase();
    if (!nameVal || !idVal || !passVal) {
      alert("Please enter Name, PNR No., and Password (compulsory).");
      return;
    }
    setSubmitting(true);
    try {
      const newStudent = {
        ...form,
        student_id: idVal,
        pnr_no: idVal,
        roll_no: rollVal,
        batch: batchVal,
        role: "student"
      };
      await addStudent(newStudent);
      setStudents(prev => [...prev, newStudent]);
      setShowAdd(false);
      setForm({ name: "", roll_no: "", student_id: "", pnr_no: "", batch: "", password: "", department: defaultDept || "CSE", year: defaultYear || "BE" });
    } catch (err) {
      alert("Failed to add student: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const [editingStudent, setEditingStudent] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", roll_no: "", student_id: "", pnr_no: "", batch: "", password: "", department: "CSE", year: "BE" });
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const handleOpenEdit = (student) => {
    const sId = student.student_id || student.pnr_no || "";
    setEditingStudent(student);
    setEditForm({
      name: student.name || "",
      roll_no: student.roll_no || "",
      student_id: sId,
      pnr_no: sId,
      batch: student.batch || "",
      password: "",
      department: student.department || "CSE",
      year: student.year || "BE",
    });
  };

  const handleSaveEdit = async () => {
    const nameVal = editForm.name.trim();
    const rollVal = (editForm.roll_no || "").trim();
    const batchVal = (editForm.batch || "").trim().toUpperCase();
    if (!nameVal) {
      alert("Name is compulsory.");
      return;
    }
    setEditSubmitting(true);
    try {
      await updateStudent({ ...editForm, roll_no: rollVal, batch: batchVal });
      setStudents(prev => prev.map(s => {
        if (s.student_id === editingStudent.student_id) {
          return {
            ...s,
            name: nameVal,
            roll_no: rollVal,
            batch: batchVal,
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

  // ── CSV Import & Export Logic ─────────────────────────────────────────────

  const downloadSampleCsv = () => {
    const d = defaultDept || deptList[0] || "CSE";
    const csvContent = [
      "roll_no,student_id,name,batch,department,year,password",
      `01,2024${d}001,Aarav Sharma,A1,${d},BE,Welcome@123`,
      `02,2024${d}002,Priya Patil,A2,${d},TE,Welcome@123`,
      `03,2024${d}003,Rohan Kulkarni,B1,${d},SE,Welcome@123`,
      `04,2024${d}004,Ananya Deshmukh,B2,${d},FE,Welcome@123`
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "students_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportCurrentStudents = () => {
    const listToExport = filtered.length > 0 ? filtered : students;
    if (listToExport.length === 0) {
      alert("No students to export.");
      return;
    }
    const headers = "roll_no,student_id,name,batch,department,year";
    const rows = listToExport.map(s => {
      const roll = (s.roll_no || "").replace(/"/g, '""');
      const sId = (s.student_id || s.pnr_no || "").replace(/"/g, '""');
      const name = (s.name || "").replace(/"/g, '""');
      const batch = (s.batch || "").replace(/"/g, '""');
      const dept = (s.department || "").replace(/"/g, '""');
      const yr = (s.year || "").replace(/"/g, '""');
      return `"${roll}","${sId}","${name}","${batch}","${dept}","${yr}"`;
    });
    const csvContent = [headers, ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const filterSuffix = deptFilter !== "ALL" || yearFilter !== "ALL" || batchFilter !== "ALL"
      ? `_${deptFilter}_${yearFilter}${batchFilter !== "ALL" ? `_${batchFilter}` : ""}`
      : "_all";
    link.setAttribute("download", `students${filterSuffix}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const normalizeYear = (val) => {
    if (!val) return "";
    const clean = String(val).trim().toUpperCase();
    if (YEARS.includes(clean)) return clean;
    if (clean === "1" || clean.includes("FIRST") || clean === "1ST") return "FE";
    if (clean === "2" || clean.includes("SECOND") || clean === "2ND") return "SE";
    if (clean === "3" || clean.includes("THIRD") || clean === "3RD") return "TE";
    if (clean === "4" || clean.includes("FOURTH") || clean.includes("FINAL") || clean === "4TH") return "BE";
    return clean;
  };

  const parseCsvText = (text, fallbackDept = defaultDept, fallbackYear = defaultYear, fallbackPass = defaultPassword) => {
    const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length < 2) {
      alert("CSV file is empty or missing data rows.");
      return [];
    }

    const rawHeaders = lines[0].split(",").map(h => h.trim().replace(/^["']|["']$/g, "").toLowerCase());

    const colMap = {};
    rawHeaders.forEach((header, index) => {
      if (header.includes("roll") || header.includes("rno")) {
        colMap.roll_no = index;
      } else if (header.includes("pnr") || header.includes("student_id") || header.includes("prn")) {
        colMap.student_id = index;
      } else if (header.includes("name") || header.includes("fullname")) {
        colMap.name = index;
      } else if (header.includes("batch") || header.includes("group") || header.includes("division") || header.includes("section")) {
        colMap.batch = index;
      } else if (header.includes("email") || header.includes("login") || header.includes("mail")) {
        colMap.college_login = index;
      } else if (header.includes("dept") || header.includes("branch") || header.includes("department")) {
        colMap.department = index;
      } else if (header.includes("year") || header.includes("class") || header.includes("academic_year")) {
        colMap.year = index;
      } else if (header.includes("pass") || header.includes("pwd")) {
        colMap.password = index;
      }
    });

    if (colMap.student_id === undefined && rawHeaders.includes("id")) {
      colMap.student_id = rawHeaders.indexOf("id");
    }

    const existingIdSet = new Set(students.map(s => (s.student_id || s.pnr_no || "").toLowerCase()));
    const seenInCsv = new Set();
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values = [];
      let inQuotes = false;
      let curVal = "";
      for (let c = 0; c < line.length; c++) {
        const char = line[c];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(curVal.trim().replace(/^["']|["']$/g, ""));
          curVal = "";
        } else {
          curVal += char;
        }
      }
      values.push(curVal.trim().replace(/^["']|["']$/g, ""));

      const getVal = (field) => {
        const idx = colMap[field];
        return idx !== undefined && values[idx] !== undefined ? values[idx].trim() : "";
      };

      const rawId = getVal("student_id");
      const roll_no = getVal("roll_no");
      const name = getVal("name");
      const batch = (getVal("batch") || "").toUpperCase();
      const email = getVal("college_login");
      const deptRaw = getVal("department");
      const yearRaw = getVal("year");
      const passRaw = getVal("password");

      const student_id = rawId;
      let department = fallbackDept || "CSE";
      if (deptRaw) {
        const found = deptList.find(d => d.toLowerCase() === deptRaw.toLowerCase());
        department = found || deptRaw.toUpperCase();
      }

      const year = normalizeYear(yearRaw) || fallbackYear || "BE";
      const password = passRaw || fallbackPass || student_id;

      const errors = [];
      if (!student_id) errors.push("Missing Student ID / PNR No.");
      if (!name) errors.push("Missing Name.");
      if (!YEARS.includes(year)) {
        errors.push(`Invalid Year (${year}). Expected FE, SE, TE, or BE.`);
      }
      if (!password) {
        errors.push("Missing Password.");
      }

      const idLower = student_id.toLowerCase();
      if (student_id) {
        if (seenInCsv.has(idLower)) {
          errors.push(`Duplicate ID within CSV (${student_id}).`);
        } else {
          seenInCsv.add(idLower);
        }

        if (existingIdSet.has(idLower)) {
          errors.push(`Student with ID ${student_id} already exists.`);
        }
      }

      rows.push({
        id: i,
        student_id,
        pnr_no: student_id,
        roll_no,
        name,
        batch,
        college_login: email,
        department,
        year,
        password,
        role: "student",
        isValid: errors.length === 0,
        errors,
      });
    }

    return rows;
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setCsvFile(file);
    setImportResults(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const rows = parseCsvText(text, defaultDept, defaultYear, defaultPassword);
      setParsedRows(rows);
    };
    reader.readAsText(file);
  };

  const handleDefaultSettingChange = (newDept, newYear, newPass) => {
    if (csvFile) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target.result;
        const rows = parseCsvText(text, newDept, newYear, newPass);
        setParsedRows(rows);
      };
      reader.readAsText(csvFile);
    }
  };

  const handleExecuteImport = async () => {
    const validRows = parsedRows.filter(r => r.isValid);
    if (validRows.length === 0) {
      alert("No valid rows to import.");
      return;
    }

    setImporting(true);
    setImportProgress({ current: 0, total: validRows.length });

    let successCount = 0;
    let failCount = 0;
    const successfullyAdded = [];
    const failedItems = [];

    for (let i = 0; i < validRows.length; i++) {
      const r = validRows[i];
      try {
        const studentPayload = {
          student_id:    r.student_id,
          pnr_no:        r.pnr_no || r.student_id,
          roll_no:       r.roll_no || "",
          name:          r.name,
          batch:         r.batch || "",
          password:      r.password,
          department:    r.department,
          year:          r.year,
          role:          "student",
        };
        await addStudent(studentPayload);
        successfullyAdded.push(studentPayload);
        successCount++;
      } catch (err) {
        console.error("Failed to import student:", r.student_id, err);
        failedItems.push({ student_id: r.student_id, name: r.name, error: err.message });
        failCount++;
      }
      setImportProgress({ current: i + 1, total: validRows.length });
    }

    if (successfullyAdded.length > 0) {
      setStudents(prev => {
        const existingMap = new Map(prev.map(s => [s.student_id, s]));
        successfullyAdded.forEach(s => existingMap.set(s.student_id, s));
        return Array.from(existingMap.values());
      });
    }

    setImporting(false);
    setImportResults({
      success: successCount,
      failed: failCount,
      total: validRows.length,
      failedItems,
    });
  };

  const resetCsvModal = () => {
    setShowCsvModal(false);
    setCsvFile(null);
    setParsedRows([]);
    setImportResults(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
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
        <div className="flex items-center gap-2">
          <button
            className="btn-secondary btn-sm"
            onClick={exportCurrentStudents}
            title="Export students as CSV"
          >
            <Download size={14} /> Export CSV
          </button>
          <button
            className="btn-secondary btn-sm"
            onClick={() => setShowCsvModal(true)}
            title="Import students from CSV file"
          >
            <Upload size={14} /> Import CSV
          </button>
          <button className="btn-primary btn-sm" onClick={() => setShowAdd(true)}>
            <Plus size={14} /> Add Student
          </button>
        </div>
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
        <select className="form-select w-28" value={batchFilter} onChange={e => setBatchFilter(e.target.value)}>
          <option value="ALL">All Batches</option>
          {batchList.map(b => <option key={b} value={b}>{b}</option>)}
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
                                  <th className="!text-[10px] !py-2 w-20">Roll No</th>
                                  <th className="!text-[10px] !py-2">Name</th>
                                  <th className="!text-[10px] !py-2">Student ID / PNR No.</th>
                                  <th className="!text-[10px] !py-2">Batch</th>
                                  <th className="!text-[10px] !py-2 text-right">Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {yearStudents.map(s => (
                                  <tr key={s.student_id}>
                                    <td className="font-mono text-xs font-semibold text-slate-700">{s.roll_no || "—"}</td>
                                    <td>
                                      <Link to={`/students/${s.student_id}`} className="font-medium text-primary-600 hover:underline text-sm">
                                        {s.name}
                                      </Link>
                                    </td>
                                    <td className="font-mono text-xs text-slate-500">{s.student_id || s.pnr_no}</td>
                                    <td>
                                      {s.batch ? (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-primary-50 text-primary-700 border border-primary-200">
                                          {s.batch}
                                        </span>
                                      ) : (
                                        <span className="text-xs text-slate-300">—</span>
                                      )}
                                    </td>
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
              <div>
                <label className="form-label">
                  Name <span className="text-red-500 ml-1 font-bold">*</span>
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Full name"
                  required
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">
                    Roll No
                  </label>
                  <input
                    type="text"
                    className="form-input font-mono"
                    placeholder="e.g. 01, 45"
                    value={form.roll_no}
                    onChange={e => setForm(f => ({ ...f, roll_no: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="form-label">
                    Batch
                  </label>
                  <input
                    type="text"
                    className="form-input font-mono uppercase"
                    placeholder="e.g. A1, A2, B1"
                    value={form.batch}
                    onChange={e => setForm(f => ({ ...f, batch: e.target.value.toUpperCase() }))}
                  />
                </div>
              </div>

              <div>
                <label className="form-label">
                  Student ID / PNR No. <span className="text-red-500 ml-1 font-bold">*</span>
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. 2024WIT001 (used for ID & PC login)"
                  required
                  value={form.student_id}
                  onChange={e => {
                    const val = e.target.value;
                    setForm(f => ({ ...f, student_id: val, pnr_no: val }));
                  }}
                />
              </div>

              <div>
                <label className="form-label">
                  Password <span className="text-red-500 ml-1 font-bold">*</span>
                </label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="Password for PC login (compulsory)"
                  required
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                />
              </div>

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
                disabled={!form.name.trim() || !form.student_id.trim() || !form.password.trim() || submitting}
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Roll No</label>
                  <input
                    type="text"
                    className="form-input font-mono"
                    placeholder="e.g. 01, 45"
                    value={editForm.roll_no}
                    onChange={e => setEditForm(f => ({ ...f, roll_no: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="form-label">Batch</label>
                  <input
                    type="text"
                    className="form-input font-mono uppercase"
                    placeholder="e.g. A1, A2, B1"
                    value={editForm.batch}
                    onChange={e => setEditForm(f => ({ ...f, batch: e.target.value.toUpperCase() }))}
                  />
                </div>
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
                disabled={!editForm.name.trim() || editSubmitting}
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

      {/* CSV Import Modal */}
      {showCsvModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl p-6 relative max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h2 className="text-base font-semibold text-slate-800">Import Students from CSV</h2>
                <p className="text-xs text-slate-400 mt-0.5">Upload a structured CSV file to batch register student profiles for lab access.</p>
              </div>
              <button onClick={resetCsvModal} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
                <X size={18} />
              </button>
            </div>

            {/* Template Download Prompt */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-3 mb-4 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-slate-600">
                <FileSpreadsheet size={16} className="text-primary-600 shrink-0" />
                <span>Need the standard CSV format? Download our pre-formatted sample template.</span>
              </div>
              <button
                type="button"
                onClick={downloadSampleCsv}
                className="px-3 py-1 bg-white border border-slate-200 hover:border-slate-300 font-semibold text-primary-600 rounded-md shrink-0 flex items-center gap-1 shadow-2xs transition-all"
              >
                <Download size={12} /> Download Template
              </button>
            </div>

            {/* Fallback Defaults & File Selector */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">
              <div>
                <label className="form-label text-xs">Default Dept</label>
                <select
                  className="form-select text-xs"
                  value={defaultDept}
                  onChange={e => {
                    setDefaultDept(e.target.value);
                    handleDefaultSettingChange(e.target.value, defaultYear, defaultPassword);
                  }}
                  disabled={importing}
                >
                  {deptList.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                <span className="text-[10px] text-slate-400">If missing in row</span>
              </div>

              <div>
                <label className="form-label text-xs">Default Year</label>
                <select
                  className="form-select text-xs"
                  value={defaultYear}
                  onChange={e => {
                    setDefaultYear(e.target.value);
                    handleDefaultSettingChange(defaultDept, e.target.value, defaultPassword);
                  }}
                  disabled={importing}
                >
                  {YEARS.map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
                <span className="text-[10px] text-slate-400">If missing in row</span>
              </div>

              <div>
                <label className="form-label text-xs">Default Password</label>
                <input
                  type="text"
                  className="form-input text-xs"
                  value={defaultPassword}
                  onChange={e => {
                    setDefaultPassword(e.target.value);
                    handleDefaultSettingChange(defaultDept, defaultYear, e.target.value);
                  }}
                  placeholder="Welcome@123"
                  disabled={importing}
                />
                <span className="text-[10px] text-slate-400">For PC login if blank</span>
              </div>

              <div>
                <label className="form-label text-xs">Select CSV File</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileChange}
                  disabled={importing}
                  className="form-input text-xs file:mr-2 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
                />
                <span className="text-[10px] text-slate-400">.csv format</span>
              </div>
            </div>

            {/* Import Status Alert */}
            {importResults && (
              <div className={`p-3 rounded-lg border text-xs mb-4 flex items-center gap-2 ${
                importResults.failed === 0
                  ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                  : "bg-amber-50 text-amber-800 border-amber-200"
              }`}>
                {importResults.failed === 0 ? (
                  <CheckCircle2 size={16} className="shrink-0 text-emerald-600" />
                ) : (
                  <AlertCircle size={16} className="shrink-0 text-amber-600" />
                )}
                <span>
                  Successfully imported <strong>{importResults.success}</strong> of {importResults.total} students.
                  {importResults.failed > 0 && ` (${importResults.failed} failed)`}
                </span>
              </div>
            )}

            {/* Preview Table */}
            {parsedRows.length > 0 && (
              <div className="flex-1 overflow-y-auto border border-slate-200 rounded-lg mb-4 min-h-[160px]">
                <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 flex justify-between items-center text-xs font-medium text-slate-600 sticky top-0 z-10">
                  <span>Preview ({parsedRows.length} rows found)</span>
                  <div className="flex gap-2 text-[11px]">
                    <span className="text-emerald-600 font-semibold">
                      {parsedRows.filter(r => r.isValid).length} Valid
                    </span>
                    {parsedRows.filter(r => !r.isValid).length > 0 && (
                      <span className="text-red-500 font-semibold">
                        {parsedRows.filter(r => !r.isValid).length} Issues
                      </span>
                    )}
                  </div>
                </div>
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50/50 text-slate-500 border-b border-slate-100 font-semibold">
                    <tr>
                      <th className="p-2 w-16">Roll No</th>
                      <th className="p-2">Name</th>
                      <th className="p-2">Student ID / PNR</th>
                      <th className="p-2">Batch</th>
                      <th className="p-2">Dept</th>
                      <th className="p-2">Year</th>
                      <th className="p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedRows.map((r) => (
                      <tr key={r.id} className={r.isValid ? "hover:bg-slate-50/50" : "bg-red-50/40"}>
                        <td className="p-2 font-mono font-bold text-slate-700">{r.roll_no || "—"}</td>
                        <td className="p-2 font-medium text-slate-800">{r.name || "—"}</td>
                        <td className="p-2 font-mono text-slate-600">{r.student_id || "—"}</td>
                        <td className="p-2">
                          {r.batch ? (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary-50 text-primary-700 border border-primary-200">
                              {r.batch}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="p-2 font-semibold text-slate-600">{r.department}</td>
                        <td className="p-2">
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${YEAR_COLORS[r.year] || "bg-slate-100"}`}>
                            {r.year}
                          </span>
                        </td>
                        <td className="p-2">
                          {r.isValid ? (
                            <span className="text-[10px] bg-emerald-50 text-emerald-700 font-semibold px-1.5 py-0.5 rounded border border-emerald-200">
                              Ready
                            </span>
                          ) : (
                            <span
                              className="text-[10px] bg-red-50 text-red-700 font-semibold px-1.5 py-0.5 rounded border border-red-200 cursor-help"
                              title={r.errors.join("; ")}
                            >
                              {r.errors[0]}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Progress Bar */}
            {importing && (
              <div className="mb-4">
                <div className="flex justify-between text-xs text-slate-600 mb-1">
                  <span>Importing students…</span>
                  <span>{importProgress.current} / {importProgress.total}</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-primary-600 h-full transition-all duration-200"
                    style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-between items-center pt-3 border-t border-slate-100 mt-auto">
              <button
                type="button"
                className="btn-secondary text-xs"
                onClick={resetCsvModal}
                disabled={importing}
              >
                {importResults ? "Close" : "Cancel"}
              </button>

              <button
                type="button"
                className="btn-primary text-xs inline-flex items-center gap-1.5"
                onClick={handleExecuteImport}
                disabled={parsedRows.filter(r => r.isValid).length === 0 || importing}
              >
                {importing ? (
                  <>
                    <RefreshCw size={13} className="animate-spin" /> Importing…
                  </>
                ) : (
                  <>
                    <Upload size={13} /> Import {parsedRows.filter(r => r.isValid).length} Students
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageWrapper>
  );
}
