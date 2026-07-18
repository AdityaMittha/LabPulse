// Sidebar navigation component
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { COLLEGE } from "../data/mockData";
import {
  LayoutDashboard, FlaskConical, Monitor, Users,
  ClipboardCheck, FileBarChart2, Settings, LogOut,
  ChevronRight, Cpu, BookOpen, Download
} from "lucide-react";

const navItems = [
  { to: "/", label: "Overview",   icon: LayoutDashboard },
  { to: "/labs",       label: "Labs",         icon: FlaskConical },
  { to: "/compliance", label: "Compliance",   icon: ClipboardCheck },
  { to: "/reports",    label: "Reports",      icon: FileBarChart2 },
];

const adminItems = [
  { to: "/admin/machines",  label: "Machines",  icon: Cpu },
  { to: "/admin/students",  label: "Students",  icon: Users },
  { to: "/admin/timetable", label: "Timetable", icon: BookOpen },
];

function NavItem({ to, label, icon: Icon, end = false }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 group ${
          isActive
            ? "bg-primary-600 text-white shadow-sm"
            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        }`
      }
    >
      <Icon size={16} className="shrink-0" />
      <span className="truncate">{label}</span>
    </NavLink>
  );
}

export default function Sidebar({ collapsed, onCollapse }) {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <aside className={`h-screen bg-white border-r border-slate-200 flex flex-col transition-all duration-200 ${collapsed ? "w-16" : "w-60"}`}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-slate-200 min-h-[60px]">
        <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center shrink-0">
          <Monitor size={16} className="text-white" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <p className="font-bold text-slate-900 text-sm leading-tight">{COLLEGE.appName}</p>
            <p className="text-xs text-slate-500 truncate">{COLLEGE.shortName} {COLLEGE.location}</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-1">
        {!collapsed && <p className="px-3 mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">Analytics</p>}
        {navItems.map(item => (
          collapsed
            ? (
              <NavLink key={item.to} to={item.to} end={item.to === "/"}
                title={item.label}
                className={({ isActive }) =>
                  `flex items-center justify-center w-10 h-10 rounded-lg mx-auto transition-all ${
                    isActive ? "bg-primary-600 text-white" : "text-slate-500 hover:bg-slate-100"
                  }`
                }
              >
                <item.icon size={18} />
              </NavLink>
            )
            : <NavItem key={item.to} {...item} end={item.to === "/"} />
        ))}

        {isAdmin && (
          <>
            {!collapsed && <p className="px-3 mt-5 mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">Admin</p>}
            {collapsed && <div className="border-t border-slate-100 my-2" />}
            {adminItems.map(item => (
              collapsed
                ? (
                  <NavLink key={item.to} to={item.to}
                    title={item.label}
                    className={({ isActive }) =>
                      `flex items-center justify-center w-10 h-10 rounded-lg mx-auto transition-all ${
                        isActive ? "bg-primary-600 text-white" : "text-slate-500 hover:bg-slate-100"
                      }`
                    }
                  >
                    <item.icon size={18} />
                  </NavLink>
                )
                : <NavItem key={item.to} {...item} />
            ))}

            {/* Download Agent Button */}
            {collapsed ? (
              <a href="/labpulse-agent.zip" download title="Download Windows Agent (.zip)"
                className="flex items-center justify-center w-10 h-10 rounded-lg mx-auto text-primary-600 hover:bg-primary-50 transition-all mt-4 border border-dashed border-primary-200">
                <Download size={18} />
              </a>
            ) : (
              <a href="/labpulse-agent.zip" download
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-semibold text-primary-600 bg-primary-50 border border-dashed border-primary-200 hover:bg-primary-100 transition-all mt-4">
                <Download size={16} className="shrink-0" />
                <span className="truncate">Download Agent Pack</span>
              </a>
            )}
          </>
        )}
      </nav>

      {/* User */}
      <div className="border-t border-slate-200 p-3">
        {!collapsed ? (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold text-xs shrink-0">
              {user?.name?.split(" ").map(n => n[0]).join("").slice(0, 2)}
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-xs font-semibold text-slate-900 truncate">{user?.name}</p>
              <p className="text-xs text-slate-500 capitalize">{user?.role}</p>
            </div>
            <button onClick={handleLogout} title="Logout"
              className="p-1.5 rounded-lg text-slate-400 hover:text-danger hover:bg-red-50 transition-colors">
              <LogOut size={14} />
            </button>
          </div>
        ) : (
          <button onClick={handleLogout} title="Logout"
            className="flex items-center justify-center w-10 h-10 rounded-lg text-slate-400 hover:text-danger hover:bg-red-50 transition-colors mx-auto">
            <LogOut size={16} />
          </button>
        )}
      </div>
    </aside>
  );
}
