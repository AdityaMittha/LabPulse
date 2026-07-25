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
            ? "bg-primary-50 text-primary-700"
            : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
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
    <aside className={`h-screen bg-white border-r border-slate-200/60 flex flex-col transition-all duration-200 ${collapsed ? "w-16" : "w-56"}`}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-slate-100 min-h-[56px]">
        <div className="w-7 h-7 bg-primary-600 rounded-lg flex items-center justify-center shrink-0">
          <Monitor size={14} className="text-white" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <p className="font-semibold text-slate-800 text-sm leading-tight">{COLLEGE.appName}</p>
            <p className="text-[11px] text-slate-400 truncate">{COLLEGE.shortName}</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {!collapsed && <p className="px-3 mb-2 text-[11px] font-medium text-slate-400">Analytics</p>}
        {navItems.map(item => (
          collapsed
            ? (
              <NavLink key={item.to} to={item.to} end={item.to === "/"}
                title={item.label}
                className={({ isActive }) =>
                  `flex items-center justify-center w-10 h-10 rounded-lg mx-auto transition-all ${
                    isActive ? "bg-primary-50 text-primary-700" : "text-slate-400 hover:bg-slate-100"
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
            {!collapsed && <p className="px-3 mt-4 mb-2 text-[11px] font-medium text-slate-400">Admin</p>}
            {collapsed && <div className="border-t border-slate-100 my-2" />}
            {adminItems.map(item => (
              collapsed
                ? (
                  <NavLink key={item.to} to={item.to}
                    title={item.label}
                    className={({ isActive }) =>
                      `flex items-center justify-center w-10 h-10 rounded-lg mx-auto transition-all ${
                        isActive ? "bg-primary-50 text-primary-700" : "text-slate-400 hover:bg-slate-100"
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
                className="flex items-center justify-center w-10 h-10 rounded-lg mx-auto text-primary-600 hover:bg-primary-50 transition-all mt-4 border border-dashed border-slate-200">
                <Download size={18} />
              </a>
            ) : (
              <a href="/labpulse-agent.zip" download
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-primary-600 bg-primary-50/50 border border-dashed border-slate-200 hover:bg-primary-50 transition-all mt-4">
                <Download size={16} className="shrink-0" />
                <span className="truncate">Download Agent Pack</span>
              </a>
            )}
          </>
        )}
      </nav>

      {/* User */}
      <div className="border-t border-slate-100 p-3">
        {!collapsed ? (
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-semibold text-[11px] shrink-0">
              {user?.name?.split(" ").map(n => n[0]).join("").slice(0, 2)}
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-xs font-medium text-slate-800 truncate">{user?.name}</p>
              <p className="text-[11px] text-slate-400 capitalize">
                {user?.role === "faculty" && user?.department ? `Faculty · ${user.department}` : user?.role}
              </p>
            </div>
            <button onClick={handleLogout} title="Logout"
              className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50/50 transition-colors">
              <LogOut size={14} />
            </button>
          </div>
        ) : (
          <button onClick={handleLogout} title="Logout"
            className="flex items-center justify-center w-10 h-10 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50/50 transition-colors mx-auto">
            <LogOut size={16} />
          </button>
        )}
      </div>
    </aside>
  );
}
