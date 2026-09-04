// Pure utility functions and static configuration shared across the dashboard.
// All dynamic data is now fetched from the real backend API.

// ── Static institutional branding ──────────────────────────────────────────
export const COLLEGE = {
  name:      "Walchand Institute of Technology",
  shortName: "WIT",
  location:  "Solapur",
  appName:   "LabPulse",
};

// ── Pure utility functions ──────────────────────────────────────────────────

export function todayStr() {
  const d = new Date();
  const year  = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day   = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDuration(seconds) {
  if (!seconds || seconds < 1) return "0s";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}

