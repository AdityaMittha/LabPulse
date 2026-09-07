import { useState, useMemo, useEffect, useRef } from "react";
import {
  Plus, Trash2, Upload, Download, FileSpreadsheet,
  CheckCircle2, AlertCircle, AlertTriangle, RefreshCw, X, ArrowRight
} from "lucide-react";
import { Link } from "react-router-dom";
import { PageWrapper } from "../components/Shared";
import { fetchLabs, fetchTimetable, addTimetableSlot, deleteTimetableSlot } from "../api/apiClient";

const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT"];

export default function AdminTimetablePage() {
  const [labs,        setLabs]        = useState([]);
  const [slots,       setSlots]       = useState([]);
  const [labFilter,   setLabFilter]   = useState("");
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [showAdd,     setShowAdd]     = useState(false);
  const [submitting,  setSubmitting]  = useState(false);

  // CSV Import State
  const [showCsvModal,   setShowCsvModal]   = useState(false);
  const [csvFile,        setCsvFile]        = useState(null);
  const [parsedRows,     setParsedRows]     = useState([]);
  const [importing,      setImporting]      = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [importResults,  setImportResults]  = useState(null);
  const [targetLabId,    setTargetLabId]    = useState("");
  const fileInputRef = useRef(null);

  const [form, setForm] = useState({
    lab_id: "", day_of_week: "MON", start_time: "09:00", end_time: "10:00",
    course_code: "", faculty_name: "", student_group: "", expected_count: "25"
  });

  // Load labs on mount
  const loadLabs = () => {
    fetchLabs()
      .then(labsList => {
        setLabs(labsList);
        if (labsList.length > 0) {
          const initialLab = labFilter || labsList[0].lab_id;
          setLabFilter(initialLab);
          setTargetLabId(initialLab);
          setForm(f => ({ ...f, lab_id: initialLab }));
        }
      })
      .catch(err => setError(err.message));
  };

  useEffect(() => {
    loadLabs();
  }, []);

  // Load timetable when labFilter changes
  const loadTimetable = (labId) => {
    if (!labId) return;
    setLoading(true);
    setError(null);
    fetchTimetable(labId)
      .then(data => { setSlots(data); setLoading(false); })
      .catch(err  => { setError(err.message); setLoading(false); });
  };

  useEffect(() => {
    if (labFilter) {
      loadTimetable(labFilter);
    }
  }, [labFilter]);

  const filtered = useMemo(() =>
    slots.filter(s => s.lab_id === labFilter).sort((a, b) =>
      DAYS.indexOf(a.day_of_week) - DAYS.indexOf(b.day_of_week) || (a.start_time || "").localeCompare(b.start_time || "")
    ),
    [slots, labFilter]
  );

  const byDay = useMemo(() => {
    const map = {};
    DAYS.forEach(d => { map[d] = filtered.filter(s => s.day_of_week === d); });
    return map;
  }, [filtered]);

  const handleAdd = async () => {
    if (!form.course_code || !form.faculty_name) return;
    setSubmitting(true);
    try {
      const slotPayload = {
        ...form,
        lab_id:         labFilter,
        expected_count: parseInt(form.expected_count) || 25,
      };
      const result = await addTimetableSlot(slotPayload);
      const newSlot = {
        ...slotPayload,
        slot_id: result.slot_id || `${labFilter}#${form.day_of_week}#${form.start_time}`,
      };
      setSlots(prev => [...prev.filter(s => s.slot_id !== newSlot.slot_id), newSlot]);
      setShowAdd(false);
      setForm(f => ({
        ...f,
        course_code: "",
        faculty_name: "",
        student_group: "",
        expected_count: "25"
      }));
    } catch (err) {
      alert("Failed to add slot: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async slotId => {
    if (!window.confirm("Are you sure you want to delete this timetable slot?")) return;
    try {
      await deleteTimetableSlot(slotId);
      setSlots(prev => prev.filter(s => s.slot_id !== slotId));
    } catch (err) {
      alert("Failed to delete slot: " + err.message);
    }
  };

  // ── CSV Import Logic ─────────────────────────────────────────────────────────

  const downloadSampleCsv = () => {
    const defaultLab = labFilter || (labs[0]?.lab_id) || "CS-LAB-1";
    const csvContent = [
      "lab_id,day_of_week,start_time,end_time,course_code,faculty_name,student_group,expected_count",
      `${defaultLab},MON,09:00,11:00,CS301-Data Structures Lab,Dr. S. K. Sharma,CSE-B1,25`,
      `${defaultLab},MON,11:15,13:15,CS302-Operating Systems Lab,Prof. P. R. Kulkarni,CSE-B2,28`,
      `${defaultLab},TUE,10:00,12:00,CS303-Database Systems Lab,Dr. A. B. Joshi,CSE-B1,25`,
      `${defaultLab},WED,14:00,16:00,CS304-Computer Networks Lab,Prof. M. V. Patil,CSE-B3,24`,
      `${defaultLab},THU,09:00,11:00,CS305-Web Technologies Lab,Dr. N. T. Kadam,CSE-B2,26`,
      `${defaultLab},FRI,11:15,13:15,CS306-Cloud Computing Lab,Prof. R. S. Mane,CSE-B1,30`
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `timetable_template_${defaultLab}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportCurrentTimetable = () => {
    if (filtered.length === 0) {
      alert("No timetable slots to export for this lab.");
      return;
    }
    const headers = "lab_id,day_of_week,start_time,end_time,course_code,faculty_name,student_group,expected_count";
    const rows = filtered.map(s =>
      `"${s.lab_id}","${s.day_of_week}","${s.start_time}","${s.end_time}","${(s.course_code || "").replace(/"/g, '""')}","${(s.faculty_name || "").replace(/"/g, '""')}","${(s.student_group || "").replace(/"/g, '""')}",${s.expected_count || 25}`
    );
    const csvContent = [headers, ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `timetable_${labFilter}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const parseCsvText = (text) => {
    const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length < 2) {
      alert("CSV file is empty or missing headers.");
      return [];
    }

    const rawHeaders = lines[0].split(",").map(h => h.trim().replace(/^["']|["']$/g, "").toLowerCase());
    
    // Header alias mapping
    const colMap = {};
    rawHeaders.forEach((header, index) => {
      if (header.includes("lab")) colMap.lab_id = index;
      else if (header.includes("day")) colMap.day_of_week = index;
      else if (header.includes("start")) colMap.start_time = index;
      else if (header.includes("end")) colMap.end_time = index;
      else if (header.includes("course") || header.includes("subject")) colMap.course_code = index;
      else if (header.includes("faculty") || header.includes("teacher") || header.includes("prof")) colMap.faculty_name = index;
      else if (header.includes("group") || header.includes("batch") || header.includes("class")) colMap.student_group = index;
      else if (header.includes("count") || header.includes("capacity") || header.includes("students")) colMap.expected_count = index;
    });

    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Handle simple CSV splitting respecting quotes
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

      const rawDay = (getVal("day_of_week") || "MON").toUpperCase().slice(0, 3);
      const startTime = getVal("start_time");
      const endTime = getVal("end_time");
      const course = getVal("course_code");
      const faculty = getVal("faculty_name");
      const group = getVal("student_group") || "ALL";
      const count = parseInt(getVal("expected_count")) || 25;
      const rowLab = getVal("lab_id") || targetLabId || labFilter;

      // Row Validation
      const errors = [];
      if (!DAYS.includes(rawDay)) errors.push(`Invalid day: "${rawDay}". Expected one of ${DAYS.join(", ")}.`);
      if (!startTime || !startTime.includes(":")) errors.push("Invalid start time (format: HH:MM).");
      if (!endTime || !endTime.includes(":")) errors.push("Invalid end time (format: HH:MM).");
      if (!course) errors.push("Course code / subject is required.");
      if (!faculty) errors.push("Faculty name is required.");

      rows.push({
        id: i,
        lab_id: rowLab,
        day_of_week: rawDay,
        start_time: startTime,
        end_time: endTime,
        course_code: course,
        faculty_name: faculty,
        student_group: group,
        expected_count: count,
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
      const rows = parseCsvText(text);
      setParsedRows(rows);
    };
    reader.readAsText(file);
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

    for (let i = 0; i < validRows.length; i++) {
      const r = validRows[i];
      try {
        const slotPayload = {
          lab_id:         targetLabId || r.lab_id,
          day_of_week:   r.day_of_week,
          start_time:    r.start_time,
          end_time:      r.end_time,
          course_code:   r.course_code,
          faculty_name:  r.faculty_name,
          student_group: r.student_group,
          expected_count: r.expected_count,
        };
        await addTimetableSlot(slotPayload);
        successCount++;
      } catch (err) {
        console.error("Failed to import slot:", r, err);
        failCount++;
      }
      setImportProgress({ current: i + 1, total: validRows.length });
    }

    setImporting(false);
    setImportResults({
      success: successCount,
      failed: failCount,
      total: validRows.length,
    });

    // Refresh timetable slots for current lab
    if (labFilter) {
      loadTimetable(labFilter);
    }
  };

  const resetCsvModal = () => {
    setShowCsvModal(false);
    setCsvFile(null);
    setParsedRows([]);
    setImportResults(null);
    setImportProgress({ current: 0, total: 0 });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  if (loading && labs.length === 0) {
    return (
      <PageWrapper>
        <div className="flex items-center justify-center h-[calc(100vh-120px)]">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-slate-200 border-t-primary-600 rounded-full animate-spin"></div>
            <span className="text-sm text-slate-400">Loading timetable…</span>
          </div>
        </div>
      </PageWrapper>
    );
  }

  if (error && labs.length === 0) {
    return (
      <PageWrapper>
        <div className="flex items-center justify-center h-[calc(100vh-120px)]">
          <div className="text-center">
            <p className="text-red-500 font-medium text-sm">Failed to load timetable</p>
            <p className="text-slate-400 text-xs mt-1">{error}</p>
          </div>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      {/* Header */}
      <div className="page-header flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="page-title">Timetable</h1>
          <p className="page-subtitle">Manage lab schedule and weekly timetable slots for compliance tracking</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            className="btn-secondary btn-sm inline-flex items-center gap-1.5"
            onClick={exportCurrentTimetable}
            title="Export this lab's schedule as CSV"
          >
            <Download size={14} /> Export CSV
          </button>
          <button
            className="btn-secondary btn-sm inline-flex items-center gap-1.5"
            onClick={() => {
              setTargetLabId(labFilter || labs[0]?.lab_id || "");
              setShowCsvModal(true);
            }}
            title="Import timetable slots from CSV file"
          >
            <Upload size={14} /> Import CSV
          </button>
          <button
            className="btn-primary btn-sm inline-flex items-center gap-1.5"
            onClick={() => setShowAdd(true)}
          >
            <Plus size={14} /> Add Slot
          </button>
        </div>
      </div>

      {/* Lab selector */}
      <div className="flex gap-2 mb-5 flex-wrap items-center">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mr-1">Select Lab:</span>
        {labs.length === 0 ? (
          <div className="text-xs text-amber-700 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
            No computer labs exist yet. Please{" "}
            <Link to="/admin/labs" className="underline font-semibold text-primary-600 hover:text-primary-700">
              create a lab
            </Link>{" "}
            first.
          </div>
        ) : (
          labs.map(l => (
            <button key={l.lab_id}
              onClick={() => setLabFilter(l.lab_id)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                labFilter === l.lab_id
                  ? "bg-primary-600 text-white border-primary-600 shadow-xs"
                  : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              {l.name} <span className="opacity-70 font-mono text-[11px]">({l.lab_id})</span>
            </button>
          ))
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-slate-200 border-t-primary-600 rounded-full animate-spin"></div>
        </div>
      ) : (
        /* Calendar grid */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {DAYS.map(day => (
            <div key={day} className="card flex flex-col">
              <div className="px-3 py-2.5 border-b border-slate-100/80 text-xs font-bold text-slate-700 bg-slate-50/50 flex justify-between items-center">
                <span>{day}</span>
                <span className="text-[10px] text-slate-400 font-normal">
                  {byDay[day].length} {byDay[day].length === 1 ? "slot" : "slots"}
                </span>
              </div>
              <div className="p-2 space-y-2 min-h-[220px] flex-1 bg-white">
                {byDay[day].length === 0 ? (
                  <p className="text-xs text-slate-300 text-center pt-12">No classes</p>
                ) : (
                  byDay[day].map(slot => (
                    <div key={slot.slot_id}
                      className="bg-primary-50/60 hover:bg-primary-50 rounded-lg p-2.5 text-xs group relative border border-primary-100/60 transition-all">
                      <div className="flex justify-between items-start">
                        <span className="font-semibold text-primary-700">{slot.start_time}–{slot.end_time}</span>
                      </div>
                      <p className="text-slate-800 font-medium mt-1 truncate" title={slot.course_code}>
                        {slot.course_code}
                      </p>
                      <p className="text-slate-600 text-[11px] truncate mt-0.5" title={slot.faculty_name}>
                        {slot.faculty_name}
                      </p>
                      <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-primary-100/50 text-[10px] text-slate-400">
                        <span>{slot.student_group}</span>
                        <span>{slot.expected_count} seats</span>
                      </div>
                      <button
                        onClick={() => handleDelete(slot.slot_id)}
                        className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-all"
                        title="Delete slot"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Manual Add Slot Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 relative">
            <h2 className="text-base font-semibold text-slate-800 mb-4">Add Timetable Slot</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label">Lab</label>
                {labs.length === 0 ? (
                  <div className="text-xs text-amber-700 bg-amber-50 p-2.5 rounded-lg border border-amber-200 col-span-2">
                    No computer labs exist yet. Please create a lab first.
                  </div>
                ) : (
                  <select className="form-select" value={form.lab_id} onChange={e => setForm(f=>({...f,lab_id:e.target.value}))}>
                    {labs.map(l => <option key={l.lab_id} value={l.lab_id}>{l.name} ({l.lab_id})</option>)}
                  </select>
                )}
              </div>
              <div>
                <label className="form-label">Day of Week</label>
                <select className="form-select" value={form.day_of_week} onChange={e => setForm(f=>({...f,day_of_week:e.target.value}))}>
                  {DAYS.map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Start Time</label>
                <input type="time" className="form-input" value={form.start_time} onChange={e => setForm(f=>({...f,start_time:e.target.value}))} />
              </div>
              <div>
                <label className="form-label">End Time</label>
                <input type="time" className="form-input" value={form.end_time} onChange={e => setForm(f=>({...f,end_time:e.target.value}))} />
              </div>
              <div>
                <label className="form-label">Course Code / Subject</label>
                <input className="form-input" placeholder="e.g. CS301-DS Lab" value={form.course_code} onChange={e => setForm(f=>({...f,course_code:e.target.value}))} />
              </div>
              <div>
                <label className="form-label">Faculty Name</label>
                <input className="form-input" placeholder="e.g. Dr. S. K. Sharma" value={form.faculty_name} onChange={e => setForm(f=>({...f,faculty_name:e.target.value}))} />
              </div>
              <div>
                <label className="form-label">Student Group / Batch</label>
                <input className="form-input" placeholder="e.g. CSE-B1" value={form.student_group} onChange={e => setForm(f=>({...f,student_group:e.target.value}))} />
              </div>
              <div>
                <label className="form-label">Expected Students Count</label>
                <input type="number" className="form-input" value={form.expected_count} onChange={e => setForm(f=>({...f,expected_count:e.target.value}))} />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-5 pt-3 border-t border-slate-100">
              <button className="btn-secondary" onClick={() => setShowAdd(false)} disabled={submitting}>Cancel</button>
              <button className="btn-primary" onClick={handleAdd} disabled={!form.lab_id || !form.course_code || !form.faculty_name || submitting}>
                {submitting ? "Adding…" : "Add Slot"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSV Import Modal */}
      {showCsvModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 relative max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h2 className="text-base font-semibold text-slate-800">Import Timetable from CSV</h2>
                <p className="text-xs text-slate-400 mt-0.5">Upload a structured CSV file to populate weekly lab schedule slots.</p>
              </div>
              <button onClick={resetCsvModal} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
                <X size={18} />
              </button>
            </div>

            {/* Template Download Prompt */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-3 mb-4 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-slate-600">
                <FileSpreadsheet size={16} className="text-primary-600 shrink-0" />
                <span>Need the format? Download the sample CSV template with instructions.</span>
              </div>
              <button
                type="button"
                onClick={downloadSampleCsv}
                className="px-3 py-1 bg-white border border-slate-200 hover:border-slate-300 font-semibold text-primary-600 rounded-md shrink-0 flex items-center gap-1 shadow-2xs transition-all"
              >
                <Download size={12} /> Download Template
              </button>
            </div>

            {/* Target Lab & File Selector */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <div>
                <label className="form-label text-xs">Target Computer Lab</label>
                <select
                  className="form-select text-xs"
                  value={targetLabId}
                  onChange={e => setTargetLabId(e.target.value)}
                  disabled={importing}
                >
                  {labs.map(l => (
                    <option key={l.lab_id} value={l.lab_id}>
                      {l.name} ({l.lab_id})
                    </option>
                  ))}
                </select>
                <span className="text-[11px] text-slate-400">Used if row does not specify a lab_id</span>
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
              </div>
            </div>

            {/* Import Status Alert */}
            {importResults && (
              <div className={`p-3 rounded-lg border text-xs mb-4 flex items-center gap-2 ${
                importResults.failed === 0
                  ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                  : "bg-amber-50 text-amber-800 border-amber-200"
              }`}>
                <CheckCircle2 size={16} className="shrink-0 text-emerald-600" />
                <span>
                  Successfully imported <strong>{importResults.success}</strong> of {importResults.total} slots.
                  {importResults.failed > 0 && ` (${importResults.failed} failed)`}
                </span>
              </div>
            )}

            {/* Preview Table */}
            {parsedRows.length > 0 && (
              <div className="flex-1 overflow-y-auto border border-slate-200 rounded-lg mb-4">
                <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 flex justify-between items-center text-xs font-medium text-slate-600">
                  <span>Preview ({parsedRows.length} slots found)</span>
                  <div className="flex gap-2 text-[11px]">
                    <span className="text-emerald-600 font-semibold">
                      {parsedRows.filter(r => r.isValid).length} Valid
                    </span>
                    {parsedRows.filter(r => !r.isValid).length > 0 && (
                      <span className="text-red-500 font-semibold">
                        {parsedRows.filter(r => !r.isValid).length} Errors
                      </span>
                    )}
                  </div>
                </div>
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50/50 text-slate-500 border-b border-slate-100 font-semibold">
                    <tr>
                      <th className="p-2">Day</th>
                      <th className="p-2">Time</th>
                      <th className="p-2">Lab</th>
                      <th className="p-2">Course</th>
                      <th className="p-2">Faculty</th>
                      <th className="p-2">Group</th>
                      <th className="p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedRows.map((r) => (
                      <tr key={r.id} className={r.isValid ? "hover:bg-slate-50/50" : "bg-red-50/40"}>
                        <td className="p-2 font-mono font-bold text-slate-700">{r.day_of_week}</td>
                        <td className="p-2 font-mono text-slate-600">{r.start_time}–{r.end_time}</td>
                        <td className="p-2 text-slate-600 font-mono text-[11px]">{targetLabId || r.lab_id}</td>
                        <td className="p-2 font-medium text-slate-800 truncate max-w-[120px]">{r.course_code}</td>
                        <td className="p-2 text-slate-600 truncate max-w-[100px]">{r.faculty_name}</td>
                        <td className="p-2 text-slate-500">{r.student_group}</td>
                        <td className="p-2">
                          {r.isValid ? (
                            <span className="text-[10px] bg-emerald-50 text-emerald-700 font-semibold px-1.5 py-0.5 rounded border border-emerald-200">
                              Ready
                            </span>
                          ) : (
                            <span className="text-[10px] bg-red-50 text-red-700 font-semibold px-1.5 py-0.5 rounded border border-red-200" title={r.errors.join(", ")}>
                              Error
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
                  <span>Importing slots…</span>
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
                    <Upload size={13} /> Import {parsedRows.filter(r => r.isValid).length} Slots
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
