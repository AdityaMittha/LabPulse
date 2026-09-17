import { useMemo, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ClipboardCheck, Search, Users, UserCheck, UserX, CheckCircle2, AlertTriangle } from "lucide-react";
import { todayStr, formatTimeIST, formatIstDate, normalizeYear } from "../data/collegeConfig";
import { ComplianceBadge, PageWrapper, StatCard } from "../components/Shared";
import { fetchTimetable, fetchUsage, fetchStudents, fetchLabs } from "../api/apiClient";
import { useAuth } from "../auth/AuthContext";

export default function CompliancePage({ globalDate }) {
  const { user, isAdmin } = useAuth();
  const today = globalDate || todayStr();

  const [labsData,     setLabsData]     = useState([]);
  const [selectedLab,  setSelectedLab]  = useState("");
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [search,       setSearch]       = useState("");

  const [timetableData, setTimetableData] = useState([]);
  const [sessionsData,  setSessionsData]  = useState([]);
  const [studentsData,  setStudentsData]  = useState([]);
  const [loading,       setLoading]       = useState(false);
  const [labsLoading,   setLabsLoading]   = useState(true);
  const [error,         setError]         = useState(null);

  useEffect(() => {
    if (globalDate) setSelectedDate(globalDate);
  }, [globalDate]);

  // Load labs on mount
  useEffect(() => {
    setLabsLoading(true);
    fetchLabs().then(labsList => {
      const visible = isAdmin
        ? labsList
        : labsList.filter(l => l.department?.includes(user.department) || user.department?.includes(l.department));
      setLabsData(visible);
      if (visible.length > 0) setSelectedLab(visible[0].lab_id);
      setLabsLoading(false);
    }).catch(err => {
      setError(err.message);
      setLabsLoading(false);
    });
  }, [isAdmin, user]);

  // Load compliance data whenever lab or date changes
  useEffect(() => {
    if (!selectedLab) return;
    let active = true;
    setLoading(true);
    setError(null);

    Promise.all([
      fetchTimetable(selectedLab),
      fetchUsage({ lab_id: selectedLab, date: selectedDate }),
      fetchStudents()
    ]).then(([tt, sess, studs]) => {
      if (active) {
        setTimetableData(tt   || []);
        setSessionsData(sess  || []);
        setStudentsData(studs || []);
        setLoading(false);
      }
    }).catch(err => {
      console.error(err);
      if (active) { setError(err.message); setLoading(false); }
    });

    return () => { active = false; };
  }, [selectedLab, selectedDate]);

  const labSlots = timetableData;
  const daySessions = sessionsData;
  const currentLab = useMemo(() => labsData.find(l => l.lab_id === selectedLab), [labsData, selectedLab]);

  // Selected timetable slot object
  const activeSlot = useMemo(() => {
    return selectedSlot ? timetableData.find(t => t.slot_id === selectedSlot) : null;
  }, [selectedSlot, timetableData]);

  // Build roster & compliance rows
  const { rows, summary } = useMemo(() => {
    if (activeSlot) {
      // 1. Find enrolled students matching this slot
      const slotYearNorm = normalizeYear(activeSlot.year);
      const slotGroupNorm = (activeSlot.student_group || "").trim().toUpperCase();

      const enrolled = studentsData.filter(st => {
        // Match year
        if (slotYearNorm && normalizeYear(st.year) !== slotYearNorm) {
          return false;
        }
        // Match batch / group
        if (slotGroupNorm && slotGroupNorm !== "ALL") {
          const stBatch = (st.batch || "").trim().toUpperCase();
          if (stBatch && !slotGroupNorm.includes(stBatch) && !stBatch.includes(slotGroupNorm)) {
            return false;
          }
        }
        // Match department if lab department matches
        if (currentLab?.department && st.department) {
          const d1 = currentLab.department.toLowerCase();
          const d2 = st.department.toLowerCase();
          if (!d1.includes(d2) && !d2.includes(d1)) return false;
        }
        return true;
      });

      // Sessions that belong to this slot
      const slotSessions = daySessions.filter(s => s.timetable_slot === activeSlot.slot_id);
      const sessionMap = new Map();
      slotSessions.forEach(s => {
        sessionMap.set(s.student_id, s);
      });

      // Combine enrolled with sessions
      const rowList = [];
      const enrolledIds = new Set();

      enrolled.forEach(st => {
        enrolledIds.add(st.student_id);
        const sess = sessionMap.get(st.student_id);
        if (sess) {
          rowList.push({
            student_id: st.student_id,
            student_name: st.name || sess.student_name || "Unknown Student",
            roll_no: st.roll_no || sess.roll_no || "—",
            batch: st.batch || sess.batch || "—",
            machine_id: sess.machine_id,
            login_time: sess.login_time,
            total_duration: sess.total_duration || 0,
            compliance_status: sess.compliance_status || "compliant",
            course_code: sess.course_code || activeSlot.course_code || "—",
            is_enrolled: true,
            is_present: true,
          });
        } else {
          rowList.push({
            student_id: st.student_id,
            student_name: st.name || "Unknown Student",
            roll_no: st.roll_no || "—",
            batch: st.batch || "—",
            machine_id: "—",
            login_time: null,
            total_duration: 0,
            compliance_status: "absent",
            course_code: activeSlot.course_code || "—",
            is_enrolled: true,
            is_present: false,
          });
        }
      });

      // Include guest / cross-batch students who attended this slot
      slotSessions.forEach(sess => {
        if (!enrolledIds.has(sess.student_id)) {
          const st = studentsData.find(s => s.student_id === sess.student_id);
          rowList.push({
            student_id: sess.student_id,
            student_name: st?.name || sess.student_name || "Unknown Student",
            roll_no: st?.roll_no || sess.roll_no || "—",
            batch: st?.batch || sess.batch || "—",
            machine_id: sess.machine_id,
            login_time: sess.login_time,
            total_duration: sess.total_duration || 0,
            compliance_status: sess.compliance_status || "compliant",
            course_code: sess.course_code || activeSlot.course_code || "—",
            is_enrolled: false,
            is_present: true,
          });
        }
      });

      // Filter by search
      const q = search.trim().toLowerCase();
      const filteredRows = q
        ? rowList.filter(r =>
            r.student_name?.toLowerCase().includes(q) ||
            r.student_id?.toLowerCase().includes(q) ||
            r.roll_no?.toLowerCase().includes(q)
          )
        : rowList;

      const enrolledCount = enrolled.length;
      const presentCount = rowList.filter(r => r.is_present).length;
      const absentCount = rowList.filter(r => r.compliance_status === "absent").length;
      const compliantCount = rowList.filter(r => r.compliance_status === "compliant").length;
      const partialCount = rowList.filter(r => r.compliance_status === "partial").length;
      const nonCompliantCount = rowList.filter(r => r.compliance_status === "non_compliant").length;

      const attendancePct = enrolledCount > 0 ? Math.round((presentCount / enrolledCount) * 100) : (presentCount > 0 ? 100 : 0);
      const evaluated = compliantCount + partialCount + nonCompliantCount;
      const compliancePct = evaluated > 0 ? Math.round((compliantCount / evaluated) * 100) : (presentCount > 0 ? 100 : 0);

      return {
        rows: filteredRows,
        summary: {
          isSlotSelected: true,
          enrolledCount,
          presentCount,
          absentCount,
          compliantCount,
          partialCount,
          nonCompliantCount,
          attendancePct,
          compliancePct,
        }
      };
    }

    // ALL SLOTS SELECTED:
    const rowList = daySessions.map(s => {
      const stud = studentsData.find(st => st.student_id === s.student_id);
      const slot = timetableData.find(t => t.slot_id === s.timetable_slot);
      return {
        student_id: s.student_id,
        student_name: stud ? stud.name : (s.student_name || "Unknown Student"),
        roll_no: stud?.roll_no || s.roll_no || "—",
        batch: stud?.batch || s.batch || "—",
        machine_id: s.machine_id,
        login_time: s.login_time,
        total_duration: s.total_duration || 0,
        compliance_status: s.compliance_status || (s.logout_time ? "compliant" : "pending"),
        course_code: s.course_code || slot?.course_code || "Open Access",
        timetable_slot: s.timetable_slot,
        is_present: true,
      };
    });

    const q = search.trim().toLowerCase();
    const filteredRows = q
      ? rowList.filter(r =>
          r.student_name?.toLowerCase().includes(q) ||
          r.student_id?.toLowerCase().includes(q) ||
          r.roll_no?.toLowerCase().includes(q)
        )
      : rowList;

    const compliant = rowList.filter(r => r.compliance_status === "compliant").length;
    const partial = rowList.filter(r => r.compliance_status === "partial").length;
    const nonCompliant = rowList.filter(r => r.compliance_status === "non_compliant").length;
    const openAccess = rowList.filter(r => ["open_access", "no_slot"].includes(r.compliance_status)).length;
    const pending = rowList.filter(r => r.compliance_status === "pending").length;
    const evaluated = compliant + partial + nonCompliant;
    const compliancePct = evaluated > 0 ? Math.round((compliant / evaluated) * 100) : (rowList.length > 0 ? 100 : 0);

    return {
      rows: filteredRows,
      summary: {
        isSlotSelected: false,
        totalSessions: rowList.length,
        compliant,
        partial,
        nonCompliant,
        openAccess,
        pending,
        compliancePct,
      }
    };
  }, [daySessions, timetableData, studentsData, activeSlot, currentLab, search]);

  if (labsLoading || loading) {
    return (
      <PageWrapper>
        <div className="flex items-center justify-center h-[calc(100vh-120px)]">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-slate-200 border-t-primary-600 rounded-full animate-spin"></div>
            <span className="text-sm text-slate-400">{labsLoading ? "Loading labs…" : "Loading compliance data…"}</span>
          </div>
        </div>
      </PageWrapper>
    );
  }

  if (error && labsData.length === 0) {
    return (
      <PageWrapper>
        <div className="flex items-center justify-center h-[calc(100vh-120px)]">
          <div className="text-center">
            <p className="text-red-500 font-medium text-sm">Failed to load compliance data</p>
            <p className="text-slate-400 text-xs mt-1">{error}</p>
          </div>
        </div>
      </PageWrapper>
    );
  }

  if (!labsLoading && labsData.length === 0) {
    return (
      <PageWrapper>
        <div className="flex items-center justify-center h-[calc(100vh-120px)]">
          <div className="text-center">
            <p className="text-slate-500 font-medium text-sm">No labs found</p>
            <p className="text-slate-400 text-xs mt-1">Add a lab in Admin → Labs first.</p>
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
          <h1 className="page-title">Compliance & Attendance</h1>
          <p className="page-subtitle">Timetable syllabus slots vs actual student lab attendance</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card card-body mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="form-label">Lab</label>
            <select className="form-select" value={selectedLab} onChange={e => { setSelectedLab(e.target.value); setSelectedSlot(""); }}>
              {labsData.map(l => <option key={l.lab_id} value={l.lab_id}>{l.name}</option>)}
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
                  {t.year ? `[${t.year}] ` : ""}{t.day_of_week} {t.start_time}–{t.end_time} · {t.course_code} {t.student_group ? `(${t.student_group})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">Search Student</label>
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className="form-input pl-8" placeholder="Name, PNR, or Roll…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
        </div>
      </div>

      {/* Summary stats */}
      {summary.isSlotSelected ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <StatCard
            label="Enrolled Roster"
            value={summary.enrolledCount}
            sub={`${activeSlot?.year ? `[${activeSlot.year}] ` : ""}${activeSlot?.student_group || "All"}`}
            icon={Users}
            color="blue"
          />
          <StatCard
            label="Attended (Present)"
            value={summary.presentCount}
            sub={`${summary.attendancePct}% attendance`}
            icon={UserCheck}
            color="green"
          />
          <StatCard
            label="Absent Students"
            value={summary.absentCount}
            sub={summary.absentCount > 0 ? "Did not log in" : "Full turnout"}
            icon={UserX}
            color={summary.absentCount > 0 ? "red" : "gray"}
          />
          <StatCard
            label="Compliant"
            value={summary.compliantCount}
            sub={`${summary.partialCount} partial, ${summary.nonCompliantCount} non-comp.`}
            icon={CheckCircle2}
            color="purple"
          />
          <StatCard
            label="Compliance %"
            value={`${summary.compliancePct}%`}
            sub="Of present students"
            icon={ClipboardCheck}
            color="blue"
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard label="Total Sessions"  value={summary.totalSessions} icon={ClipboardCheck} color="blue" />
          <StatCard label="Compliant"       value={summary.compliant}     icon={CheckCircle2}   color="green" />
          <StatCard
            label="Partial / Non-Comp"
            value={summary.partial + summary.nonCompliant}
            sub={`${summary.partial} partial, ${summary.nonCompliant} non-comp.`}
            icon={AlertTriangle}
            color="amber"
          />
          <StatCard
            label="Compliance %"
            value={`${summary.compliancePct}%`}
            sub={summary.pending > 0 ? `${summary.pending} in progress` : "Scheduled lab work"}
            icon={ClipboardCheck}
            color="purple"
          />
        </div>
      )}

      {/* Table */}
      <div className="card">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-sm text-slate-700">
              {activeSlot
                ? `Slot Attendance: ${activeSlot.day_of_week} ${activeSlot.start_time}–${activeSlot.end_time} (${activeSlot.course_code})`
                : "All Lab Sessions Attendance & Compliance"}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {activeSlot
                ? `Showing enrolled roster and logged-in students for ${formatIstDate(selectedDate)}`
                : `All student sessions in ${currentLab?.name || selectedLab} on ${formatIstDate(selectedDate)}`}
            </p>
          </div>
          <span className="text-xs text-slate-400 font-mono">{rows.length} records</span>
        </div>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Roll No</th>
                <th>PNR / ID</th>
                <th>Batch</th>
                <th>Machine</th>
                <th>Login Time</th>
                <th>Duration</th>
                <th>Course</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0
                ? <tr><td colSpan={9} className="text-center text-slate-400 py-10">No students found for this selection.</td></tr>
                : rows.map((r, i) => (
                  <tr key={i} className={r.compliance_status === "absent" ? "bg-red-50/20 hover:bg-red-50/40" : ""}>
                    <td>
                      <Link to={`/students/${r.student_id}`} className="font-medium text-primary-600 hover:underline">
                        {r.student_name}
                      </Link>
                    </td>
                    <td className="font-mono text-xs text-slate-500">{r.roll_no}</td>
                    <td className="font-mono text-xs text-slate-400">{r.student_id}</td>
                    <td className="text-xs text-slate-600 font-medium">{r.batch}</td>
                    <td>
                      {r.machine_id && r.machine_id !== "—" ? (
                        <Link to={`/machines/${r.machine_id}`} className="font-mono text-xs text-slate-600 hover:underline">{r.machine_id}</Link>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>
                    <td className="text-xs text-slate-500">{formatTimeIST(r.login_time)}</td>
                    <td className="num">
                      {r.total_duration > 0 ? `${Math.round(r.total_duration / 60)}m` : "—"}
                    </td>
                    <td className="text-xs text-slate-500 max-w-[140px] truncate" title={r.course_code}>{r.course_code}</td>
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
