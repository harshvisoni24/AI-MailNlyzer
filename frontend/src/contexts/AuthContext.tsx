import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api } from "../lib/api";
import { AuthUser } from "../types";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("ai_mailnlyzer_user");
    if (stored) {
      setUser(JSON.parse(stored));
    }
    setLoading(false);
  }, []);

  async function login(email: string, password: string) {
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.setItem("ai_mailnlyzer_token", data.token);
    localStorage.setItem("ai_mailnlyzer_user", JSON.stringify(data.user));
    setUser(data.user);
  }

  async function logout() {
    await api.post("/auth/logout").catch(() => undefined);
    localStorage.removeItem("ai_mailnlyzer_token");
    localStorage.removeItem("ai_mailnlyzer_user");
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
