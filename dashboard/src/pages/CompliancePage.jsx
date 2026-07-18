import { useMemo, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ClipboardCheck, Search } from "lucide-react";
import { labs, timetable, sessions, students, todayStr } from "../data/mockData";
import { ComplianceBadge, SectionHeading, PageWrapper, StatCard } from "../components/Shared";

export default function CompliancePage({ globalDate }) {
  const today = globalDate || todayStr();
  const [selectedLab,  setSelectedLab]  = useState(labs[0].lab_id);
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [search,       setSearch]       = useState("");

  useEffect(() => {
    if (globalDate) {
      setSelectedDate(globalDate);
    }
  }, [globalDate]);

  const labSlots = useMemo(
    () => timetable.filter(t => t.lab_id === selectedLab),
    [selectedLab]
  );

  const daySessions = useMemo(
    () => sessions.filter(s => s.lab_id === selectedLab && s.date === selectedDate),
    [selectedLab, selectedDate]
  );

  // Build compliance rows
  const rows = useMemo(() => {
    const slot = selectedSlot ? timetable.find(t => t.slot_id === selectedSlot) : null;
    const matchSessions = slot
      ? daySessions.filter(s => s.timetable_slot === slot.slot_id)
      : daySessions;

    // Get unique students in these sessions
    const seen = new Set();
    const result = matchSessions.map(s => {
      seen.add(s.student_id);
      return {
        student_id: s.student_id,
        student_name: s.student_name,
        machine_id: s.machine_id,
        login_time: s.login_time,
        total_duration: s.total_duration,
        compliance_status: s.compliance_status,
        course_code: s.course_code,
        timetable_slot: s.timetable_slot,
      };
    });

    // Filter by search
    const filtered = result.filter(r =>
      r.student_name?.toLowerCase().includes(search.toLowerCase()) ||
      r.student_id?.toLowerCase().includes(search.toLowerCase())
    );

    return filtered;
  }, [daySessions, selectedSlot, search]);

  const compCounts = useMemo(() => ({
    compliant:     rows.filter(r => r.compliance_status === "compliant").length,
    partial:       rows.filter(r => r.compliance_status === "partial").length,
    non_compliant: rows.filter(r => r.compliance_status === "non_compliant").length,
  }), [rows]);

  const compliancePct = rows.length > 0
    ? Math.round((compCounts.compliant / rows.length) * 100) : 0;

  return (
    <PageWrapper>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Compliance Report</h1>
          <p className="page-subtitle">Timetable slot vs actual student lab attendance</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card card-body mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="form-label">Lab</label>
            <select className="form-select" value={selectedLab} onChange={e => { setSelectedLab(e.target.value); setSelectedSlot(""); }}>
              {labs.map(l => <option key={l.lab_id} value={l.lab_id}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Date</label>
            <input type="date" className="form-input" value={selectedDate} max={today}
              onChange={e => setSelectedDate(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Timetable Slot</label>
            <select className="form-select" value={selectedSlot} onChange={e => setSelectedSlot(e.target.value)}>
              <option value="">All slots</option>
              {labSlots.map(t => (
                <option key={t.slot_id} value={t.slot_id}>
                  {t.day_of_week} {t.start_time}–{t.end_time} · {t.course_code}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">Search Student</label>
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className="form-input pl-8" placeholder="Name or ID…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Records"  value={rows.length}                    icon={ClipboardCheck} color="blue"   />
        <StatCard label="Compliant"      value={compCounts.compliant}           icon={ClipboardCheck} color="green"  />
        <StatCard label="Partial"        value={compCounts.partial}             icon={ClipboardCheck} color="amber"  />
        <StatCard label="Compliance %"   value={`${compliancePct}%`}            icon={ClipboardCheck} color="purple" />
      </div>

      {/* Table */}
      <div className="card">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-semibold text-sm text-slate-900">Attendance Details</h3>
          <span className="text-xs text-slate-400">{rows.length} records</span>
        </div>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Student</th>
                <th>ID</th>
                <th>Machine</th>
                <th>Login Time</th>
                <th>Duration</th>
                <th>Course</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0
                ? <tr><td colSpan={7} className="text-center text-slate-400 py-10">No sessions found for this selection.</td></tr>
                : rows.map((r, i) => (
                  <tr key={i}>
                    <td>
                      <Link to={`/students/${r.student_id}`} className="font-medium text-primary-600 hover:underline">
                        {r.student_name}
                      </Link>
                    </td>
                    <td className="font-mono text-xs text-slate-500">{r.student_id}</td>
                    <td>
                      <Link to={`/machines/${r.machine_id}`} className="font-mono text-xs text-slate-700 hover:underline">{r.machine_id}</Link>
                    </td>
                    <td className="text-xs text-slate-600">{new Date(r.login_time).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}</td>
                    <td className="num">{Math.round((r.total_duration||0)/60)}m</td>
                    <td className="text-xs text-slate-500 max-w-[120px] truncate">{r.course_code}</td>
                    <td><ComplianceBadge status={r.compliance_status} /></td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </div>
    </PageWrapper>
  );
}
