import { useMemo, useState } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from "recharts";
import { FileBarChart2, Download } from "lucide-react";
import { labs, sessions, getComplianceStats } from "../data/mockData";
import { StatCard, SectionHeading, PageWrapper } from "../components/Shared";
import { useAuth } from "../auth/AuthContext";

function getLast7Days() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });
}

export default function ReportsPage() {
  const { user, isAdmin } = useAuth();
  const [selectedLab, setSelectedLab] = useState("ALL");
  const days = getLast7Days();

  const visibleLabs = useMemo(() => {
    if (isAdmin) return labs;
    return labs.filter(l => l.department.includes(user.department) || user.department.includes(l.department));
  }, [isAdmin, user]);

  const visibleLabIds = useMemo(() => visibleLabs.map(l => l.lab_id), [visibleLabs]);

  const trendData = useMemo(() => {
    return days.map(date => {
      let labFilter;
      if (selectedLab === "ALL") {
        labFilter = sessions.filter(s => visibleLabIds.includes(s.lab_id));
      } else {
        labFilter = sessions.filter(s => s.lab_id === selectedLab);
      }
      const day = labFilter.filter(s => s.date === date);
      const compliant = day.filter(s => s.compliance_status === "compliant").length;
      const total = day.length;
      return {
        date: date.slice(5),
        sessions: total,
        compliant,
        compliancePct: total > 0 ? Math.round((compliant / total) * 100) : 0,
      };
    });
  }, [selectedLab, visibleLabIds, days]);

  const labTrend = useMemo(() => {
    return days.map(date => {
      const entry = { date: date.slice(5) };
      visibleLabs.forEach(lab => {
        const day = sessions.filter(s => s.lab_id === lab.lab_id && s.date === date);
        entry[lab.name] = day.length;
      });
      return entry;
    });
  }, [visibleLabs, days]);

  const totals = useMemo(() => {
    let filtered;
    if (selectedLab === "ALL") {
      filtered = sessions.filter(s => visibleLabIds.includes(s.lab_id));
    } else {
      filtered = sessions.filter(s => s.lab_id === selectedLab);
    }
    const compliant = filtered.filter(s => s.compliance_status === "compliant").length;
    return {
      total: filtered.length,
      compliant,
      pct: filtered.length > 0 ? Math.round((compliant / filtered.length) * 100) : 0,
    };
  }, [selectedLab, visibleLabIds]);

  const COLORS = ["#0d9488","#14b8a6","#78716c","#d97706"];

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
