import { useMemo, useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { Monitor, Users, CheckCircle2, Clock, Activity, Globe } from "lucide-react";
import {
  labs, appUsages, getHourlyUtilization,
  getComplianceStats, todayStr, formatDuration
} from "../data/mockData";
import {
  StatCard, ComplianceBadge, MachineStatusBadge,
  SectionHeading, EmptyState, PageWrapper
} from "../components/Shared";

// Heatmap: hour × day
const HOURS = ["9","10","11","12","13","14","15","16","17"];
const DAYS  = ["MON","TUE","WED","THU","FRI"];

function HeatmapCell({ value, max }) {
  const pct = max > 0 ? value / max : 0;
  const bg = pct === 0 ? "#fafaf9"
    : pct < 0.25 ? "#ccfbf1"
    : pct < 0.5  ? "#99f6e4"
    : pct < 0.75 ? "#14b8a6"
    : "#0f766e";
  const text = pct < 0.5 ? "#115e59" : "#fff";
  return (
    <div
      className="rounded text-center flex items-center justify-center text-xs font-medium border border-white cursor-pointer transition-all hover:scale-110 hover:shadow"
      style={{ backgroundColor: bg, color: text, width: 36, height: 36 }}
      title={`${value} sessions`}
    >
      {value || ""}
    </div>
  );
}

import { fetchUsage, fetchMachines, fetchTopSites } from "../api/apiClient";
import { useAuth } from "../auth/AuthContext";

export default function LabDetailPage({ globalDate }) {
  const { labId } = useParams();
  const { user, isAdmin } = useAuth();
  const lab = labs.find(l => l.lab_id === labId);

  const isAuthorized = useMemo(() => {
    if (isAdmin) return true;
    if (!lab) return false;
    return lab.department.includes(user.department) || user.department.includes(lab.department);
  }, [lab, isAdmin, user]);

  const today = globalDate || todayStr();
  const [selectedDate, setSelectedDate] = useState(today);
  const [machinesData, setMachinesData] = useState([]);
  const [sessionsData, setSessionsData] = useState([]);
  const [allLabSessions, setAllLabSessions] = useState([]);
  const [topSitesData, setTopSitesData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (globalDate) {
      setSelectedDate(globalDate);
    }
  }, [globalDate]);

  useEffect(() => {
    let active = true;
    setLoading(true);

    Promise.all([
      fetchMachines(labId),
      fetchUsage({ lab_id: labId, date: selectedDate }),
      fetchUsage({ lab_id: labId }), // for heatmap
      fetchTopSites(labId, selectedDate)
    ]).then(([machs, sess, allSess, sites]) => {
      if (active) {
        setMachinesData(machs || []);
        setSessionsData(sess || []);
        setAllLabSessions(allSess || []);
        setTopSitesData(sites || []);
        setLoading(false);
      }
    }).catch(err => {
      console.error(err);
      if (active) setLoading(false);
    });

    return () => { active = false; };
  }, [labId, selectedDate]);

  const labMachines = machinesData;
  const daySessions = sessionsData;

  const hourlyData = useMemo(() => {
    return Array.from({ length: 9 }, (_, i) => {
      const hour = i + 9;
      const count = daySessions.filter(s => {
        const d = new Date(s.login_time);
        return d.getHours() === hour || d.getUTCHours() + 5.5 === hour;
      }).length;
      return { hour: `${hour}:00`, sessions: count };
    });
  }, [daySessions]);

  const complianceSt = useMemo(() => {
    const total = daySessions.length;
    const compliant = daySessions.filter(s => s.compliance_status === "compliant").length;
    const partial = daySessions.filter(s => s.compliance_status === "partial").length;
    const non_compliant = daySessions.filter(s => s.compliance_status === "non_compliant").length;
    return { total, compliant, partial, non_compliant };
  }, [daySessions]);

  // Heatmap data: sessions[day][hour]
  const heatmapData = useMemo(() => {
    const map = {};
    DAYS.forEach(d => { map[d] = {}; HOURS.forEach(h => { map[d][h] = 0; }); });
    allLabSessions.forEach(s => {
      const dt = new Date(s.login_time);
      const day = DAYS[dt.getDay() - 1];
      const hour = String(dt.getHours());
      if (day && map[day] && map[day][hour] !== undefined) map[day][hour]++;
    });
    return map;
  }, [allLabSessions]);

  const maxHeatVal = useMemo(() => {
    let m = 0;
    DAYS.forEach(d => HOURS.forEach(h => { if (heatmapData[d]?.[h] > m) m = heatmapData[d][h]; }));
    return m || 1;
  }, [heatmapData]);

  if (loading) {
    return (
      <PageWrapper>
        <div className="flex items-center justify-center h-[calc(100vh-120px)]">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-slate-200 border-t-primary-600 rounded-full animate-spin"></div>
            <span className="text-sm text-slate-400">Loading lab details…</span>
          </div>
        </div>
      </PageWrapper>
    );
  }

  if (!lab) {
    return <PageWrapper><EmptyState title="Lab not found" description="This lab doesn't exist." /></PageWrapper>;
  }

  if (!isAuthorized) {
    return (
      <PageWrapper>
        <EmptyState
          title="Access Denied"
          description={`You are only authorized to view labs for the ${user.department} department.`}
        />
      </PageWrapper>
    );
  }

  const compliancePct = complianceSt.total > 0
    ? Math.round((complianceSt.compliant / complianceSt.total) * 100) : 0;

  return (
    <PageWrapper>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">{lab.name}</h1>
          <p className="page-subtitle">{lab.building} · {lab.floor} Floor · {lab.department}</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
            className="form-input text-xs py-1.5 w-36" max={today} />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Sessions"         value={daySessions.length}    icon={Activity}    color="blue"  />
        <StatCard label="Compliance"       value={`${compliancePct}%`}   icon={CheckCircle2} color="green" />
        <StatCard label="Machines"         value={`${labMachines.filter(m=>m.status==="active").length}/${labMachines.length}`} icon={Monitor} color="purple"/>
        <StatCard label="Compliant"        value={complianceSt.compliant} icon={Users}        color="amber" />
      </div>

      {/* Machine grid */}
      <div className="card card-body mb-6">
        <SectionHeading title="Machine Grid" />
        <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-2">
          {labMachines.map(m => {
            const mSessions = daySessions.filter(s => s.machine_id === m.machine_id);
            const utilColor = mSessions.length === 0
              ? "bg-slate-100 text-slate-400"
              : mSessions.length < 3
                ? "bg-primary-50 text-primary-700"
                : "bg-primary-600 text-white";
            return (
              <Link key={m.machine_id} to={`/machines/${m.machine_id}`}
                className={`rounded-lg text-center py-2 px-1 text-xs font-medium transition-all hover:scale-105 hover:shadow-sm ${utilColor} ${m.status === "inactive" ? "opacity-40 cursor-not-allowed pointer-events-none" : ""}`}
                title={`${m.machine_id}: ${mSessions.length} sessions`}
              >
                <div className="font-mono text-[10px]">{m.machine_id.split("-").pop()}</div>
                <div className="text-[10px] mt-0.5">{mSessions.length}s</div>
              </Link>
            );
          })}
        </div>
        <div className="flex items-center gap-4 mt-4 text-xs text-slate-400">
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-slate-100" /> Idle</div>
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-primary-50" /> Low</div>
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-primary-600" /> Active</div>
        </div>
      </div>

      {/* Hourly bar + heatmap */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="card card-body">
          <SectionHeading title="Hourly Sessions" />
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={hourlyData} margin={{ top: 4, right: 8, bottom: 0, left: -24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
              <XAxis dataKey="hour" tick={{ fontSize: 11, fill:"#78716c" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill:"#78716c" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ border:"1px solid #e7e5e4", borderRadius: 10, fontSize: 12 }} cursor={{ fill:"#f5f5f4" }} />
              <Bar dataKey="sessions" fill="#0d9488" radius={[4,4,0,0]} name="Sessions" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Heatmap */}
        <div className="card card-body">
          <SectionHeading title="Hour × Day Heatmap" />
          <div className="overflow-x-auto">
            <div className="inline-flex gap-2">
              {/* Y-axis labels */}
              <div className="flex flex-col gap-1 pt-6">
                {HOURS.map(h => (
                  <div key={h} className="text-xs text-slate-400 text-right pr-1 flex items-center justify-end" style={{ height: 36 }}>{h}:00</div>
                ))}
              </div>
              <div className="flex gap-1">
                {DAYS.map(day => (
                  <div key={day} className="flex flex-col gap-1 items-center">
                    <div className="text-xs text-slate-500 font-medium mb-1">{day}</div>
                    {HOURS.map(h => (
                      <HeatmapCell key={h} value={heatmapData[day]?.[h] || 0} max={maxHeatVal} />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3 text-xs text-slate-400">
            <div className="w-3 h-3 rounded" style={{background:"#fafaf9",border:"1px solid #e7e5e4"}} /> Low
            <div className="w-3 h-3 rounded" style={{background:"#99f6e4"}} /> Med
            <div className="w-3 h-3 rounded bg-primary-600" /> High
          </div>
        </div>
      </div>

      {/* Top Websites */}
      <div className="card card-body mb-6">
        <SectionHeading title={`Top Websites Visited — ${selectedDate}`} />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {topSitesData.length === 0
            ? <p className="text-sm text-slate-400 col-span-full py-4 text-center">No browser activity recorded for this date.</p>
            : topSitesData.map((site, i) => {
              const maxDur = topSitesData[0].active_duration || 1;
              return (
                <div key={site.domain} className="flex items-center gap-3 p-2.5 rounded-lg bg-slate-50/50">
                  <span className="text-xs font-medium text-slate-400 w-4 text-center">{i + 1}</span>
                  <Globe className="w-4 h-4 text-slate-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{site.domain}</p>
                    <div className="w-full h-1 bg-slate-200 rounded-full overflow-hidden mt-1">
                      <div className="h-full bg-primary-500 rounded-full" style={{ width: `${(site.active_duration / maxDur) * 100}%` }} />
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-mono text-slate-600">{formatDuration(site.active_duration)}</p>
                    <p className="text-[10px] text-slate-400">{site.visit_count} visits</p>
                  </div>
                </div>
              );
            })
          }
        </div>
      </div>

      {/* Sessions table */}
      <div className="card">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-sm text-slate-700">Sessions — {selectedDate}</h3>
        </div>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Machine</th>
                <th>Login Time</th>
                <th>Duration</th>
                <th>Slot</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {daySessions.length === 0
                ? <tr><td colSpan={6} className="text-center text-slate-400 py-8">No sessions recorded for this period.</td></tr>
                : daySessions.slice(0, 20).map(s => (
                  <tr key={s.session_id}>
                    <td><Link to={`/students/${s.student_id}`} className="font-medium text-primary-600 hover:underline">{s.student_name}</Link></td>
                    <td><Link to={`/machines/${s.machine_id}`} className="font-mono text-xs hover:underline text-slate-600">{s.machine_id}</Link></td>
                    <td className="text-slate-500 text-xs">{new Date(s.login_time).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}</td>
                    <td className="num">{formatDuration(s.total_duration)}</td>
                    <td className="text-xs text-slate-400 max-w-[120px] truncate">{s.course_code}</td>
                    <td><ComplianceBadge status={s.compliance_status} /></td>
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
