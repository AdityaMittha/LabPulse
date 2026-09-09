import { useMemo, useState, useEffect } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from "recharts";
import {
  FileBarChart2, Download, Calendar, Clock, CheckCircle2,
  AlertTriangle, Building2, Search, User, Monitor, ChevronRight
} from "lucide-react";
import { StatCard, SectionHeading, PageWrapper } from "../components/Shared";
import { useAuth } from "../auth/AuthContext";
import { fetchLabs, fetchUsage } from "../api/apiClient";
import { COLLEGE_PERIODS, formatDuration, todayStr } from "../data/mockData";

function getPast7Days(endDateStr) {
  let end;
  if (endDateStr) {
    const parts = endDateStr.split("-").map(Number);
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      end = new Date(parts[0], parts[1] - 1, parts[2]);
    }
  }
  if (!end || isNaN(end.getTime())) {
    end = new Date();
  }

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(end);
    d.setDate(d.getDate() - (6 - i));
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  });
}

function formatDateLong(dateStr) {
  if (!dateStr) return "";
  try {
    const [y, m, d] = dateStr.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  } catch {
    return dateStr;
  }
}

function formatDateShort(dateStr) {
  if (!dateStr) return "";
  try {
    const [y, m, d] = dateStr.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

function formatDateLabel(dateStr) {
  if (!dateStr) return "";
  try {
    const [y, m, d] = dateStr.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString("en-US", { weekday: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

function getDateRelativity(dateStr) {
  const today = todayStr();
  if (dateStr === today) return "Today";
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const yStr = y.toISOString().slice(0, 10);
  if (dateStr === yStr) return "Yesterday";
  return null;
}

const LAB_COLORS = ["#0d9488", "#3b82f6", "#8b5cf6", "#f59e0b", "#ec4899", "#10b981"];

export default function ReportsPage({ globalDate = todayStr(), onDateChange }) {
  const { user, isAdmin } = useAuth();

  const selectedDate = globalDate || todayStr();
  const [viewMode, setViewMode] = useState("day"); // 'day' (selected date) | 'week' (7-day trend)
  const [selectedLab, setSelectedLab] = useState("ALL");
  const [search, setSearch] = useState("");

  const [labs, setLabs] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // 7-day window ending on selectedDate (used when user switches to 'week' trend view)
  const past7Days = useMemo(() => getPast7Days(selectedDate), [selectedDate]);
  const dateFrom = viewMode === "day" ? selectedDate : past7Days[0];
  const dateTo   = selectedDate;

  // Fetch labs and usage when date or view mode changes
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    fetchLabs().then(labsList => {
      if (!active) return;
      setLabs(labsList);

      const visibleLabs = isAdmin
        ? labsList
        : labsList.filter(l => l.department?.includes(user?.department) || user?.department?.includes(l.department));

      if (viewMode === "day") {
        // Fetch strictly for the single selected date
        const fetchPromises = visibleLabs.length > 0
          ? visibleLabs.map(l => fetchUsage({ lab_id: l.lab_id, date: selectedDate, limit: 500 }).catch(() => []))
          : [fetchUsage({ date: selectedDate, limit: 500 }).catch(() => [])];
        return Promise.all(fetchPromises);
      } else {
        // Fetch for 7-day window
        const fetchPromises = visibleLabs.length > 0
          ? visibleLabs.map(l => fetchUsage({ lab_id: l.lab_id, date_from: dateFrom, date_to: dateTo, limit: 500 }).catch(() => []))
          : [fetchUsage({ date_from: dateFrom, date_to: dateTo, limit: 500 }).catch(() => [])];
        return Promise.all(fetchPromises);
      }
    }).then(results => {
      if (!active || !results) return;
      const merged = results.flat();
      setSessions(merged);
      setLoading(false);
    }).catch(err => {
      console.error("ReportsPage fetch error:", err);
      if (active) { setError(err.message); setLoading(false); }
    });

    return () => { active = false; };
  }, [isAdmin, user?.department, selectedDate, viewMode, dateFrom, dateTo]);

  const visibleLabs = useMemo(() => {
    if (isAdmin) return labs;
    return labs.filter(l =>
      l.department?.includes(user?.department) || user?.department?.includes(l.department)
    );
  }, [isAdmin, user, labs]);

  const visibleLabIds = useMemo(() => visibleLabs.map(l => l.lab_id), [visibleLabs]);

  // Filtered sessions by selectedLab
  const filteredSessions = useMemo(() => {
    return selectedLab === "ALL"
      ? sessions.filter(s => visibleLabIds.includes(s.lab_id))
      : sessions.filter(s => s.lab_id === selectedLab);
  }, [sessions, selectedLab, visibleLabIds]);

  // Single Day KPI Metrics
  const dayStats = useMemo(() => {
    const total = filteredSessions.length;
    const compliant = filteredSessions.filter(s => s.compliance_status === "compliant").length;
    const partial   = filteredSessions.filter(s => s.compliance_status === "partial").length;
    const nonCompliant = filteredSessions.filter(s => s.compliance_status === "non_compliant" || s.compliance_status === "pending").length;
    const pct = total > 0 ? Math.round((compliant / total) * 100) : 0;
    const uniqueStudents = new Set(filteredSessions.map(s => s.student_id)).size;
    const uniqueMachines = new Set(filteredSessions.map(s => s.machine_id)).size;

    return { total, compliant, partial, nonCompliant, pct, uniqueStudents, uniqueMachines };
  }, [filteredSessions]);

  // Period / Hourly activity breakdown for the selected day
  const periodData = useMemo(() => {
    return COLLEGE_PERIODS.map(p => {
      const count = filteredSessions.filter(s => {
        if (!s.login_time) return false;
        try {
          const timePart = s.login_time.includes("T") ? s.login_time.split("T")[1].slice(0, 5) : s.login_time.slice(0, 5);
          const [h, m] = timePart.split(":").map(Number);
          const mins = h * 60 + m;
          const pStart = p.startH * 60 + p.startM;
          const pEnd   = p.endH   * 60 + p.endM;
          return mins >= pStart && mins < pEnd;
        } catch {
          return false;
        }
      }).length;
      return {
        name: p.name,
        period: p.label,
        range: p.range,
        sessions: count,
      };
    });
  }, [filteredSessions]);

  // Sessions by Lab for the selected day
  const labDistributionData = useMemo(() => {
    return visibleLabs.map((l, i) => {
      const count = filteredSessions.filter(s => s.lab_id === l.lab_id).length;
      return {
        lab_id: l.lab_id,
        name: l.name,
        sessions: count,
        fill: LAB_COLORS[i % LAB_COLORS.length],
      };
    });
  }, [visibleLabs, filteredSessions]);

  // 7-day trend data (for Week view)
  const weekTrendData = useMemo(() => {
    return past7Days.map(date => {
      const daySessions = filteredSessions.filter(s => s.date === date);
      const compliant = daySessions.filter(s => s.compliance_status === "compliant").length;
      const total = daySessions.length;
      return {
        rawDate: date,
        date: formatDateLabel(date),
        dateFull: formatDateLong(date),
        sessions: total,
        compliant,
        compliancePct: total > 0 ? Math.round((compliant / total) * 100) : 0,
      };
    });
  }, [past7Days, filteredSessions]);

  // Search filtered table rows for day report
  const tableRows = useMemo(() => {
    if (!search.trim()) return filteredSessions;
    const q = search.toLowerCase();
    return filteredSessions.filter(s =>
      (s.student_name || "").toLowerCase().includes(q) ||
      (s.student_id || "").toLowerCase().includes(q) ||
      (s.machine_id || "").toLowerCase().includes(q) ||
      (s.lab_id || "").toLowerCase().includes(q) ||
      (s.course_code || "").toLowerCase().includes(q)
    );
  }, [filteredSessions, search]);

  const handleExportCsv = () => {
    if (viewMode === "day") {
      if (filteredSessions.length === 0) {
        alert("No session records found for this date.");
        return;
      }
      const headers = "Student ID,Student Name,Machine ID,Lab ID,Login Time,Duration,Timetable Slot,Compliance Status";
      const rows = filteredSessions.map(s =>
        `"${s.student_id || ""}","${(s.student_name || "").replace(/"/g, '""')}","${s.machine_id || ""}","${s.lab_id || ""}","${s.login_time || ""}",${s.total_duration || 0},"${s.timetable_slot || ""}","${s.compliance_status || ""}"`
      );
      const csvContent = [headers, ...rows].join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `lab_report_${selectedDate}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      const headers = "Date,Total Sessions,Compliant Sessions,Compliance %";
      const rows = weekTrendData.map(r => `"${r.rawDate}",${r.sessions},${r.compliant},"${r.compliancePct}%"`);
      const csvContent = [headers, ...rows].join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `lab_trend_${past7Days[0]}_to_${selectedDate}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleDateButtonClick = (daysAgo) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    const dateStr = d.toISOString().slice(0, 10);
    if (onDateChange) onDateChange(dateStr);
  };

  const relativity = getDateRelativity(selectedDate);

  if (loading) {
    return (
      <PageWrapper>
        <div className="flex items-center justify-center h-[calc(100vh-120px)]">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-slate-200 border-t-primary-600 rounded-full animate-spin"></div>
            <span className="text-sm text-slate-400">Loading {viewMode === "day" ? "date report…" : "7-day trend…"}</span>
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
            <p className="text-red-500 font-medium text-sm">Failed to load reports</p>
            <p className="text-slate-400 text-xs mt-1">{error}</p>
          </div>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      {/* Header */}
      <div className="page-header flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="page-title">
            {viewMode === "day" ? "Daily Lab Utilization Report" : "Weekly Trend Report"} {isAdmin ? "" : `— ${user?.department}`}
          </h1>
          <p className="page-subtitle">
            {viewMode === "day"
              ? `Report for ${formatDateLong(selectedDate)}${relativity ? ` (${relativity})` : ""}`
              : `7-day performance trend ending on ${formatDateLong(selectedDate)}`}
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* View Mode Toggle: Day Report vs 7-Day Trend */}
          <div className="bg-slate-100 p-0.5 rounded-lg border border-slate-200 flex items-center text-xs font-medium">
            <button
              onClick={() => setViewMode("day")}
              className={`px-3 py-1.5 rounded-md transition-all ${
                viewMode === "day"
                  ? "bg-white text-slate-800 font-semibold shadow-2xs"
                  : "text-slate-600 hover:text-slate-800"
              }`}
            >
              Day Report
            </button>
            <button
              onClick={() => setViewMode("week")}
              className={`px-3 py-1.5 rounded-md transition-all ${
                viewMode === "week"
                  ? "bg-white text-slate-800 font-semibold shadow-2xs"
                  : "text-slate-600 hover:text-slate-800"
              }`}
            >
              7-Day Trend
            </button>
          </div>

          <select
            className="form-select text-xs py-1.5 w-44"
            value={selectedLab}
            onChange={e => setSelectedLab(e.target.value)}
          >
            <option value="ALL">All Computer Labs</option>
            {visibleLabs.map(l => <option key={l.lab_id} value={l.lab_id}>{l.name} ({l.lab_id})</option>)}
          </select>

          <button
            onClick={handleExportCsv}
            className="btn-secondary btn-sm inline-flex items-center gap-1.5"
            title="Download report data as CSV"
          >
            <Download size={13} /> Export CSV
          </button>
        </div>
      </div>

      {/* Date Navigation Strip */}
      <div className="bg-white border border-slate-200/80 rounded-xl p-3 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center shrink-0">
            <Calendar size={16} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-slate-800">
                {viewMode === "day" ? formatDateLong(selectedDate) : `${formatDateShort(past7Days[0])} → ${formatDateShort(selectedDate)}`}
              </span>
              {relativity && (
                <span className="text-[10px] bg-primary-50 text-primary-700 font-semibold px-2 py-0.5 rounded-full border border-primary-200">
                  {relativity}
                </span>
              )}
            </div>
            <span className="text-[11px] text-slate-400">
              {viewMode === "day"
                ? "Showing student logins and timetable compliance strictly for this date."
                : "Showing rolling 7-day analytics leading up to this date."}
            </span>
          </div>
        </div>

        {/* Quick Date Switcher Buttons */}
        <div className="flex items-center gap-1.5 self-end sm:self-auto">
          <button
            onClick={() => handleDateButtonClick(0)}
            className={`px-2.5 py-1 text-xs rounded-md border transition-all ${
              relativity === "Today"
                ? "bg-primary-600 text-white border-primary-600 font-semibold shadow-2xs"
                : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
            }`}
          >
            Today
          </button>
          <button
            onClick={() => handleDateButtonClick(1)}
            className={`px-2.5 py-1 text-xs rounded-md border transition-all ${
              relativity === "Yesterday"
                ? "bg-primary-600 text-white border-primary-600 font-semibold shadow-2xs"
                : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
            }`}
          >
            Yesterday
          </button>
          <button
            onClick={() => handleDateButtonClick(7)}
            className="px-2.5 py-1 text-xs rounded-md bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100 transition-all"
          >
            7 Days Ago
          </button>
          <input
            type="date"
            value={selectedDate}
            max={todayStr()}
            onChange={e => {
              if (e.target.value && onDateChange) onDateChange(e.target.value);
            }}
            className="form-input text-xs py-0.5 px-2 w-32 ml-1"
            title="Choose custom date"
          />
        </div>
      </div>

      {/* ────────────────── VIEW MODE 1: SINGLE DAY REPORT ────────────────── */}
      {viewMode === "day" && (
        <>
          {/* Summary KPI Cards for Selected Day */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatCard
              label={`Total Sessions (${relativity || formatDateShort(selectedDate)})`}
              value={dayStats.total}
              icon={FileBarChart2}
              color="blue"
            />
            <StatCard
              label="Compliant Sessions"
              value={dayStats.compliant}
              icon={CheckCircle2}
              color="green"
            />
            <StatCard
              label="Unscheduled / Off-Slot"
              value={dayStats.nonCompliant}
              icon={AlertTriangle}
              color="amber"
            />
            <StatCard
              label="Compliance Rate"
              value={`${dayStats.pct}%`}
              icon={Clock}
              color="purple"
            />
          </div>

          {/* Charts for Selected Day */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Period-wise Utilization Chart */}
            <div className="card card-body">
              <div className="mb-3">
                <h3 className="font-semibold text-sm text-slate-800">Activity by Class Period</h3>
                <p className="text-xs text-slate-400">Student login sessions across college periods on {formatDateShort(selectedDate)}</p>
              </div>

              {dayStats.total === 0 ? (
                <div className="flex flex-col items-center justify-center h-[210px] text-center p-4 bg-slate-50/50 rounded-lg border border-dashed border-slate-200">
                  <Clock size={24} className="text-slate-300 mb-1.5" />
                  <p className="text-xs font-semibold text-slate-700">No session activity on {formatDateShort(selectedDate)}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    No students were logged into lab PCs on this day.
                  </p>
                  <div className="flex gap-2 mt-2.5">
                    <button
                      onClick={() => handleDateButtonClick(0)}
                      className="text-[11px] text-primary-600 font-semibold underline hover:text-primary-700"
                    >
                      View Today
                    </button>
                    <span className="text-slate-300">·</span>
                    <button
                      onClick={() => handleDateButtonClick(1)}
                      className="text-[11px] text-primary-600 font-semibold underline hover:text-primary-700"
                    >
                      View Yesterday
                    </button>
                  </div>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={210}>
                  <BarChart data={periodData} margin={{ top: 8, right: 12, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="period" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 12 }}
                      formatter={(val) => [val, "Active Sessions"]}
                      labelFormatter={(_, p) => `${p?.[0]?.payload?.name || ""} (${p?.[0]?.payload?.range || ""})`}
                    />
                    <Bar dataKey="sessions" fill="#0d9488" radius={[4, 4, 0, 0]} name="Sessions" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Sessions per Lab Chart */}
            <div className="card card-body">
              <div className="mb-3">
                <h3 className="font-semibold text-sm text-slate-800">Sessions by Computer Lab</h3>
                <p className="text-xs text-slate-400">Total student sessions per lab on {formatDateShort(selectedDate)}</p>
              </div>

              {dayStats.total === 0 ? (
                <div className="flex flex-col items-center justify-center h-[210px] text-center p-4 bg-slate-50/50 rounded-lg border border-dashed border-slate-200">
                  <Building2 size={24} className="text-slate-300 mb-1.5" />
                  <p className="text-xs font-semibold text-slate-700">No lab attendance on {formatDateShort(selectedDate)}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Sessions recorded by the PC agent will appear here grouped by lab.
                  </p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={210}>
                  <BarChart data={labDistributionData} margin={{ top: 8, right: 12, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 12 }}
                      formatter={(val) => [val, "Sessions"]}
                    />
                    <Bar dataKey="sessions" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Sessions" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Detailed Sessions Table for Selected Day */}
          <div className="card">
            <div className="px-5 py-3.5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-sm text-slate-800">Session Attendance Log</h3>
                <p className="text-xs text-slate-400">{formatDateLong(selectedDate)} · {tableRows.length} session{tableRows.length === 1 ? "" : "s"}</p>
              </div>
              <div className="relative w-full sm:w-60">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  className="form-input text-xs pl-8 py-1.5"
                  placeholder="Filter student, PC, or slot…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
            </div>

            {tableRows.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                {dayStats.total === 0
                  ? `No student sessions recorded on ${formatDateLong(selectedDate)}.`
                  : "No sessions match your search filter."}
              </div>
            ) : (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>PNR / ID</th>
                      <th>Lab</th>
                      <th>Machine</th>
                      <th>Login Time</th>
                      <th>Duration</th>
                      <th>Scheduled Slot</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map((s, idx) => (
                      <tr key={s.session_id || idx} className="hover:bg-slate-50/50">
                        <td className="font-medium text-slate-800">{s.student_name || "Student"}</td>
                        <td className="font-mono text-xs text-slate-500">{s.student_id}</td>
                        <td>
                          <span className="badge badge-slate">{s.lab_id}</span>
                        </td>
                        <td className="font-mono text-xs text-slate-600">{s.machine_id}</td>
                        <td className="font-mono text-xs text-slate-600">
                          {s.login_time?.includes("T") ? s.login_time.split("T")[1].slice(0, 5) : s.login_time || "—"}
                        </td>
                        <td className="text-xs text-slate-600">{formatDuration(s.total_duration)}</td>
                        <td className="text-xs text-slate-500 truncate max-w-[140px]">
                          {s.timetable_slot && s.timetable_slot !== "NONE" ? s.timetable_slot : "Unscheduled"}
                        </td>
                        <td>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                            s.compliance_status === "compliant"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : s.compliance_status === "partial"
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : "bg-slate-100 text-slate-600 border-slate-200"
                          }`}>
                            {s.compliance_status || "Logged"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ────────────────── VIEW MODE 2: 7-DAY TREND REPORT ────────────────── */}
      {viewMode === "week" && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <StatCard
              label="Total Sessions (7 Days)"
              value={filteredSessions.length}
              icon={FileBarChart2}
              color="blue"
            />
            <StatCard
              label="Compliant Sessions"
              value={filteredSessions.filter(s => s.compliance_status === "compliant").length}
              icon={CheckCircle2}
              color="green"
            />
            <StatCard
              label="7-Day Compliance Rate"
              value={`${filteredSessions.length > 0 ? Math.round((filteredSessions.filter(s => s.compliance_status === "compliant").length / filteredSessions.length) * 100) : 0}%`}
              icon={Clock}
              color="purple"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Daily Sessions Curve */}
            <div className="card card-body">
              <div className="mb-3">
                <h3 className="font-semibold text-sm text-slate-800">Daily Sessions Trend</h3>
                <p className="text-xs text-slate-400">Total sessions vs scheduled class attendance over the past 7 days</p>
              </div>

              {filteredSessions.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[220px] text-center p-4 bg-slate-50/50 rounded-lg border border-dashed border-slate-200">
                  <FileBarChart2 size={24} className="text-slate-300 mb-1.5" />
                  <p className="text-xs font-semibold text-slate-700">No session data in this 7-day period</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">({formatDateShort(past7Days[0])} to {formatDateShort(selectedDate)})</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={weekTrendData} margin={{ top: 8, right: 12, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 12 }}
                      labelFormatter={(_, p) => p?.[0]?.payload?.dateFull || ""}
                    />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
                    <Line type="monotone" dataKey="sessions" stroke="#0d9488" strokeWidth={2.5} dot={{ r: 3.5 }} name="Total Student Logins" />
                    <Line type="monotone" dataKey="compliant" stroke="#16a34a" strokeWidth={2} dot={{ r: 3 }} name="Scheduled Attendees" strokeDasharray="4 2" />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Compliance Rate Bar */}
            <div className="card card-body">
              <div className="mb-3">
                <h3 className="font-semibold text-sm text-slate-800">Compliance % Trend</h3>
                <p className="text-xs text-slate-400">Percentage of active students adhering to timetable schedule per day</p>
              </div>

              {filteredSessions.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[220px] text-center p-4 bg-slate-50/50 rounded-lg border border-dashed border-slate-200">
                  <CheckCircle2 size={24} className="text-slate-300 mb-1.5" />
                  <p className="text-xs font-semibold text-slate-700">No compliance statistics to display</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Sessions need to be recorded during scheduled practical slots</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={weekTrendData} margin={{ top: 8, right: 12, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} unit="%" />
                    <Tooltip
                      contentStyle={{ border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 12 }}
                      formatter={v => [`${v}%`, "Compliance Rate"]}
                      labelFormatter={(_, p) => p?.[0]?.payload?.dateFull || ""}
                    />
                    <Bar dataKey="compliancePct" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Compliance %" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </>
      )}
    </PageWrapper>
  );
}
