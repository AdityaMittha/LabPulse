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

// ── Institutional Period Timing ──────────────────────────────────────────────
export const COLLEGE_PERIODS = [
  { id: "p1", label: "09:15", name: "Period 1", range: "09:15–10:15", startH: 9,  startM: 15, endH: 10, endM: 15 },
  { id: "p2", label: "10:15", name: "Period 2", range: "10:15–11:15", startH: 10, startM: 15, endH: 11, endM: 15 },
  { id: "p3", label: "11:15", name: "Period 3", range: "11:15–12:15", startH: 11, startM: 15, endH: 12, endM: 15 },
  { id: "p4", label: "13:15", name: "Period 4", range: "13:15–14:15", startH: 13, startM: 15, endH: 14, endM: 15 },
  { id: "p5", label: "14:15", name: "Period 5", range: "14:15–15:15", startH: 14, startM: 15, endH: 15, endM: 15 },
  { id: "p6", label: "15:30", name: "Period 6", range: "15:30–16:30", startH: 15, startM: 30, endH: 16, endM: 30 },
  { id: "p7", label: "16:30", name: "Period 7", range: "16:30–17:30", startH: 16, startM: 30, endH: 17, endM: 30 },
];

export const LAB_SLOT_PRESETS = [
  { label: "09:15 – 11:15 (Morning Lab)",   start: "09:15", end: "11:15" },
  { label: "11:15 – 13:15 (Mid-day Lab)",   start: "11:15", end: "13:15" },
  { label: "13:15 – 15:15 (Afternoon Lab)", start: "13:15", end: "15:15" },
  { label: "15:30 – 17:30 (Late Lab)",      start: "15:30", end: "17:30" },
  { label: "09:15 – 10:15 (Period 1)",      start: "09:15", end: "10:15" },
  { label: "10:15 – 11:15 (Period 2)",      start: "10:15", end: "11:15" },
  { label: "11:15 – 12:15 (Period 3)",      start: "11:15", end: "12:15" },
  { label: "13:15 – 14:15 (Period 4)",      start: "13:15", end: "14:15" },
  { label: "14:15 – 15:15 (Period 5)",      start: "14:15", end: "15:15" },
  { label: "15:30 – 16:30 (Period 6)",      start: "15:30", end: "16:30" },
  { label: "16:30 – 17:30 (Period 7)",      start: "16:30", end: "17:30" },
];

export function getSessionPeriod(loginTime) {
  if (!loginTime) return null;
  const d = new Date(loginTime);
  const totalMins = d.getHours() * 60 + d.getMinutes();
  return COLLEGE_PERIODS.find(
    p => totalMins >= (p.startH * 60 + p.startM) && totalMins < (p.endH * 60 + p.endM)
  );
}

