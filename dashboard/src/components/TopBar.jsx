// Top bar with breadcrumbs, date picker, and user controls
import { useState } from "react";
import { Link } from "react-router-dom";
import { Menu, Calendar, Bell, ChevronRight, X } from "lucide-react";

export default function TopBar({ onToggleSidebar, breadcrumbs = [], dateRange, onDateChange }) {
  const [showDatePicker, setShowDatePicker] = useState(false);

  const handleQuickSelect = (daysAgo) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    const dateStr = d.toISOString().slice(0, 10);
    onDateChange(dateStr);
    setShowDatePicker(false);
  };

  return (
    <header className="h-[52px] bg-white border-b border-slate-200/60 px-5 flex items-center gap-4 shrink-0 z-20">
      {/* Sidebar toggle */}
      <button
        onClick={onToggleSidebar}
        className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors"
      >
        <Menu size={17} />
      </button>

      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1.5 text-sm flex-1 overflow-hidden">
        {breadcrumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1.5 min-w-0">
            {i > 0 && <ChevronRight size={13} className="text-slate-300 shrink-0" />}
            {crumb.to
              ? <Link to={crumb.to} className="text-slate-400 hover:text-primary-600 truncate transition-colors">{crumb.label}</Link>
              : <span className="font-medium text-slate-700 truncate">{crumb.label}</span>
            }
          </span>
        ))}
      </nav>

      {/* Date range chip */}
      <div className="relative">
        <button
          onClick={() => setShowDatePicker(!showDatePicker)}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <Calendar size={13} />
          <span>{dateRange || "Today"}</span>
        </button>

        {showDatePicker && (
          <div className="absolute right-0 mt-2 w-60 bg-white rounded-xl border border-slate-200 shadow-lg p-4 z-50">
            <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
              <span className="text-xs font-medium text-slate-600">Select Date</span>
              <button 
                onClick={() => setShowDatePicker(false)}
                className="text-slate-400 hover:text-slate-600 p-0.5 rounded-lg"
              >
                <X size={14} />
              </button>
            </div>
            
            <div className="space-y-3">
              {/* HTML5 Date picker */}
              <div>
                <label className="block text-[10px] font-medium text-slate-400 mb-1">Custom Date</label>
                <input 
                  type="date" 
                  value={dateRange}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={e => {
                    if (e.target.value) {
                      onDateChange(e.target.value);
                      setShowDatePicker(false);
                    }
                  }}
                  className="form-input text-xs" 
                />
              </div>

              {/* Quick selectors */}
              <div className="grid grid-cols-3 gap-1">
                <button 
                  onClick={() => handleQuickSelect(0)}
                  className="px-2 py-1 text-[11px] font-medium rounded-md bg-slate-50 border border-slate-200 text-slate-600 hover:bg-primary-50 hover:text-primary-600 hover:border-primary-200 transition-colors"
                >
                  Today
                </button>
                <button 
                  onClick={() => handleQuickSelect(1)}
                  className="px-2 py-1 text-[11px] font-medium rounded-md bg-slate-50 border border-slate-200 text-slate-600 hover:bg-primary-50 hover:text-primary-600 hover:border-primary-200 transition-colors"
                >
                  Yesterday
                </button>
                <button 
                  onClick={() => handleQuickSelect(7)}
                  className="px-2 py-1 text-[11px] font-medium rounded-md bg-slate-50 border border-slate-200 text-slate-600 hover:bg-primary-50 hover:text-primary-600 hover:border-primary-200 transition-colors"
                >
                  7 Days Ago
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Notifications placeholder */}
      <button className="relative p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors">
        <Bell size={16} />
        <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-primary-600 rounded-full" />
      </button>
    </header>
  );
}
