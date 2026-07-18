// Shared reusable components for LabPulse dashboard
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

// ── Stat Card ────────────────────────────────────────────────────────────────
export function StatCard({ label, value, sub, trend, icon: Icon, color = "blue" }) {
  const colors = {
    blue:    "bg-primary-50 text-primary-600",
    green:   "bg-green-50 text-green-600",
    amber:   "bg-amber-50 text-amber-600",
    red:     "bg-red-50 text-red-600",
    purple:  "bg-purple-50 text-purple-600",
    slate:   "bg-slate-100 text-slate-600",
  };
  return (
    <div className="stat-card">
      <div className="flex items-start justify-between">
        <div>
          <p className="stat-label">{label}</p>
          <p className="stat-value mt-1">{value}</p>
          {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
        </div>
        {Icon && (
          <div className={`p-2.5 rounded-lg ${colors[color]}`}>
            <Icon size={20} />
          </div>
        )}
      </div>
      {trend !== undefined && (
        <div className={`flex items-center gap-1 text-xs font-medium mt-2 ${
          trend > 0 ? "text-green-600" : trend < 0 ? "text-red-500" : "text-slate-500"
        }`}>
          {trend > 0 ? <TrendingUp size={12} /> : trend < 0 ? <TrendingDown size={12} /> : <Minus size={12} />}
          <span>{trend > 0 ? "+" : ""}{trend}% vs yesterday</span>
        </div>
      )}
    </div>
  );
}

// ── Compliance Badge ──────────────────────────────────────────────────────────
export function ComplianceBadge({ status }) {
  const map = {
    compliant:     { cls: "badge-success", label: "✓ Compliant" },
    partial:       { cls: "badge-warning", label: "~ Partial" },
    non_compliant: { cls: "badge-danger",  label: "✗ Absent" },
    no_slot:       { cls: "badge-gray",    label: "No Slot" },
  };
  const m = map[status] || map.no_slot;
  return <span className={m.cls}>{m.label}</span>;
}

// ── Machine Status Badge ──────────────────────────────────────────────────────
export function MachineStatusBadge({ status }) {
  const map = {
    active:   { cls: "badge-success", label: "● Online" },
    inactive: { cls: "badge-danger",  label: "● Offline" },
    retired:  { cls: "badge-gray",    label: "Retired" },
  };
  const m = map[status] || map.inactive;
  return <span className={m.cls}>{m.label}</span>;
}

// ── Utilization Bar ───────────────────────────────────────────────────────────
export function UtilBar({ pct, showLabel = true }) {
  const color = pct >= 75 ? "bg-primary-600" : pct >= 40 ? "bg-amber-400" : "bg-slate-300";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      {showLabel && <span className="text-xs font-mono w-8 text-right text-slate-600">{pct}%</span>}
    </div>
  );
}

// ── Section heading ───────────────────────────────────────────────────────────
export function SectionHeading({ title, action }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {action}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-4">
      {Icon && <Icon size={40} className="text-slate-300 mb-4" />}
      <p className="font-semibold text-slate-700 text-base">{title}</p>
      {description && <p className="text-sm text-slate-500 mt-1 max-w-xs">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ── Skeleton loaders ──────────────────────────────────────────────────────────
export function SkeletonCard() {
  return (
    <div className="stat-card animate-pulse">
      <div className="skeleton h-3 w-20 mb-3" />
      <div className="skeleton h-8 w-16 mb-2" />
      <div className="skeleton h-2 w-28" />
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }) {
  return (
    <div className="card">
      <div className="border-b border-slate-100 p-4">
        <div className="skeleton h-3 w-32" />
      </div>
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} className="px-4 py-3 flex gap-4">
            {Array.from({ length: cols }, (_, c) => (
              <div key={c} className={`skeleton h-3 ${c === 0 ? "w-32" : "w-20"}`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Page wrapper ──────────────────────────────────────────────────────────────
export function PageWrapper({ children }) {
  return <div className="p-6 max-w-[1400px] mx-auto">{children}</div>;
}

// ── Format helpers ────────────────────────────────────────────────────────────
export function formatDuration(seconds) {
  if (!seconds || seconds < 60) return `${seconds || 0}s`;
  const m = Math.floor(seconds / 60);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}

export function formatDate(isoStr) {
  if (!isoStr) return "—";
  return new Date(isoStr).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}
