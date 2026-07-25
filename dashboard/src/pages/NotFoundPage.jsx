import { Link } from "react-router-dom";
import { Home, AlertTriangle } from "lucide-react";

export default function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full py-20 text-center px-4">
      <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mb-6">
        <AlertTriangle size={28} className="text-slate-400" />
      </div>
      <h1 className="text-5xl font-bold text-slate-200 mb-2">404</h1>
      <p className="text-lg font-semibold text-slate-600 mb-2">Page not found</p>
      <p className="text-sm text-slate-400 mb-8 max-w-xs">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <Link to="/" className="btn-primary">
        <Home size={14} /> Back to Overview
      </Link>
    </div>
  );
}
