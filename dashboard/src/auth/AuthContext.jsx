// Auth context — Cognito authentication with mock fallback
// Walchand Institute of Technology, Solapur — LabPulse
import { createContext, useContext, useState, useCallback } from "react";

const AuthContext = createContext(null);

// Mock users (fallback when VITE_COGNITO_CLIENT_ID is empty)
const MOCK_USERS = {
  "admin@wit.ac.in":   { name: "Dr. S. Kulkarni", role: "admin",   password: "Admin@123" },
  "faculty@wit.ac.in": { name: "Prof. P. Jadhav", role: "faculty", password: "Faculty@123" },
};

function decodeJwt(token) {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      window
        .atob(base64)
        .split("")
        .map(c => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = sessionStorage.getItem("labpulse_user");
    return saved ? JSON.parse(saved) : null;
  });

  const login = useCallback(async (email, password) => {
    const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID;
    const region = import.meta.env.VITE_AWS_REGION || "ap-south-1";

    if (!clientId) {
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
    }

    // Real Cognito USER_PASSWORD_AUTH
    const url = `https://cognito-idp.${region}.amazonaws.com/`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-amz-json-1.1",
        "X-Amz-Target": "AWSCognitoIdentityProviderService.InitiateAuth"
      },
      body: JSON.stringify({
        AuthFlow: "USER_PASSWORD_AUTH",
        ClientId: clientId,
        AuthParameters: {
          USERNAME: email,
          PASSWORD: password
        }
      })
    });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.message || "Invalid email or password.");
    }

    const data = await resp.json();
    const idToken = data.AuthenticationResult.IdToken;

    // Parse JWT to extract claims (role, name)
    const claims = decodeJwt(idToken);
    if (!claims) {
      throw new Error("Authentication succeeded but failed to parse ID token.");
    }

    const groups = claims["cognito:groups"] || [];
    const role = groups.includes("admin") ? "admin" : "faculty";
    const name = claims["name"] || claims["email"] || email;

    const userData = { email: claims.email || email, name, role };
    sessionStorage.setItem("labpulse_user", JSON.stringify(userData));
    sessionStorage.setItem("labpulse_token", idToken);
    setUser(userData);
    return userData;
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem("labpulse_user");
    sessionStorage.removeItem("labpulse_token");
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
