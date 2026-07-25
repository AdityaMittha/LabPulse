import { useMemo, useState, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Monitor, Users, Activity, CheckCircle2, FlaskConical, Clock, Cpu, Globe
} from "lucide-react";
import {
  labs, getComplianceStats, todayStr, formatDuration, getTopSites
} from "../data/mockData";
import {
  StatCard, ComplianceBadge, SectionHeading, PageWrapper
} from "../components/Shared";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { fetchUsage, fetchMachines, fetchTopSites } from "../api/apiClient";

export default function OverviewPage({ globalDate }) {
  const { user, isAdmin } = useAuth();
  const today = globalDate || todayStr();
  const [sessionsData, setSessionsData] = useState([]);
  const [machinesData, setMachinesData] = useState([]);
  const [topSitesData, setTopSitesData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    
    Promise.all([
      fetchUsage({ date: today }),
      fetchMachines(),
      fetchTopSites("", today)
    ]).then(([sess, machs, sites]) => {
      if (active) {
        setSessionsData(sess || []);
        setMachinesData(machs || []);
        setTopSitesData(sites || []);
        setLoading(false);
      }
    }).catch(err => {
      console.error(err);
      if (active) setLoading(false);
    });

    return () => { active = false; };
  }, [today]);

  // Filter labs by department if not admin
  const visibleLabs = useMemo(() => {
    if (isAdmin) return labs;
    return labs.filter(l => l.department.includes(user.department) || user.department.includes(l.department));
  }, [isAdmin, user]);

  const visibleLabIds = useMemo(() => visibleLabs.map(l => l.lab_id), [visibleLabs]);

  // Filter sessions and machines by visible labs
  const todaySessions = useMemo(() => {
    return sessionsData.filter(s => visibleLabIds.includes(s.lab_id));
  }, [sessionsData, visibleLabIds]);

  const visibleMachines = useMemo(() => {
    return machinesData.filter(m => visibleLabIds.includes(m.lab_id));
  }, [machinesData, visibleLabIds]);

  const activeMachines = visibleMachines.filter(m => m.status === "active").length;
  const onlineNow      = Math.min(activeMachines, Math.max(1, Math.floor(activeMachines * 0.6)));

  const complianceAll = useMemo(() => {
    const c = todaySessions.filter(s => s.compliance_status === "compliant").length;
    return todaySessions.length > 0 ? Math.round((c / todaySessions.length) * 100) : 0;
  }, [todaySessions]);

  // Hourly utilization across all visible labs
  const hourlyData = useMemo(() => {
    return Array.from({ length: 9 }, (_, i) => {
      const hour = i + 9;
      const count = todaySessions.filter(s => {
        const d = new Date(s.login_time);
        return d.getHours() === hour || d.getUTCHours() + 5.5 === hour; // handle both UTC and local timezone
      }).length;
      return { hour: `${hour}:00`, sessions: count };
    });
  }, [todaySessions]);

  // Recent sessions
  const recentSessions = useMemo(() =>
    [...todaySessions].sort((a, b) => new Date(b.login_time) - new Date(a.login_time)).slice(0, 8),
    [todaySessions]
  );

  // Lab utilization cards
  const labStats = useMemo(() => visibleLabs.map(lab => {
    const labSessions = todaySessions.filter(s => s.lab_id === lab.lab_id);
    const labMachines = visibleMachines.filter(m => m.lab_id === lab.lab_id && m.status === "active").length;
    const util = labMachines > 0 ? Math.min(100, Math.round((labSessions.length / (labMachines * 8)) * 100)) : 0;
    const compliance = getComplianceStats(lab.lab_id, today);
    return { ...lab, util, sessionCount: labSessions.length, machineCount: labMachines, compliance };
  }), [visibleLabs, todaySessions, visibleMachines, today]);

  if (loading) {
    return (
      <PageWrapper>
        <div className="flex items-center justify-center h-[calc(100vh-120px)]">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-slate-200 border-t-primary-600 rounded-full animate-spin"></div>
            <span className="text-sm text-slate-400">Loading lab utilization stats…</span>
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
          <h1 className="page-title">Overview {isAdmin ? "" : `— ${user.department}`}</h1>
          <p className="page-subtitle">{isAdmin ? "All labs" : `${user.department} department`} · {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Sessions Today"   value={todaySessions.length}                  icon={Activity}    color="blue"   trend={12} />
        <StatCard label="Machines Online"  value={`${onlineNow}/${activeMachines}`}      icon={Cpu}         color="green"  trend={3}  />
        <StatCard label="Compliance Rate"  value={`${complianceAll}%`}                   icon={CheckCircle2} color="purple" trend={-2} />
        <StatCard label="Active Students"  value={new Set(todaySessions.map(s=>s.student_id)).size} icon={Users} color="amber" trend={8} />
      </div>

      {/* Hourly bar chart */}
      <div className="card card-body mb-6">
        <SectionHeading title="Hourly Sessions — All Labs" />
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={hourlyData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
            <XAxis dataKey="hour" tick={{ fontSize: 11, fill: "#78716c" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#78716c" }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ border: "1px solid #e7e5e4", borderRadius: 10, fontSize: 12 }} cursor={{ fill: "#f5f5f4" }} />
            <Bar dataKey="sessions" fill="#0d9488" radius={[4, 4, 0, 0]} name="Sessions" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Top Browsed Websites */}
      <div className="card card-body mb-6">
        <SectionHeading title={`Top Browsed Websites — ${today}`} />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {topSitesData.length === 0
            ? <p className="text-sm text-slate-400 col-span-full py-4 text-center">No browser activity recorded for today.</p>
            : topSitesData.slice(0, 8).map((site, i) => {
              const maxDur = topSitesData[0].active_duration || 1;
              return (
                <div key={site.domain} className="flex items-center gap-3 p-2.5 rounded-lg bg-slate-50/50">
                  <span className="text-xs font-medium text-slate-400 w-4 text-center">{i + 1}</span>
                  <Globe className="w-4 h-4 text-slate-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-700 truncate">{site.domain}</p>
                    <div className="w-full h-1 bg-slate-200 rounded-full overflow-hidden mt-1">
                      <div className="h-full bg-primary-500 rounded-full" style={{ width: `${(site.active_duration / maxDur) * 100}%` }} />
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-mono text-slate-600">{formatDuration(site.active_duration)}</p>
                  </div>
                </div>
              );
            })
          }
        </div>
      </div>

      {/* Labs + Recent sessions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Lab cards */}
        <div>
          <SectionHeading title="Labs — Today's Utilization"
            action={<Link to="/labs" className="text-xs text-primary-600 hover:underline font-medium">View all →</Link>}
          />
          <div className="space-y-3">
            {labStats.map(lab => (
              <Link key={lab.lab_id} to={`/labs/${lab.lab_id}`}
                className="card card-body flex items-center gap-4 hover:bg-slate-50/50 transition-all group">
                <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center shrink-0">
                  <FlaskConical size={16} className="text-slate-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-medium text-sm text-slate-800 group-hover:text-primary-600 transition-colors">{lab.name}</p>
                    <span className="text-xs font-semibold text-slate-600">{lab.util}%</span>
                  </div>
                  <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${lab.util >= 70 ? "bg-primary-600" : lab.util >= 40 ? "bg-amber-400" : "bg-slate-300"}`}
                      style={{ width: `${lab.util}%` }} />
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-400">
                    <span>{lab.sessionCount} sessions</span>
                    <span>·</span>
                    <span>{lab.machineCount} machines</span>
                    <span>·</span>
                    <span className="text-emerald-600">{lab.compliance.compliant} compliant</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Recent sessions */}
        <div>
          <SectionHeading title="Recent Sessions" />
          <div className="card overflow-hidden">
            <div className="divide-y divide-slate-100/60">
              {recentSessions.length === 0 ? (
                <p className="text-center text-slate-400 py-10 text-sm">No sessions yet today</p>
              ) : recentSessions.map(s => (
                <div key={s.session_id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50/50 transition-colors">
                  <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-semibold text-[11px] shrink-0">
                    {s.student_name?.split(" ").map(n => n[0]).join("").slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Link to={`/students/${s.student_id}`} className="text-sm font-medium text-slate-800 hover:text-primary-600 transition-colors truncate">{s.student_name}</Link>
                      <ComplianceBadge status={s.compliance_status} />
                    </div>
                    <p className="text-xs text-slate-400 truncate">{s.machine_id} · {s.course_code}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-mono text-slate-600">{formatDuration(s.total_duration)}</p>
                    <p className="text-xs text-slate-400">{new Date(s.login_time).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </PageWrapper>
  );
}
