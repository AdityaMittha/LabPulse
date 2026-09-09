import { useMemo, useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { Monitor, Users, CheckCircle2, Activity, Globe, Edit2, Trash2 } from "lucide-react";
import { todayStr, formatDuration, COLLEGE_PERIODS } from "../data/mockData";
import {
  StatCard, ComplianceBadge, SectionHeading, EmptyState, PageWrapper
} from "../components/Shared";
import { fetchUsage, fetchMachines, fetchTopSites, fetchLabs, updateLab, deleteLab, fetchDepartments } from "../api/apiClient";
import { useAuth } from "../auth/AuthContext";
import ConfirmModal from "../components/ConfirmModal";

// Heatmap: period × day
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

export default function LabDetailPage({ globalDate }) {
  const { labId } = useParams();
  const { user, isAdmin } = useAuth();
  const today = globalDate || todayStr();

  const navigate = useNavigate();
  const [labInfo,        setLabInfo]        = useState(null);
  const [machinesData,   setMachinesData]   = useState([]);
  const [sessionsData,   setSessionsData]   = useState([]);
  const [allLabSessions, setAllLabSessions] = useState([]);
  const [topSitesData,   setTopSitesData]   = useState([]);
  const [departments,    setDepartments]    = useState([]);
  const [selectedDate,   setSelectedDate]   = useState(today);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState(null);

  // Edit & Delete state
  const [showEdit,       setShowEdit]       = useState(false);
  const [editForm,       setEditForm]       = useState({ name: "", department: "", building: "", floor: "", total_machines: 0 });
  const [editSaving,     setEditSaving]     = useState(false);
  const [editError,      setEditError]      = useState(null);
  const [deleteModal,    setDeleteModal]    = useState({ open: false, loading: false, error: null });

  useEffect(() => {
    if (globalDate) setSelectedDate(globalDate);
  }, [globalDate]);

  // Fetch lab info once
  useEffect(() => {
    fetchLabs().then(labs => {
      setLabInfo(labs.find(l => l.lab_id === labId) || null);
    }).catch(() => setLabInfo(null));
    fetchDepartments().then(setDepartments).catch(() => {});
  }, [labId]);

  useEffect(() => {
    if (labInfo) {
      setEditForm({
        name: labInfo.name || "",
        department: labInfo.department || "",
        building: labInfo.building || "",
        floor: labInfo.floor || "",
        total_machines: labInfo.total_machines || 0,
      });
    }
  }, [labInfo]);

  async function handleSaveEdit(e) {
    e.preventDefault();
    setEditSaving(true);
    setEditError(null);
    try {
      const updated = await updateLab(labId, {
        name: editForm.name,
        department: editForm.department,
        building: editForm.building,
        floor: editForm.floor,
        total_machines: Number(editForm.total_machines),
      });
      setLabInfo(updated);
      setShowEdit(false);
    } catch (err) {
      setEditError(err.message || "Failed to update lab");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleConfirmDelete() {
    setDeleteModal(prev => ({ ...prev, loading: true, error: null }));
    try {
      await deleteLab(labId);
      setDeleteModal({ open: false, loading: false, error: null });
      navigate("/admin/labs");
    } catch (err) {
      setDeleteModal(prev => ({ ...prev, loading: false, error: err.message || "Failed to delete lab" }));
    }
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    Promise.all([
      fetchMachines(labId),
      fetchUsage({ lab_id: labId, date: selectedDate }),
      fetchUsage({ lab_id: labId }),        // for heatmap (all dates)
      fetchTopSites(labId, selectedDate),
    ]).then(([machs, sess, allSess, sites]) => {
      if (active) {
        setMachinesData(machs    || []);
        setSessionsData(sess     || []);
        setAllLabSessions(allSess || []);
        setTopSitesData(sites    || []);
        setLoading(false);
      }
    }).catch(err => {
      console.error("LabDetailPage fetch error:", err);
      if (active) { setError(err.message); setLoading(false); }
    });

    return () => { active = false; };
  }, [labId, selectedDate]);

  const isAuthorized = useMemo(() => {
    if (isAdmin) return true;
    if (!labInfo) return false;
    return labInfo.department?.includes(user.department) || user.department?.includes(labInfo.department);
  }, [labInfo, isAdmin, user]);

  const daySessions = sessionsData;

  const hourlyData = useMemo(() => {
    return COLLEGE_PERIODS.map(period => {
      const startMins = period.startH * 60 + period.startM;
      const endMins   = period.endH * 60 + period.endM;
      const count = daySessions.filter(s => {
        if (!s.login_time) return false;
        const d = new Date(s.login_time);
        const mins = d.getHours() * 60 + d.getMinutes();
        return mins >= startMins && mins < endMins;
      }).length;
      return { hour: period.label, periodName: period.name, range: period.range, sessions: count };
    });
  }, [daySessions]);

  const complianceSt = useMemo(() => {
    const total         = daySessions.length;
    const compliant     = daySessions.filter(s => s.compliance_status === "compliant").length;
    const partial       = daySessions.filter(s => s.compliance_status === "partial").length;
    const non_compliant = daySessions.filter(s => s.compliance_status === "non_compliant").length;
    return { total, compliant, partial, non_compliant };
  }, [daySessions]);

  // Heatmap: sessions[day][periodId]
  const heatmapData = useMemo(() => {
    const map = {};
    DAYS.forEach(d => {
      map[d] = {};
      COLLEGE_PERIODS.forEach(p => { map[d][p.id] = 0; });
    });
    allLabSessions.forEach(s => {
      if (!s.login_time) return;
      const dt = new Date(s.login_time);
      const day = DAYS[dt.getDay() - 1];
      const mins = dt.getHours() * 60 + dt.getMinutes();
      const period = COLLEGE_PERIODS.find(p => mins >= (p.startH * 60 + p.startM) && mins < (p.endH * 60 + p.endM));
      if (day && period && map[day] && map[day][period.id] !== undefined) {
        map[day][period.id]++;
      }
    });
    return map;
  }, [allLabSessions]);

  const maxHeatVal = useMemo(() => {
    let m = 0;
    DAYS.forEach(d => COLLEGE_PERIODS.forEach(p => {
      if ((heatmapData[d]?.[p.id] || 0) > m) m = heatmapData[d][p.id];
    }));
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

  if (error) {
    return (
      <PageWrapper>
        <div className="flex items-center justify-center h-[calc(100vh-120px)]">
          <div className="text-center">
            <p className="text-red-500 font-medium text-sm">Failed to load lab data</p>
            <p className="text-slate-400 text-xs mt-1">{error}</p>
          </div>
        </div>
      </PageWrapper>
    );
  }

  if (!labInfo) {
    return <PageWrapper><EmptyState title="Lab not found" description="This lab doesn't exist or hasn't loaded yet." /></PageWrapper>;
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
          <h1 className="page-title">{labInfo.name}</h1>
          <p className="page-subtitle">{labInfo.building} · {labInfo.floor} Floor · {labInfo.department}</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button
              onClick={() => setShowEdit(true)}
              className="btn btn-secondary flex items-center gap-1.5 text-xs py-1.5"
            >
              <Edit2 className="w-3.5 h-3.5" />
              Edit Lab
            </button>
          )}
          <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
            className="form-input text-xs py-1.5 w-36" max={today} />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Sessions"   value={daySessions.length}    icon={Activity}    color="blue"  />
        <StatCard label="Compliance" value={`${compliancePct}%`}   icon={CheckCircle2} color="green" />
        <StatCard label="Machines"   value={`${machinesData.filter(m=>m.status==="active").length}/${machinesData.length}`} icon={Monitor} color="purple"/>
        <StatCard label="Compliant"  value={complianceSt.compliant} icon={Users}       color="amber" />
      </div>

      {/* Machine grid */}
      <div className="card card-body mb-6">
        <SectionHeading title="Machine Grid" />
        <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-2">
          {machinesData.map(m => {
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
        {machinesData.length === 0 && <p className="text-slate-400 text-sm text-center py-4">No machines registered for this lab.</p>}
        <div className="flex items-center gap-4 mt-4 text-xs text-slate-400">
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-slate-100" /> Idle</div>
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-primary-50" /> Low</div>
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-primary-600" /> Active</div>
        </div>
      </div>

      {/* Period-wise bar + heatmap */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="card card-body">
          <SectionHeading title="Sessions by Period" />
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={hourlyData} margin={{ top: 4, right: 8, bottom: 0, left: -24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
              <XAxis dataKey="hour" tick={{ fontSize: 11, fill:"#78716c" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill:"#78716c" }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ border:"1px solid #e7e5e4", borderRadius: 10, fontSize: 12 }}
                cursor={{ fill:"#f5f5f4" }}
                labelFormatter={(label, payload) => {
                  const item = payload?.[0]?.payload;
                  return item?.range ? `${item.periodName} (${item.range})` : label;
                }}
              />
              <Bar dataKey="sessions" fill="#0d9488" radius={[4,4,0,0]} name="Sessions" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Heatmap */}
        <div className="card card-body">
          <SectionHeading title="Period × Day Heatmap" />
          <div className="overflow-x-auto">
            <div className="inline-flex gap-2">
              {/* Y-axis labels */}
              <div className="flex flex-col gap-1 pt-6">
                {COLLEGE_PERIODS.map(p => (
                  <div key={p.id} className="text-xs text-slate-400 text-right pr-1 flex items-center justify-end font-mono" style={{ height: 36 }} title={p.range}>
                    {p.label}
                  </div>
                ))}
              </div>
              <div className="flex gap-1">
                {DAYS.map(day => (
                  <div key={day} className="flex flex-col gap-1 items-center">
                    <div className="text-xs text-slate-500 font-medium mb-1">{day}</div>
                    {COLLEGE_PERIODS.map(p => (
                      <HeatmapCell key={p.id} value={heatmapData[day]?.[p.id] || 0} max={maxHeatVal} />
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
      {/* Danger Zone */}
      {isAdmin && (
        <div className="card p-6 border-red-200 bg-red-50/30 mt-8 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-red-700">Danger Zone</h3>
              <p className="text-xs text-red-600/80 mt-0.5">
                Permanently delete this lab and all associated timetable slots.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDeleteModal({ open: true, loading: false, error: null })}
              className="btn bg-red-600 hover:bg-red-700 text-white flex items-center gap-1.5 text-xs px-4 py-2 self-start sm:self-auto shadow-sm"
            >
              <Trash2 className="w-4 h-4" />
              Delete Lab
            </button>
          </div>
        </div>
      )}

      {/* Confirm Delete Modal */}
      <ConfirmModal
        isOpen={deleteModal.open}
        title="Delete Lab"
        message={`Are you sure you want to delete lab "${labInfo.name}" (${labId})? This action will remove the lab and its timetable schedule slots permanently.`}
        confirmText="Yes, Delete Lab"
        danger
        isLoading={deleteModal.loading}
        error={deleteModal.error}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteModal({ open: false, loading: false, error: null })}
      />

      {/* Edit Lab Modal */}
      {showEdit && (
        <div className="modal-overlay">
          <div className="modal-box">
            <h3 className="font-semibold text-slate-800 text-base mb-4">Edit Lab — {labId}</h3>
            {editError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs">
                {editError}
              </div>
            )}
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="form-label">Lab Name</label>
                <input
                  type="text"
                  required
                  value={editForm.name}
                  onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                  className="form-input"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Department</label>
                  <select
                    value={editForm.department}
                    onChange={e => setEditForm(f => ({ ...f, department: e.target.value }))}
                    className="form-select"
                  >
                    {departments.map(d => (
                      <option key={d.dept_id} value={d.name}>{d.name}</option>
                    ))}
                    {!departments.some(d => d.name === editForm.department) && (
                      <option value={editForm.department}>{editForm.department}</option>
                    )}
                  </select>
                </div>
                <div>
                  <label className="form-label">Total Machines</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={editForm.total_machines}
                    onChange={e => setEditForm(f => ({ ...f, total_machines: e.target.value }))}
                    className="form-input"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Building</label>
                  <input
                    type="text"
                    required
                    value={editForm.building}
                    onChange={e => setEditForm(f => ({ ...f, building: e.target.value }))}
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="form-label">Floor</label>
                  <input
                    type="text"
                    required
                    value={editForm.floor}
                    onChange={e => setEditForm(f => ({ ...f, floor: e.target.value }))}
                    className="form-input"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEdit(false)}
                  className="btn btn-secondary"
                  disabled={editSaving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSaving}
                  className="btn btn-primary"
                >
                  {editSaving ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageWrapper>
  );
}
