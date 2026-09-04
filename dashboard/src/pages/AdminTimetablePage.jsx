import { useState, useMemo, useEffect } from "react";
import { Plus, Trash2 } from "lucide-react";
import { PageWrapper } from "../components/Shared";
import { fetchLabs, fetchTimetable, addTimetableSlot, deleteTimetableSlot } from "../api/apiClient";

const DAYS = ["MON","TUE","WED","THU","FRI"];

export default function AdminTimetablePage() {
  const [labs,        setLabs]        = useState([]);
  const [slots,       setSlots]       = useState([]);
  const [labFilter,   setLabFilter]   = useState("");
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [showAdd,     setShowAdd]     = useState(false);
  const [submitting,  setSubmitting]  = useState(false);
  const [form, setForm] = useState({
    lab_id: "", day_of_week: "MON", start_time: "09:00", end_time: "10:00",
    course_code: "", faculty_name: "", student_group: "", expected_count: "25"
  });

  // Load labs on mount
  useEffect(() => {
    fetchLabs()
      .then(labsList => {
        setLabs(labsList);
        if (labsList.length > 0) {
          setLabFilter(labsList[0].lab_id);
          setForm(f => ({ ...f, lab_id: labsList[0].lab_id }));
        }
      })
      .catch(err => setError(err.message));
  }, []);

  // Load timetable when labFilter changes
  useEffect(() => {
    if (!labFilter) return;
    setLoading(true);
    setError(null);
    fetchTimetable(labFilter)
      .then(data => { setSlots(data); setLoading(false); })
      .catch(err  => { setError(err.message); setLoading(false); });
  }, [labFilter]);

  const filtered = useMemo(() =>
    slots.filter(s => s.lab_id === labFilter).sort((a, b) =>
      DAYS.indexOf(a.day_of_week) - DAYS.indexOf(b.day_of_week) || a.start_time.localeCompare(b.start_time)
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
    } catch (err) {
      alert("Failed to add slot: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async slotId => {
    try {
      await deleteTimetableSlot(slotId);
      setSlots(prev => prev.filter(s => s.slot_id !== slotId));
    } catch (err) {
      alert("Failed to delete slot: " + err.message);
    }
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

  if (error) {
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
      <div className="page-header">
        <div>
          <h1 className="page-title">Timetable</h1>
          <p className="page-subtitle">Manage lab timetable slots for compliance tracking</p>
        </div>
        <button className="btn-primary btn-sm" onClick={() => setShowAdd(true)}>
          <Plus size={14} /> Add Slot
        </button>
      </div>

      {/* Lab selector */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {labs.map(l => (
          <button key={l.lab_id}
            onClick={() => setLabFilter(l.lab_id)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-all ${
              labFilter === l.lab_id
                ? "bg-primary-600 text-white border-primary-600"
                : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
            }`}
          >
            {l.name}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-slate-200 border-t-primary-600 rounded-full animate-spin"></div>
        </div>
      ) : (
        /* Calendar grid */
        <div className="grid grid-cols-5 gap-3">
          {DAYS.map(day => (
            <div key={day} className="card">
              <div className="px-3 py-2.5 border-b border-slate-100/60 text-xs font-medium text-slate-500">{day}</div>
              <div className="p-2 space-y-2 min-h-[200px]">
                {byDay[day].length === 0
                  ? <p className="text-xs text-slate-300 text-center pt-8">No slots</p>
                  : byDay[day].map(slot => (
                    <div key={slot.slot_id}
                      className="bg-primary-50/50 rounded-lg p-2 text-xs group relative">
                      <p className="font-medium text-primary-700">{slot.start_time}–{slot.end_time}</p>
                      <p className="text-primary-600 font-medium mt-0.5 truncate">{slot.course_code}</p>
                      <p className="text-slate-500 truncate">{slot.faculty_name}</p>
                      <p className="text-slate-400">{slot.student_group} · {slot.expected_count} students</p>
                      <button
                        onClick={() => handleDelete(slot.slot_id)}
                        className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-danger hover:bg-red-50 rounded transition-all">
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ))
                }
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-lg p-6">
            <h2 className="text-base font-semibold text-slate-800 mb-4">Add Timetable Slot</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label">Lab</label>
                <select className="form-select" value={form.lab_id} onChange={e => setForm(f=>({...f,lab_id:e.target.value}))}>
                  {labs.map(l => <option key={l.lab_id} value={l.lab_id}>{l.name}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Day</label>
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
                <label className="form-label">Course Code</label>
                <input className="form-input" placeholder="e.g. CS301-DS Lab" value={form.course_code} onChange={e => setForm(f=>({...f,course_code:e.target.value}))} />
              </div>
              <div>
                <label className="form-label">Faculty</label>
                <input className="form-input" placeholder="Dr. Name" value={form.faculty_name} onChange={e => setForm(f=>({...f,faculty_name:e.target.value}))} />
              </div>
              <div>
                <label className="form-label">Student Group</label>
                <input className="form-input" placeholder="CSE-SEM5" value={form.student_group} onChange={e => setForm(f=>({...f,student_group:e.target.value}))} />
              </div>
              <div>
                <label className="form-label">Expected Count</label>
                <input type="number" className="form-input" value={form.expected_count} onChange={e => setForm(f=>({...f,expected_count:e.target.value}))} />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button className="btn-secondary" onClick={() => setShowAdd(false)} disabled={submitting}>Cancel</button>
              <button className="btn-primary" onClick={handleAdd} disabled={!form.course_code || !form.faculty_name || submitting}>
                {submitting ? "Adding…" : "Add Slot"}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageWrapper>
  );
}
