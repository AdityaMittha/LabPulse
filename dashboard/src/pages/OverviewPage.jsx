import { useMemo, useState, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Monitor, Users, Activity, CheckCircle2, FlaskConical, Clock, Cpu, Globe
} from "lucide-react";
import { todayStr, formatDuration, COLLEGE_PERIODS, formatTimeIST, getISTMinutes, formatIstDate } from "../data/collegeConfig";
import {
  StatCard, ComplianceBadge, SectionHeading, PageWrapper, getMachineStatus
} from "../components/Shared";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { fetchUsage, fetchMachines, fetchTopSites, fetchLabs } from "../api/apiClient";

export default function OverviewPage({ globalDate }) {
  const { user, isAdmin } = useAuth();
  const today = globalDate || todayStr();

  const [labsData,     setLabsData]     = useState([]);
  const [sessionsData, setSessionsData] = useState([]);
  const [machinesData, setMachinesData] = useState([]);
  const [topSitesData, setTopSitesData] = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);

  const [lastUpdated,  setLastUpdated]  = useState(new Date());

  const loadData = (silent = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    return Promise.all([
      fetchLabs(),
      fetchUsage({ date: today }),
      fetchMachines(),
      fetchTopSites("", today),
    ]).then(([labs, sess, machs, sites]) => {
      setLabsData(labs  || []);
      setSessionsData(sess  || []);
      setMachinesData(machs || []);
      setTopSitesData(sites || []);
      setLastUpdated(new Date());
      if (!silent) setLoading(false);
    }).catch(err => {
      console.error("OverviewPage fetch error:", err);
      if (!silent) {
        setError(err.message);
        setLoading(false);
      }
    });
  };

  useEffect(() => {
    loadData(false);
    // Poll every 15 seconds for real-time overview updates
    const interval = setInterval(() => {
      loadData(true);
    }, 15000);
    return () => clearInterval(interval);
  }, [today]);

  // Filter labs by department if not admin
  const visibleLabs = useMemo(() => {
    if (isAdmin) return labsData;
    return labsData.filter(l =>
      l.department?.includes(user.department) || user.department?.includes(l.department)
    );
  }, [isAdmin, user, labsData]);

  const visibleLabIds = useMemo(() => visibleLabs.map(l => l.lab_id), [visibleLabs]);

  // Filter sessions and machines by visible labs
  const todaySessions = useMemo(
    () => sessionsData.filter(s => visibleLabIds.includes(s.lab_id)),
    [sessionsData, visibleLabIds]
  );

  const visibleMachines = useMemo(
    () => machinesData.filter(m => visibleLabIds.includes(m.lab_id)),
    [machinesData, visibleLabIds]
  );

  const activeMachines = visibleMachines.filter(m => m.status === "active").length;
  const onlineNow = useMemo(() => {
    return visibleMachines.filter(m => getMachineStatus(m, todaySessions) === "online").length;
  }, [visibleMachines, todaySessions]);

  const complianceAll = useMemo(() => {
    const scheduled = todaySessions.filter(s => s.compliance_status && !["open_access", "no_slot", "pending"].includes(s.compliance_status));
    const c = scheduled.filter(s => s.compliance_status === "compliant").length;
    return scheduled.length > 0 ? Math.round((c / scheduled.length) * 100) : (todaySessions.length > 0 ? 100 : 0);
  }, [todaySessions]);

  const filteredTopSites = useMemo(() => {
    const IGNORED = new Set([
      "new-tab", "browser-tab", "newtab", "about:blank", "about", "chrome",
      "edge", "extensions", "settings", "localhost", "127.0.0.1"
    ]);
    return (topSitesData || []).filter(s => {
      const d = (s.domain || "").trim().toLowerCase();
      return d && !IGNORED.has(d) && !d.startsWith("chrome-") && !d.startsWith("edge-");
    });
  }, [topSitesData]);

  // Period-wise utilization across all visible labs in Indian Standard Time (IST)
  const hourlyData = useMemo(() => {
    return COLLEGE_PERIODS.map(period => {
      const startMins = period.startH * 60 + period.startM;
      const endMins   = period.endH * 60 + period.endM;
      const count = todaySessions.filter(s => {
        if (!s.login_time) return false;
        const mins = getISTMinutes(s.login_time);
        if (mins === null) return false;
        return mins >= startMins && mins < endMins;
      }).length;
      return { hour: period.label, periodName: period.name, range: period.range, sessions: count };
    });
  }, [todaySessions]);

  // Recent sessions
  const recentSessions = useMemo(() =>
    [...todaySessions].sort((a, b) => new Date(b.login_time) - new Date(a.login_time)).slice(0, 8),
    [todaySessions]
  );

  // Lab utilization cards derived from fetched data
  const labStats = useMemo(() => visibleLabs.map(lab => {
    const labSessions = todaySessions.filter(s => s.lab_id === lab.lab_id);
    const labMachines = visibleMachines.filter(m => m.lab_id === lab.lab_id && m.status === "active").length;
    const util = labMachines > 0 ? Math.min(100, Math.round((labSessions.length / (labMachines * 8)) * 100)) : 0;
    const compliant     = labSessions.filter(s => s.compliance_status === "compliant").length;
    const partial       = labSessions.filter(s => s.compliance_status === "partial").length;
    const non_compliant = labSessions.filter(s => s.compliance_status === "non_compliant").length;
    return {
      ...lab,
      util,
      sessionCount: labSessions.length,
      machineCount: labMachines,
      compliance: { compliant, partial, non_compliant, total: labSessions.length },
    };
  }), [visibleLabs, todaySessions, visibleMachines]);

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

  if (error) {
    return (
      <PageWrapper>
        <div className="flex items-center justify-center h-[calc(100vh-120px)]">
          <div className="text-center">
            <p className="text-red-500 font-medium text-sm">Failed to load data</p>
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
          <h1 className="page-title">Overview {isAdmin ? "" : `— ${user.department}`}</h1>
          <p className="page-subtitle">{isAdmin ? "All labs" : `${user.department} department`} · {formatIstDate(today)}</p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Sessions Today"   value={todaySessions.length}                              icon={Activity}    color="blue"   />
        <StatCard label="Machines Online"  value={`${onlineNow}/${activeMachines}`}                  icon={Cpu}         color="green"  />
        <StatCard label="Compliance Rate"  value={`${complianceAll}%`}                               icon={CheckCircle2} color="purple" />
        <StatCard label="Active Students"  value={new Set(todaySessions.map(s => s.student_id)).size} icon={Users}       color="amber"  />
      </div>

      {/* Hourly / Period-wise bar chart */}
      <div className="card card-body mb-6">
        <SectionHeading title="Sessions by Period — All Labs" />
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={hourlyData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
            <XAxis dataKey="hour" tick={{ fontSize: 11, fill: "#78716c" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#78716c" }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ border: "1px solid #e7e5e4", borderRadius: 10, fontSize: 12 }}
              cursor={{ fill: "#f5f5f4" }}
              labelFormatter={(label, payload) => {
                const item = payload?.[0]?.payload;
                return item?.range ? `${item.periodName} (${item.range})` : label;
              }}
            />
            <Bar dataKey="sessions" fill="#0d9488" radius={[4, 4, 0, 0]} name="Sessions" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Top Browsed Websites */}
      <div className="card card-body mb-6">
        <SectionHeading title={`Top Browsed Websites — ${today}`} />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {filteredTopSites.length === 0
            ? <p className="text-sm text-slate-400 col-span-full py-4 text-center">No browser activity recorded for today.</p>
            : filteredTopSites.slice(0, 8).map((site, i) => {
              const maxDur = filteredTopSites[0].active_duration || 1;
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
            {labStats.length === 0
              ? <p className="text-sm text-slate-400 py-6 text-center">No labs found.</p>
              : labStats.map(lab => (
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
                    {!s.logout_time ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Live
                      </span>
                    ) : (
                      <p className="text-xs font-mono text-slate-600">{formatDuration(s.total_duration)}</p>
                    )}
                    <p className="text-xs text-slate-400 mt-0.5">{formatTimeIST(s.login_time)}</p>
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
