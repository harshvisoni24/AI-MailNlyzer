import { useEffect, useState } from "react";
import { Lock, Users } from "lucide-react";
import { api } from "../lib/api";
import PageHero, { PageShell } from "../components/PageHero";

const ROLES = ["ADMIN", "SECURITY_ANALYST", "INVESTIGATOR", "VIEWER"];

export default function AdminUsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api
      .get("/users")
      .then((res) => { setUsers(res.data); setError(null); })
      .catch((err) =>
        setError(
          err.response?.status === 403
            ? "Only users with the ADMIN role can view and manage users. Sign in with an admin account to use this page."
            : "Could not load users. Check that the backend is running."
        )
      );
  }
  useEffect(load, []);

  async function changeRole(id: string, roleName: string) {
    await api.patch(`/users/${id}`, { roleName });
    load();
  }

  async function toggleActive(id: string, isActive: boolean) {
    await api.patch(`/users/${id}`, { isActive: !isActive });
    load();
  }

  return (
    <PageShell>
      <PageHero
        icon={<Users size={60} strokeWidth={1.5} />}
        title="Administration Users"
        subtitle="Manage user accounts, roles and access"
      />

      {error && (
        <div className="glow-panel p-5 flex items-start gap-3 text-[15px] text-amber-200 border-amber-400/60">
          <Lock size={22} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      {!error && (
        <div className="glow-panel divide-y divide-sky-500/20">
          {users.map((u) => (
            <div key={u.id} className="p-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[15px] font-medium text-white">{u.fullName}</div>
                <div className="text-xs text-slate-300 truncate">{u.email}</div>
              </div>
              <div className="flex items-center gap-3">
                <select className="input !w-auto" value={u.role} onChange={(e) => changeRole(u.id, e.target.value)}>
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <button className="btn-secondary text-xs" onClick={() => toggleActive(u.id, u.isActive)}>
                  {u.isActive ? "Deactivate" : "Activate"}
                </button>
              </div>
            </div>
          ))}
          {users.length === 0 && <p className="p-5 text-sm text-slate-400">No users found.</p>}
        </div>
      )}
    </PageShell>
  );
}
