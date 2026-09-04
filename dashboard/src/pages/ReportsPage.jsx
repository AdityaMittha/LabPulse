import { useMemo, useState, useEffect } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from "recharts";
import { FileBarChart2, Download } from "lucide-react";
import { StatCard, SectionHeading, PageWrapper } from "../components/Shared";
import { useAuth } from "../auth/AuthContext";
import { fetchLabs, fetchUsage } from "../api/apiClient";

function getLast7Days() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });
}

const COLORS = ["#0d9488","#14b8a6","#78716c","#d97706"];

export default function ReportsPage() {
  const { user, isAdmin } = useAuth();
  const days = getLast7Days();
  const dateFrom = days[0];
  const dateTo   = days[days.length - 1];

  const [labs,         setLabs]         = useState([]);
  const [sessions,     setSessions]     = useState([]);
  const [selectedLab,  setSelectedLab]  = useState("ALL");
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    // Fetch labs first, then fetch sessions for each visible lab for the 7-day window
    fetchLabs().then(labsList => {
      if (!active) return;
      setLabs(labsList);

      const visibleLabs = isAdmin
        ? labsList
        : labsList.filter(l => l.department?.includes(user?.department) || user?.department?.includes(l.department));

      // Fetch per-lab to avoid a full table scan; catch individual errors so partial data still displays
      const fetchPromises = visibleLabs.length > 0
        ? visibleLabs.map(l => fetchUsage({ lab_id: l.lab_id, date_from: dateFrom, date_to: dateTo, limit: 500 }).catch(err => {
            console.warn(`Usage fetch failed for lab ${l.lab_id}:`, err);
            return [];
          }))
        : [fetchUsage({ date_from: dateFrom, date_to: dateTo, limit: 500 }).catch(() => [])];

      return Promise.all(fetchPromises);
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
  }, [isAdmin, user.department, dateFrom, dateTo]);

  const visibleLabs = useMemo(() => {
    if (isAdmin) return labs;
    return labs.filter(l =>
      l.department?.includes(user.department) || user.department?.includes(l.department)
    );
  }, [isAdmin, user, labs]);

  const visibleLabIds = useMemo(() => visibleLabs.map(l => l.lab_id), [visibleLabs]);

  const trendData = useMemo(() => {
    return days.map(date => {
      const filtered = selectedLab === "ALL"
        ? sessions.filter(s => visibleLabIds.includes(s.lab_id) && s.date === date)
        : sessions.filter(s => s.lab_id === selectedLab && s.date === date);
      const compliant = filtered.filter(s => s.compliance_status === "compliant").length;
      const total     = filtered.length;
      return {
        date: date.slice(5),
        sessions: total,
        compliant,
        compliancePct: total > 0 ? Math.round((compliant / total) * 100) : 0,
      };
    });
  }, [sessions, selectedLab, visibleLabIds, days]);

  const labTrend = useMemo(() => {
    return days.map(date => {
      const entry = { date: date.slice(5) };
      visibleLabs.forEach(lab => {
        const day = sessions.filter(s => s.lab_id === lab.lab_id && s.date === date);
        entry[lab.name] = day.length;
      });
      return entry;
    });
  }, [visibleLabs, sessions, days]);

  const totals = useMemo(() => {
    const filtered = selectedLab === "ALL"
      ? sessions.filter(s => visibleLabIds.includes(s.lab_id))
      : sessions.filter(s => s.lab_id === selectedLab);
    const compliant = filtered.filter(s => s.compliance_status === "compliant").length;
    return {
      total:    filtered.length,
      compliant,
      pct: filtered.length > 0 ? Math.round((compliant / filtered.length) * 100) : 0,
    };
  }, [sessions, selectedLab, visibleLabIds]);

  if (loading) {
    return (
      <PageWrapper>
        <div className="flex items-center justify-center h-[calc(100vh-120px)]">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-slate-200 border-t-primary-600 rounded-full animate-spin"></div>
            <span className="text-sm text-slate-400">Loading 7-day reports…</span>
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
      <div className="page-header">
        <div>
          <h1 className="page-title">Reports {isAdmin ? "" : `— ${user.department}`}</h1>
          <p className="page-subtitle">Last 7 days usage and compliance trends for {isAdmin ? "all labs" : `${user.department} department`}</p>
        </div>
        <div className="flex items-center gap-2">
          <select className="form-select text-sm py-1.5 w-40" value={selectedLab} onChange={e => setSelectedLab(e.target.value)}>
            <option value="ALL">All Labs</option>
            {visibleLabs.map(l => <option key={l.lab_id} value={l.lab_id}>{l.name}</option>)}
          </select>
          <button className="btn-secondary btn-sm">
            <Download size={13} /> Export CSV
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Total Sessions (7d)"  value={totals.total}      icon={FileBarChart2} color="blue"   />
        <StatCard label="Compliant Sessions"   value={totals.compliant}  icon={FileBarChart2} color="green"  />
        <StatCard label="Overall Compliance"   value={`${totals.pct}%`}  icon={FileBarChart2} color="purple" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Daily sessions trend */}
        <div className="card card-body">
          <SectionHeading title="Daily Sessions Trend" />
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trendData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#78716c" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#78716c" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ border: "1px solid #e7e5e4", borderRadius: 10, fontSize: 12 }} />
              <Line type="monotone" dataKey="sessions" stroke="#0d9488" strokeWidth={2} dot={{ r: 3 }} name="Total Sessions" />
              <Line type="monotone" dataKey="compliant" stroke="#16a34a" strokeWidth={2} dot={{ r: 3 }} name="Compliant" strokeDasharray="4 2" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Compliance % trend */}
        <div className="card card-body">
          <SectionHeading title="Compliance % Trend" />
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={trendData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#78716c" }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#78716c" }} axisLine={false} tickLine={false} unit="%" />
              <Tooltip contentStyle={{ border: "1px solid #e7e5e4", borderRadius: 10, fontSize: 12 }} formatter={v => `${v}%`} />
              <Bar dataKey="compliancePct" fill="#78716c" radius={[4,4,0,0]} name="Compliance %" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Lab comparison */}
      <div className="card card-body">
        <SectionHeading title="Sessions per Lab — Last 7 Days" />
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={labTrend} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#78716c" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#78716c" }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ border: "1px solid #e7e5e4", borderRadius: 10, fontSize: 12 }} />
            <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
            {visibleLabs.map((lab, i) => (
              <Bar key={lab.lab_id} dataKey={lab.name} fill={COLORS[i % COLORS.length]} radius={[3,3,0,0]} stackId="a" />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </PageWrapper>
  );
}
