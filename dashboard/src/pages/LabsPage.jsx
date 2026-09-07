import { useMemo, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { FlaskConical, Cpu, Users, TrendingUp, Plus } from "lucide-react";
import { todayStr } from "../data/mockData";
import { StatCard, UtilBar, PageWrapper, SectionHeading } from "../components/Shared";
import { fetchUsage, fetchMachines, fetchLabs } from "../api/apiClient";
import { useAuth } from "../auth/AuthContext";

export default function LabsPage({ globalDate }) {
  const { user, isAdmin } = useAuth();
  const today = globalDate || todayStr();

  const [labsData,     setLabsData]     = useState([]);
  const [sessionsData, setSessionsData] = useState([]);
  const [machinesData, setMachinesData] = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    Promise.all([
      fetchLabs(),
      fetchUsage({ date: today }),
      fetchMachines(),
    ]).then(([labs, sess, machs]) => {
      if (active) {
        setLabsData(labs  || []);
        setSessionsData(sess  || []);
        setMachinesData(machs || []);
        setLoading(false);
      }
    }).catch(err => {
      console.error("LabsPage fetch error:", err);
      if (active) { setError(err.message); setLoading(false); }
    });

    return () => { active = false; };
  }, [today]);

  const visibleLabs = useMemo(() => {
    if (isAdmin) return labsData;
    return labsData.filter(l =>
      l.department?.includes(user.department) || user.department?.includes(l.department)
    );
  }, [isAdmin, user, labsData]);

  const labStats = useMemo(() => visibleLabs.map(lab => {
    const labSessions    = sessionsData.filter(s => s.lab_id === lab.lab_id);
    const labMachines    = machinesData.filter(m => m.lab_id === lab.lab_id);
    const activeMachines = labMachines.filter(m => m.status === "active").length;
    const util = activeMachines > 0
      ? Math.min(100, Math.round((labSessions.length / (activeMachines * 8)) * 100))
      : 0;
    const compliant     = labSessions.filter(s => s.compliance_status === "compliant").length;
    const partial       = labSessions.filter(s => s.compliance_status === "partial").length;
    const non_compliant = labSessions.filter(s => s.compliance_status === "non_compliant").length;
    const compliancePct = labSessions.length > 0 ? Math.round((compliant / labSessions.length) * 100) : 0;
    return {
      ...lab,
      util,
      sessionCount: labSessions.length,
      activeMachines,
      totalMachines: labMachines.length,
      compliancePct,
      comp: { compliant, partial, absent: non_compliant },
    };
  }), [visibleLabs, sessionsData, machinesData]);

  if (loading) {
    return (
      <PageWrapper>
        <div className="flex items-center justify-center h-[calc(100vh-120px)]">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-slate-200 border-t-primary-600 rounded-full animate-spin"></div>
            <span className="text-sm text-slate-400">Loading labs…</span>
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
            <p className="text-red-500 font-medium text-sm">Failed to load labs</p>
            <p className="text-slate-400 text-xs mt-1">{error}</p>
          </div>
        </div>
      </PageWrapper>
    );
  }

  const totalSessions   = labStats.reduce((a, l) => a + l.sessionCount, 0);
  const totalActiveMach = labStats.reduce((a, l) => a + l.activeMachines, 0);
  const avgUtil         = labStats.length > 0 ? Math.round(labStats.reduce((a, l) => a + l.util, 0) / labStats.length) : 0;

  return (
    <PageWrapper>
      <div className="page-header">
        <div>
          <h1 className="page-title">Labs {isAdmin ? "" : `— ${user?.department || ""}`}</h1>
          <p className="page-subtitle">{isAdmin ? "All computer labs" : `${user?.department || ""} computer labs`} · {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" })}</p>
        </div>
        {isAdmin && (
          <Link to="/admin/labs" className="btn-primary btn-sm inline-flex items-center gap-1.5">
            <Plus size={14} /> Add Lab
          </Link>
        )}
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <StatCard label="Total Sessions Today" value={totalSessions}    icon={Users}      color="blue"  />
        <StatCard label="Active Machines"       value={totalActiveMach} icon={Cpu}        color="green" />
        <StatCard label="Avg Utilization"       value={`${avgUtil}%`}   icon={TrendingUp} color="purple"/>
      </div>

      {/* Lab grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {labStats.length === 0 ? (
          <div className="card card-body text-center py-16 col-span-full">
            <FlaskConical size={32} className="mx-auto text-slate-300 mb-2" />
            <h3 className="text-base font-semibold text-slate-700">No labs registered yet</h3>
            <p className="text-slate-400 text-xs mt-1 max-w-sm mx-auto">
              There are no computer labs in the database. Use the Admin Labs page to configure your college labs.
            </p>
            {isAdmin && (
              <div className="mt-4">
                <Link to="/admin/labs" className="btn-primary btn-sm inline-flex items-center gap-1.5">
                  <Plus size={14} /> Add Lab
                </Link>
              </div>
            )}
          </div>
        ) : labStats.map(lab => (
            <Link key={lab.lab_id} to={`/labs/${lab.lab_id}`}
              className="card hover:bg-slate-50/50 transition-all group block">
              {/* Card header */}
              <div className="p-5 border-b border-slate-100/60">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center shrink-0">
                    <FlaskConical size={18} className="text-slate-500" />
                  </div>
                  <div className="flex-1">
                    <h2 className="font-semibold text-slate-800 group-hover:text-primary-600 transition-colors">{lab.name}</h2>
                    <p className="text-xs text-slate-400">{lab.building} · {lab.floor} Floor · {lab.department}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-semibold text-slate-800">{lab.util}%</p>
                    <p className="text-xs text-slate-400">utilization</p>
                  </div>
                </div>
                <div className="mt-4">
                  <UtilBar pct={lab.util} showLabel={false} />
                </div>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-3 divide-x divide-slate-100/60 p-4">
                <div className="text-center px-2">
                  <p className="text-lg font-semibold text-slate-800">{lab.sessionCount}</p>
                  <p className="text-xs text-slate-400">Sessions</p>
                </div>
                <div className="text-center px-2">
                  <p className="text-lg font-semibold text-slate-800">{lab.activeMachines}<span className="text-sm text-slate-400">/{lab.totalMachines}</span></p>
                  <p className="text-xs text-slate-400">Machines</p>
                </div>
                <div className="text-center px-2">
                  <p className="text-lg font-semibold text-emerald-600">{lab.compliancePct}%</p>
                  <p className="text-xs text-slate-400">Compliance</p>
                </div>
              </div>

              {/* Compliance bar */}
              <div className="px-5 pb-4 flex gap-1.5">
                {lab.comp.compliant > 0 && (
                  <div className="h-1 rounded-full bg-emerald-500 transition-all"
                    style={{ flex: lab.comp.compliant }} title="Compliant" />
                )}
                {lab.comp.partial > 0 && (
                  <div className="h-1 rounded-full bg-amber-400 transition-all"
                    style={{ flex: lab.comp.partial }} title="Partial" />
                )}
                {lab.comp.absent > 0 && (
                  <div className="h-1 rounded-full bg-red-400 transition-all"
                    style={{ flex: lab.comp.absent }} title="Non-compliant" />
                )}
              </div>
            </Link>
          ))}
      </div>
    </PageWrapper>
  );
}
