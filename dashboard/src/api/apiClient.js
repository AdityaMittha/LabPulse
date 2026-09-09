/**
 * API client for the LabPulse backend.
 * All functions call the real backend API — no mock fallbacks.
 * VITE_API_BASE_URL must be set in .env (e.g. /v1 or https://api.example.com/v1)
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

function getAuthHeaders() {
  const token = sessionStorage.getItem("labpulse_token");
  const headers = { "Content-Type": "application/json" };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

async function apiFetch(path, options = {}) {
  if (!BASE_URL) {
    throw new Error("VITE_API_BASE_URL is not configured. Please set it in your .env file.");
  }
  const url = `${BASE_URL}${path}`;
  const resp = await fetch(url, { headers: getAuthHeaders(), ...options });
  if (!resp.ok) {
    if (resp.status === 401) {
      sessionStorage.removeItem("labpulse_token");
      sessionStorage.removeItem("labpulse_user");
      if (!window.location.hash.includes("/login")) {
        window.location.hash = "#/login";
      }
      throw new Error("Session expired. Please log in again.");
    }
    const errText = await resp.text().catch(() => "");
    throw new Error(`API error ${resp.status}: ${errText || resp.statusText}`);
  }
  return resp.json();
}

// ── Labs ────────────────────────────────────────────────────────────────────

export async function fetchLabs() {
  const data = await apiFetch("/admin/labs");
  return data.labs || [];
}

export async function addLab({ lab_id, name, building, floor, department, capacity }) {
  const data = await apiFetch("/admin/labs", {
    method: "POST",
    body: JSON.stringify({ lab_id, name, building, floor, department, capacity }),
  });
  return data;
}

export async function updateLab({ lab_id, name, building, floor, department, capacity }) {
  const data = await apiFetch("/admin/labs", {
    method: "PUT",
    body: JSON.stringify({ lab_id, name, building, floor, department, capacity, is_edit: true }),
  });
  return data;
}

export async function deleteLab(labId) {
  const data = await apiFetch(`/admin/labs?lab_id=${encodeURIComponent(labId)}`, {
    method: "DELETE",
  });
  return data;
}

// ── Departments ──────────────────────────────────────────────────────────────

export async function fetchDepartments() {
  const data = await apiFetch("/admin/departments");
  return data.departments || [];
}

export async function addDepartment({ department_id, name, code, building, hod_name }) {
  const data = await apiFetch("/admin/departments", {
    method: "POST",
    body: JSON.stringify({ department_id, name, code, building, hod_name }),
  });
  return data;
}

export async function deleteDepartment(departmentId) {
  const data = await apiFetch(`/admin/departments?department_id=${encodeURIComponent(departmentId)}`, {
    method: "DELETE",
  });
  return data;
}


// ── Machines ─────────────────────────────────────────────────────────────────

export async function fetchMachines(labId = "") {
  const params = labId ? `?lab_id=${encodeURIComponent(labId)}` : "";
  const data = await apiFetch(`/admin/machines${params}`);
  return data.machines || [];
}

export async function addMachine({ machine_id, lab_id, hostname }) {
  const data = await apiFetch("/admin/machines", {
    method: "POST",
    body: JSON.stringify({ machine_id, lab_id, hostname }),
  });
  // Returns { machine_id, api_key, message }
  return data;
}

export async function updateMachine({ machine_id, lab_id, hostname, status, regenerate_key }) {
  const data = await apiFetch("/admin/machines", {
    method: "PUT",
    body: JSON.stringify({ machine_id, lab_id, hostname, status, regenerate_key, is_edit: true }),
  });
  return data;
}

export async function deleteMachine(machineId) {
  const data = await apiFetch(`/admin/machines?machine_id=${encodeURIComponent(machineId)}`, {
    method: "DELETE",
  });
  return data;
}

// ── Students ─────────────────────────────────────────────────────────────────

export async function fetchStudents() {
  const data = await apiFetch("/admin/students");
  const list = data.students || [];
  return list.map(s => {
    const id = s.student_id || s.pnr_no || "";
    return { ...s, student_id: id, pnr_no: id };
  });
}

export async function addStudent({ student_id, name, college_login, pnr_no, password, department, year }) {
  const finalId = (student_id || pnr_no || "").trim();
  const data = await apiFetch("/admin/students", {
    method: "POST",
    body: JSON.stringify({
      student_id: finalId,
      pnr_no: finalId,
      name,
      college_login,
      password,
      department,
      year,
    }),
  });
  return data;
}

export async function updateStudent({ student_id, name, college_login, pnr_no, password, department, year }) {
  const finalId = (student_id || pnr_no || "").trim();
  const data = await apiFetch("/admin/students", {
    method: "PUT",
    body: JSON.stringify({
      student_id: finalId,
      pnr_no: finalId,
      name,
      college_login,
      password,
      department,
      year,
      is_edit: true,
    }),
  });
  return data;
}

export async function deleteStudent(studentId) {
  const data = await apiFetch(`/admin/students?student_id=${encodeURIComponent(studentId)}`, {
    method: "DELETE",
  });
  return data;
}

// ── Timetable ─────────────────────────────────────────────────────────────────

export async function fetchTimetable(labId = "") {
  const params = labId ? `?lab_id=${encodeURIComponent(labId)}` : "";
  const data = await apiFetch(`/admin/timetable${params}`);
  return data.slots || [];
}

export async function addTimetableSlot(slot) {
  const data = await apiFetch("/admin/timetable", {
    method: "POST",
    body: JSON.stringify(slot),
  });
  return data;
}

export async function deleteTimetableSlot(slotId) {
  const data = await apiFetch(`/admin/timetable?slot_id=${encodeURIComponent(slotId)}`, {
    method: "DELETE",
  });
  return data;
}

// ── Sessions / Usage ──────────────────────────────────────────────────────────

export async function fetchUsage(filters = {}) {
  const params = new URLSearchParams();
  if (filters.lab_id)     params.append("lab_id",     filters.lab_id);
  if (filters.machine_id) params.append("machine_id", filters.machine_id);
  if (filters.student_id) params.append("student_id", filters.student_id);
  if (filters.date)       params.append("date",       filters.date);
  if (filters.date_from)  params.append("date_from",  filters.date_from);
  if (filters.date_to)    params.append("date_to",    filters.date_to);
  if (filters.limit)      params.append("limit",      filters.limit);

  const qs = params.toString();
  const data = await apiFetch(`/analytics/usage${qs ? `?${qs}` : ""}`);
  return data.sessions || [];
}

// ── Compliance ─────────────────────────────────────────────────────────────

export async function fetchCompliance(labId, date, slot = "") {
  const params = new URLSearchParams({ lab_id: labId, date });
  if (slot) params.append("slot", slot);
  const data = await apiFetch(`/analytics/compliance?${params.toString()}`);
  return data;
}

// ── Browser Activity ──────────────────────────────────────────────────────────

export async function fetchTopSites(labId, date) {
  try {
    const params = new URLSearchParams();
    if (labId) params.append("lab_id", labId);
    if (date)  params.append("date", date);
    const data = await apiFetch(`/analytics/browser?${params.toString()}`);
    return data.top_sites || [];
  } catch (err) {
    console.warn("Could not fetch top sites:", err);
    return [];
  }
}

export async function fetchStudentBrowserActivity(studentId) {
  const params = new URLSearchParams({ student_id: studentId });
  const data = await apiFetch(`/analytics/browser?${params.toString()}`);

  // Aggregate across all activity records returned
  const siteMap = {};
  const pageLog = [];
  (data.activities || []).forEach(a => {
    (a.sites || []).forEach(s => {
      if (!siteMap[s.domain]) {
        siteMap[s.domain] = { domain: s.domain, active_duration: 0, visit_count: 0 };
      }
      siteMap[s.domain].active_duration += s.active_duration || 0;
      siteMap[s.domain].visit_count     += s.visit_count     || 0;
    });
    pageLog.push(...(a.page_log || []));
  });

  return {
    sites:    Object.values(siteMap).sort((a, b) => b.active_duration - a.active_duration).slice(0, 10),
    page_log: pageLog.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 20),
  };
}

// ── Clipboard Utility ────────────────────────────────────────────────────────

export async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      console.warn("navigator.clipboard.writeText failed:", e);
    }
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch (err) {
    console.error("Fallback copy failed:", err);
    return false;
  }
}

