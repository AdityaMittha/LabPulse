// Mock data for LabPulse — Walchand Institute of Technology, Solapur
// Covers 3 labs, 30 machines, 120 students, 1 week of timetable, 3 days of sessions

export const COLLEGE = {
  name: "Walchand Institute of Technology",
  shortName: "WIT",
  location: "Solapur",
  appName: "LabPulse",
};

// ── Labs ────────────────────────────────────────────────────────────────────
export const labs = [
  { lab_id: "CS-LAB-1", name: "CS Lab 1",     building: "D Block", floor: "Ground", capacity: 40, department: "CSE" },
  { lab_id: "CS-LAB-2", name: "CS Lab 2",     building: "D Block", floor: "First",  capacity: 30, department: "CSE/IT" },
  { lab_id: "IT-LAB",   name: "IT Lab",       building: "C Block", floor: "Ground", capacity: 35, department: "IT" },
  { lab_id: "ETC-LAB", name: "E&TC Lab",     building: "B Block", floor: "Second", capacity: 25, department: "E&TC" },
];

// ── Machines ─────────────────────────────────────────────────────────────────
function makeMachines(labId, prefix, count) {
  return Array.from({ length: count }, (_, i) => ({
    machine_id: `${prefix}-PC-${String(i + 1).padStart(2, "0")}`,
    lab_id: labId,
    hostname: `WIT-${prefix}-${String(i + 1).padStart(2, "0")}`,
    status: i < count - 2 ? "active" : i === count - 1 ? "inactive" : "active",
    last_seen_at: new Date(Date.now() - Math.random() * 3600000).toISOString(),
    ip_address: `192.168.${labId === "CS-LAB-1" ? 10 : labId === "CS-LAB-2" ? 11 : labId === "IT-LAB" ? 12 : 13}.${i + 1}`,
  }));
}

export const machines = [
  ...makeMachines("CS-LAB-1", "CSL1", 10),
  ...makeMachines("CS-LAB-2", "CSL2", 8),
  ...makeMachines("IT-LAB",   "ITL",  8),
  ...makeMachines("ETC-LAB",  "ETCL", 6),
];

// ── Students ─────────────────────────────────────────────────────────────────
const depts = ["CSE", "IT", "E&TC", "MECH"];
const years  = ["FE", "SE", "TE", "BE"];
const firstNames = ["Aditya","Priya","Rohan","Sneha","Arjun","Kavya","Nikhil","Pooja","Rahul","Ananya",
                    "Vikram","Meera","Saurabh","Deepa","Kiran","Swati","Yash","Riya","Omkar","Shruti",
                    "Prathamesh","Anjali","Shubham","Nisha","Akash","Pallavi","Vaibhav","Gauri","Tejas","Komal"];
const lastNames  = ["Patil","Jadhav","Shinde","Kulkarni","Deshmukh","More","Kadam","Pawar","Salunkhe","Gaikwad",
                    "Mane","Bhosale","Sawant","Kumbhar","Sutar","Waghmare","Deshpande","Nair","Shah","Joshi",
                    "Yadav","Raut","Chavan","Wagh","Patel","Thorat","Godase","Bhoite","Lokhande","Ingale"];

export const students = Array.from({ length: 120 }, (_, i) => {
  const dept = depts[Math.floor(i / 30)];
  const year = years[Math.floor((i % 30) / 8)];
  const rollNo = String(i + 1).padStart(3, "0");
  return {
    student_id: `${dept.slice(0,2)}${new Date().getFullYear() - (years.indexOf(year)+1)}${rollNo}`,
    name: `${firstNames[i % 30]} ${lastNames[(i + 7) % 30]}`,
    department: dept,
    year,
    college_login: `${firstNames[i%30].toLowerCase()}.${lastNames[(i+7)%30].toLowerCase()}@wit.ac.in`,
    role: "student",
  };
});

