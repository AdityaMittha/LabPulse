// Auth context — mock Cognito authentication
// Walchand Institute of Technology, Solapur — LabPulse
import { createContext, useContext, useState, useCallback } from "react";

const AuthContext = createContext(null);

// Mock users (replace with real Cognito in production)
const MOCK_USERS = {
  "admin@wit.ac.in":   { name: "Dr. S. Kulkarni", role: "admin",   password: "Admin@123" },
  "faculty@wit.ac.in": { name: "Prof. P. Jadhav", role: "faculty", password: "Faculty@123" },
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = sessionStorage.getItem("labpulse_user");
    return saved ? JSON.parse(saved) : null;
  });

  const login = useCallback(async (email, password) => {
    // Simulate network delay
    await new Promise(r => setTimeout(r, 800));
    const found = MOCK_USERS[email.toLowerCase()];
    if (!found || found.password !== password) {
      throw new Error("Invalid email or password.");
    }
    const userData = { email, name: found.name, role: found.role };
    sessionStorage.setItem("labpulse_user", JSON.stringify(userData));
    setUser(userData);
    return userData;
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem("labpulse_user");
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout, isAdmin: user?.role === "admin" }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
