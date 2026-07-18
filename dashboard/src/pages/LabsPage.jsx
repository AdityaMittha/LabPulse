import { useMemo, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { FlaskConical, Cpu, Users, TrendingUp } from "lucide-react";
import { labs, getComplianceStats, todayStr } from "../data/mockData";
import { StatCard, UtilBar, PageWrapper, SectionHeading } from "../components/Shared";
import { fetchUsage, fetchMachines } from "../api/apiClient";

export default function LabsPage({ globalDate }) {
  const today = globalDate || todayStr();
  const [sessionsData, setSessionsData] = useState([]);
  const [machinesData, setMachinesData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);

    Promise.all([
      fetchUsage({ date: today }),
      fetchMachines()
    ]).then(([sess, machs]) => {
      if (active) {
        setSessionsData(sess || []);
        setMachinesData(machs || []);
        setLoading(false);
      }
    }).catch(err => {
      console.error(err);
      if (active) setLoading(false);
    });

    return () => { active = false; };
  }, [today]);

  const labStats = useMemo(() => labs.map(lab => {
    const labSessions = sessionsData.filter(s => s.lab_id === lab.lab_id);
    const labMachines = machinesData.filter(m => m.lab_id === lab.lab_id);
    const activeMachines = labMachines.filter(m => m.status === "active").length;
    const util = activeMachines > 0
      ? Math.min(100, Math.round((labSessions.length / (activeMachines * 8)) * 100))
      : 0;
    const comp = getComplianceStats(lab.lab_id, today);
    const compliancePct = comp.total > 0 ? Math.round((comp.compliant / comp.total) * 100) : 0;
    return {
      ...lab,
      util,
      sessionCount: labSessions.length,
      activeMachines,
      totalMachines: labMachines.length,
      compliancePct,
      comp,
    };
  }), [sessionsData, machinesData, today]);

  if (loading) {
    return (
      <PageWrapper>
        <div className="flex items-center justify-center h-[calc(100vh-120px)]">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin"></div>
            <span className="text-sm font-medium text-slate-500">Loading WIT Solapur labs list...</span>
          </div>
        </div>
      </PageWrapper>
    );
  }

  const totalSessions    = labStats.reduce((a, l) => a + l.sessionCount, 0);
  const totalActiveMach  = labStats.reduce((a, l) => a + l.activeMachines, 0);
  const avgUtil          = labStats.length > 0 ? Math.round(labStats.reduce((a,l)=>a+l.util,0)/labStats.length) : 0;

  return (
    <PageWrapper>
      <div className="page-header">
        <div>
          <h1 className="page-title">Labs</h1>
          <p className="page-subtitle">All computer labs · {new Date().toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"short"})}</p>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <StatCard label="Total Sessions Today" value={totalSessions}    icon={Users}      color="blue"  />
        <StatCard label="Active Machines"       value={totalActiveMach} icon={Cpu}        color="green" />
        <StatCard label="Avg Utilization"       value={`${avgUtil}%`}   icon={TrendingUp} color="purple"/>
      </div>

      {/* Lab grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {labStats.map(lab => (
          <Link key={lab.lab_id} to={`/labs/${lab.lab_id}`}
            className="card hover:shadow-lg hover:border-primary-200 transition-all group block">
            {/* Card header */}
            <div className="p-5 border-b border-slate-100">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-primary-50 rounded-lg flex items-center justify-center shrink-0 group-hover:bg-primary-100 transition-colors">
                  <FlaskConical size={20} className="text-primary-600" />
                </div>
                <div className="flex-1">
                  <h2 className="font-semibold text-slate-900 group-hover:text-primary-600 transition-colors">{lab.name}</h2>
                  <p className="text-xs text-slate-500">{lab.building} · {lab.floor} Floor · {lab.department}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-slate-900">{lab.util}%</p>
                  <p className="text-xs text-slate-500">utilization</p>
                </div>
              </div>
              <div className="mt-4">
                <UtilBar pct={lab.util} showLabel={false} />
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 divide-x divide-slate-100 p-4">
              <div className="text-center px-2">
                <p className="text-lg font-semibold text-slate-900">{lab.sessionCount}</p>
                <p className="text-xs text-slate-500">Sessions</p>
              </div>
              <div className="text-center px-2">
                <p className="text-lg font-semibold text-slate-900">{lab.activeMachines}<span className="text-sm text-slate-400">/{lab.totalMachines}</span></p>
                <p className="text-xs text-slate-500">Machines</p>
              </div>
              <div className="text-center px-2">
                <p className="text-lg font-semibold text-green-600">{lab.compliancePct}%</p>
                <p className="text-xs text-slate-500">Compliance</p>
              </div>
            </div>

            {/* Compliance bar */}
            <div className="px-5 pb-4 flex gap-1.5">
              {lab.comp.compliant > 0 && (
                <div className="h-1.5 rounded-full bg-green-500 transition-all"
                  style={{ flex: lab.comp.compliant }} title="Compliant" />
              )}
              {lab.comp.partial > 0 && (
                <div className="h-1.5 rounded-full bg-amber-400 transition-all"
                  style={{ flex: lab.comp.partial }} title="Partial" />
              )}
              {lab.comp.absent > 0 && (
                <div className="h-1.5 rounded-full bg-red-400 transition-all"
                  style={{ flex: lab.comp.absent }} title="Absent" />
              )}
            </div>
          </Link>
        ))}
      </div>
    </PageWrapper>
  );
}