// ── Timetable ─────────────────────────────────────────────────────────────────
const days = ["MON", "TUE", "WED", "THU", "FRI"];
const slots = [
  { start: "09:00", end: "10:00" }, { start: "10:00", end: "11:00" },
  { start: "11:15", end: "12:15" }, { start: "12:15", end: "13:15" },
  { start: "14:00", end: "15:00" }, { start: "15:00", end: "16:00" },
  { start: "16:00", end: "17:00" },
];
const courses = {
  "CS-LAB-1": ["CS301-DS Lab","CS302-OS Lab","CS303-CN Lab","CS201-OOP Lab"],
  "CS-LAB-2": ["CS401-AI Lab","IT301-Web Lab","CS403-ML Lab"],
  "IT-LAB":   ["IT201-Prog Lab","IT301-Web Lab","IT401-DB Lab"],
  "ETC-LAB":  ["EC301-DSP Lab","EC201-VLSI Lab","EC401-Emb Lab"],
};
const faculty = ["Dr. S. Kulkarni","Prof. P. Jadhav","Dr. R. Deshmukh","Prof. A. Patil",
                 "Dr. K. Shinde","Prof. V. Mane","Dr. N. Kadam","Prof. S. More"];

let slotIdx = 0;
export const timetable = [];
labs.forEach(lab => {
  days.forEach(day => {
    // Assign 2-4 slots per lab per day
    const labSlots = slots.slice(0, 3 + Math.floor(Math.random() * 2));
    labSlots.forEach((s, si) => {
      timetable.push({
        slot_id: `${lab.lab_id}#${day}#${s.start}`,
        lab_id: lab.lab_id,
        day_of_week: day,
        start_time: s.start,
        end_time: s.end,
        course_code: courses[lab.lab_id][si % courses[lab.lab_id].length],
        faculty_name: faculty[slotIdx++ % faculty.length],
        student_group: `${lab.department}-SEM${(si % 4) + 3}`,
        expected_count: 20 + Math.floor(Math.random() * 15),
      });
    });
  });
});

