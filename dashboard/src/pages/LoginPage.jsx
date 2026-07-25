import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Monitor, Eye, EyeOff, Loader2 } from "lucide-react";
import { COLLEGE } from "../data/mockData";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || "/";

  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  const handleSubmit = async e => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Card */}
        <div className="bg-white rounded-2xl overflow-hidden">
          {/* Header */}
          <div className="p-8 text-center border-b border-slate-100">
            <div className="w-12 h-12 bg-primary-50 rounded-xl flex items-center justify-center mx-auto mb-4">
              <Monitor size={24} className="text-primary-600" />
            </div>
            <h1 className="text-lg font-semibold text-slate-900">{COLLEGE.appName}</h1>
            <p className="text-slate-500 text-sm mt-1">{COLLEGE.name}</p>
            <p className="text-slate-400 text-xs">{COLLEGE.location}</p>
          </div>

          {/* Form */}
          <div className="p-8">
            <p className="text-center text-slate-500 text-sm mb-6">Sign in to your faculty account</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="form-label" htmlFor="email">Email Address</label>
                <input
                  id="email"
                  type="email"
                  className="form-input"
                  placeholder="you@wit.ac.in"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="form-label" htmlFor="password">Password</label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPw ? "text" : "password"}
                    className="form-input pr-10"
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {error && (
                <p className="text-xs text-danger bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <button
                id="login-btn"
                type="submit"
                disabled={loading}
                className="btn-primary w-full justify-center text-sm font-semibold py-2.5"
              >
                {loading ? <Loader2 size={15} className="animate-spin" /> : null}
                {loading ? "Signing in…" : "Sign In"}
              </button>
            </form>

            {/* Demo credentials */}
            <div className="mt-6 p-3 bg-slate-50 rounded-lg text-xs text-slate-500 space-y-1">
              <p className="font-medium text-slate-600 mb-2">Demo Credentials</p>
              <p>Admin: <code className="font-mono bg-white px-1 rounded text-slate-700">admin@wit.ac.in</code> / <code className="font-mono bg-white px-1 rounded text-slate-700">Admin@123</code></p>
              <p>Faculty: <code className="font-mono bg-white px-1 rounded text-slate-700">faculty@wit.ac.in</code> / <code className="font-mono bg-white px-1 rounded text-slate-700">Faculty@123</code></p>
            </div>
          </div>
        </div>

        <p className="text-center text-slate-400 text-xs mt-6">
          © 2025 Walchand Institute of Technology, Solapur<br />
          Privacy-Preserving Lab Analytics System
        </p>
      </div>
    </div>
  );
}
