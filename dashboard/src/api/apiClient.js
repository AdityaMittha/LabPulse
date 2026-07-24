import * as mock from "../data/mockData";

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

function getAuthHeaders() {
  const token = sessionStorage.getItem("labpulse_token");
  const headers = { "Content-Type": "application/json" };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

export async function fetchUsage(filters = {}) {
  if (!BASE_URL) {
    console.warn("VITE_API_BASE_URL not configured. Using mock data.");
    return mock.sessions;
  }

  try {
    const params = new URLSearchParams();
    if (filters.lab_id) params.append("lab_id", filters.lab_id);
    if (filters.machine_id) params.append("machine_id", filters.machine_id);
    if (filters.student_id) params.append("student_id", filters.student_id);
    if (filters.date) params.append("date", filters.date);
    if (filters.date_from) params.append("date_from", filters.date_from);
    if (filters.date_to) params.append("date_to", filters.date_to);

    const url = `${BASE_URL}/analytics/usage?${params.toString()}`;
    const resp = await fetch(url, { headers: getAuthHeaders() });
    if (!resp.ok) throw new Error(`HTTP error! status: ${resp.status}`);
    const data = await resp.json();
    return data.sessions;
  } catch (err) {
    console.error("Failed to fetch usage analytics from backend. Falling back to mock data.", err);
    return mock.sessions;
  }
}

export async function fetchCompliance(labId, date, slot = "") {
  if (!BASE_URL) {
    console.warn("VITE_API_BASE_URL not configured. Using mock data.");
    return mock.getComplianceStats(labId, date);
  }

  try {
    const params = new URLSearchParams({ lab_id: labId, date });
    if (slot) params.append("slot", slot);

    const url = `${BASE_URL}/analytics/compliance?${params.toString()}`;
    const resp = await fetch(url, { headers: getAuthHeaders() });
    if (!resp.ok) throw new Error(`HTTP error! status: ${resp.status}`);
    return await resp.json();
  } catch (err) {
    console.error("Failed to fetch compliance stats from backend. Falling back to mock data.", err);
    return mock.getComplianceStats(labId, date);
  }
}

export async function fetchMachines(labId = "") {
  if (!BASE_URL) {
    return mock.machines;
  }

  try {
    const params = labId ? `?lab_id=${labId}` : "";
    const url = `${BASE_URL}/admin/machines${params}`;
    const resp = await fetch(url, { headers: getAuthHeaders() });
    if (!resp.ok) throw new Error(`HTTP error! status: ${resp.status}`);
    const data = await resp.json();
    return data.machines;
  } catch (err) {
    console.error("Failed to fetch machines from backend. Falling back to mock data.", err);
    return mock.machines;
  }
}

export async function fetchStudents() {
  if (!BASE_URL) {
    return mock.students;
  }

  try {
    const url = `${BASE_URL}/admin/students`;
    const resp = await fetch(url, { headers: getAuthHeaders() });
    if (!resp.ok) throw new Error(`HTTP error! status: ${resp.status}`);
    const data = await resp.json();
    return data.students;
  } catch (err) {
    console.error("Failed to fetch students list from backend. Falling back to mock data.", err);
    return mock.students;
  }
}

export async function fetchTimetable(labId = "") {
  if (!BASE_URL) {
    return mock.timetable;
  }

  try {
    const params = labId ? `?lab_id=${labId}` : "";
    const url = `${BASE_URL}/admin/timetable${params}`;
    const resp = await fetch(url, { headers: getAuthHeaders() });
    if (!resp.ok) throw new Error(`HTTP error! status: ${resp.status}`);
    const data = await resp.json();
    return data.slots;
  } catch (err) {
    console.error("Failed to fetch timetable from backend. Falling back to mock data.", err);
    return mock.timetable;
  }
}

export async function deleteStudent(studentId) {
  if (!BASE_URL) {
    console.log(`[Mock] Deleting student ${studentId} and all associated data...`);
    const idx = mock.students.findIndex(s => s.student_id === studentId);
    if (idx !== -1) mock.students.splice(idx, 1);
    
    // Cascade delete sessions and their usage/metrics
    const studentSessions = mock.sessions.filter(s => s.student_id === studentId);
    studentSessions.forEach(s => {
      delete mock.appUsages[s.session_id];
      delete mock.behaviorMetrics[s.session_id];
    });
    
    const remainingSessions = mock.sessions.filter(s => s.student_id !== studentId);
    mock.sessions.splice(0, mock.sessions.length, ...remainingSessions);
    return { status: "deleted" };
  }

  try {
    const url = `${BASE_URL}/admin/students?student_id=${studentId}`;
    const resp = await fetch(url, { method: "DELETE", headers: getAuthHeaders() });
    if (!resp.ok) throw new Error(`HTTP error! status: ${resp.status}`);
    return await resp.json();
  } catch (err) {
    console.error("Failed to delete student from backend", err);
    throw err;
  }
}

export async function deleteMachine(machineId) {
  if (!BASE_URL) {
    console.log(`[Mock] Deleting machine ${machineId} and all associated data...`);
    const idx = mock.machines.findIndex(m => m.machine_id === machineId);
    if (idx !== -1) mock.machines.splice(idx, 1);
    
    // Cascade delete sessions and their usage/metrics
    const machineSessions = mock.sessions.filter(s => s.machine_id === machineId);
    machineSessions.forEach(s => {
      delete mock.appUsages[s.session_id];
      delete mock.behaviorMetrics[s.session_id];
    });
    
    const remainingSessions = mock.sessions.filter(s => s.machine_id !== machineId);
    mock.sessions.splice(0, mock.sessions.length, ...remainingSessions);
    return { status: "deleted" };
  }

  try {
    const url = `${BASE_URL}/admin/machines?machine_id=${machineId}`;
    const resp = await fetch(url, { method: "DELETE", headers: getAuthHeaders() });
    if (!resp.ok) throw new Error(`HTTP error! status: ${resp.status}`);
    return await resp.json();
  } catch (err) {
    console.error("Failed to delete machine from backend", err);
    throw err;
  }
}

export async function fetchTopSites(labId, date) {
  if (!BASE_URL) {
    return mock.getTopSites(labId, date);
  }

  try {
    const params = new URLSearchParams({ lab_id: labId, date });
    const url = `${BASE_URL}/analytics/browser?${params.toString()}`;
    const resp = await fetch(url, { headers: getAuthHeaders() });
    if (!resp.ok) throw new Error(`HTTP error! status: ${resp.status}`);
    const data = await resp.json();
    return data.top_sites || [];
  } catch (err) {
    console.error("Failed to fetch top sites from backend. Falling back to mock data.", err);
    return mock.getTopSites(labId, date);
  }
}

export async function fetchStudentBrowserActivity(studentId) {
  if (!BASE_URL) {
    return mock.getStudentBrowserActivity(studentId);
  }

  try {
    const params = new URLSearchParams({ student_id: studentId });
    const url = `${BASE_URL}/analytics/browser?${params.toString()}`;
    const resp = await fetch(url, { headers: getAuthHeaders() });
    if (!resp.ok) throw new Error(`HTTP error! status: ${resp.status}`);
    const data = await resp.json();
    // Aggregate from activities
    const siteMap = {};
    const pageLog = [];
    (data.activities || []).forEach(a => {
      (a.sites || []).forEach(s => {
        if (!siteMap[s.domain]) siteMap[s.domain] = { domain: s.domain, active_duration: 0, visit_count: 0 };
        siteMap[s.domain].active_duration += s.active_duration;
        siteMap[s.domain].visit_count += s.visit_count;
      });
      pageLog.push(...(a.page_log || []));
    });
    return {
      sites: Object.values(siteMap).sort((a, b) => b.active_duration - a.active_duration).slice(0, 10),
      page_log: pageLog.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 20),
    };
  } catch (err) {
    console.error("Failed to fetch student browser activity. Falling back to mock data.", err);
    return mock.getStudentBrowserActivity(studentId);
  }
}