// ── Sessions (last 3 days) ────────────────────────────────────────────────────
function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randomItem(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

const apps = [
  "Code.exe", "chrome.exe", "firefox.exe", "WINWORD.EXE", "EXCEL.EXE",
  "python.exe", "java.exe", "cmd.exe", "devenv.exe", "notepad++.exe",
  "putty.exe", "Postman.exe", "eclipse.exe", "idle.exe", "matlab.exe",
];

export function generateSessions(daysBack = 3) {
  const sessions = [];
  const appUsages = {};
  const behaviorMetrics = {};
  const hourlyReports = {};

  const now = new Date();

  for (let d = 0; d < daysBack; d++) {
    const date = new Date(now);
    date.setDate(date.getDate() - d);
    const dateStr = date.toISOString().slice(0, 10);
    const dayName = days[date.getDay() - 1] || "MON";

    // Get timetable slots for this day
    const daySlots = timetable.filter(t => t.day_of_week === dayName);

    daySlots.forEach(slot => {
      const labMachines = machines.filter(m => m.lab_id === slot.lab_id && m.status === "active");
      const labStudents = students.filter(s => {
        const dept = labs.find(l => l.lab_id === slot.lab_id)?.department || "CSE";
        return dept.includes(s.department);
      }).slice(0, slot.expected_count);

      labStudents.forEach((student, si) => {
        if (Math.random() < 0.15) return; // 15% absent

        const machine = labMachines[si % labMachines.length];
        const [startH, startM] = slot.start_time.split(":").map(Number);
        const [endH] = slot.end_time.split(":").map(Number);

        const loginOffset = randomInt(0, 8); // 0-8 min late
        const loginTime = new Date(date);
        loginTime.setHours(startH, startM + loginOffset, 0, 0);

        const logoutTime = new Date(loginTime);
        logoutTime.setHours(endH, randomInt(0, 10), 0, 0);

        const totalSec = Math.max(0, (logoutTime - loginTime) / 1000);
        const slotDurSec = (endH - startH) * 3600;
        const activeSec = Math.floor(totalSec * (0.4 + Math.random() * 0.5));
        const complianceRatio = activeSec / slotDurSec;
        const compliance =
          complianceRatio >= 0.7 ? "compliant" :
          complianceRatio >= 0.2 ? "partial" : "non_compliant";

        const sessionId = `sess-${dateStr}-${student.student_id}-${slot.slot_id.replace(/[#:]/g, "-")}`;

        sessions.push({
          session_id: sessionId,
          student_id: student.student_id,
          student_name: student.name,
          machine_id: machine.machine_id,
          lab_id: slot.lab_id,
          login_time: loginTime.toISOString(),
          logout_time: logoutTime.toISOString(),
          total_duration: Math.round(totalSec),
          timetable_slot: slot.slot_id,
          course_code: slot.course_code,
          compliance_status: compliance,
          date: dateStr,
        });

        // App usage for this session
        const numApps = randomInt(2, 5);
        const sessionApps = [...apps].sort(() => Math.random() - 0.5).slice(0, numApps);
        appUsages[sessionId] = sessionApps.map(app => ({
          app_name: app,
          active_duration: randomInt(300, Math.floor(activeSec / numApps) + 300),
          open_count: randomInt(1, 8),
        }));

        // Behavior metrics
        behaviorMetrics[sessionId] = {
          keyboard_count: randomInt(200, 2000),
          mouse_click_count: randomInt(50, 500),
          mouse_move_count: randomInt(1000, 8000),
          active_time: activeSec,
          idle_time: Math.round(totalSec - activeSec),
        };

        // Hourly report
        hourlyReports[sessionId] = {
          report_id: `${sessionId}#${slot.start_time}`,
          student_id: student.student_id,
          machine_id: machine.machine_id,
          lab_id: slot.lab_id,
          hour_start: loginTime.toISOString(),
          hour_end: logoutTime.toISOString(),
          date: dateStr,
        };
      });
    });
  }

  return { sessions, appUsages, behaviorMetrics, hourlyReports };
}

// Pre-generate data
const _generated = generateSessions(7);
export const sessions      = _generated.sessions;
export const appUsages     = _generated.appUsages;
export const behaviorMetrics = _generated.behaviorMetrics;

// ── Analytics helpers ────────────────────────────────────────────────────────
export function getLabUtilization(labId, dateStr) {
  const labSessions = sessions.filter(s => s.lab_id === labId && s.date === dateStr);
  const labMachineCount = machines.filter(m => m.lab_id === labId && m.status === "active").length;
  const slotCount = 8; // total possible machine-hours
  const activeMachineHours = labSessions.length;
  return Math.min(100, Math.round((activeMachineHours / (labMachineCount * slotCount)) * 100));
}

export function getHourlyUtilization(labId, dateStr) {
  return Array.from({ length: 9 }, (_, i) => {
    const hour = i + 9; // 9am to 5pm
    const label = `${hour}:00`;
    const count = sessions.filter(s => {
      if (s.lab_id !== labId || s.date !== dateStr) return false;
      const h = new Date(s.login_time).getHours();
      return h === hour;
    }).length;
    const machineCount = machines.filter(m => m.lab_id === labId && m.status === "active").length;
    return {
      hour: label,
      sessions: count,
      utilization: machineCount > 0 ? Math.round((count / machineCount) * 100) : 0,
    };
  });
}

export function getComplianceStats(labId, dateStr) {
  const labSessions = sessions.filter(s => s.lab_id === labId && s.date === dateStr);
  const compliant  = labSessions.filter(s => s.compliance_status === "compliant").length;
  const partial    = labSessions.filter(s => s.compliance_status === "partial").length;
  const absent     = labSessions.filter(s => s.compliance_status === "non_compliant").length;
  return { compliant, partial, absent, total: labSessions.length };
}

export function getTopApps(labId, dateStr) {
  const labSessions = sessions.filter(s => s.lab_id === labId && s.date === dateStr);
  const appMap = {};
  labSessions.forEach(s => {
    (appUsages[s.session_id] || []).forEach(a => {
      appMap[a.app_name] = (appMap[a.app_name] || 0) + a.active_duration;
    });
  });
  return Object.entries(appMap)
    .map(([name, duration]) => ({ name, duration }))
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 6);
}

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}
