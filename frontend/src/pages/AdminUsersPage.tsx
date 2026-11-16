import { useEffect, useState } from "react";
import { api } from "../lib/api";

const ROLES = ["ADMIN", "SECURITY_ANALYST", "INVESTIGATOR", "VIEWER"];

export default function AdminUsersPage() {
  const [users, setUsers] = useState<any[]>([]);

  function load() {
    api.get("/users").then((res) => setUsers(res.data));
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
    <div className="p-5 max-w-[1500px] mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-white">Administration — Users & Roles</h1>
      <div className="panel divide-y divide-forensic-border">
        {users.map((u) => (
          <div key={u.id} className="p-4 flex items-center justify-between">
            <div>
              <div className="text-sm text-slate-200">{u.fullName}</div>
              <div className="text-xs text-slate-500">{u.email}</div>
            </div>
            <div className="flex items-center gap-3">
              <select className="input" value={u.role} onChange={(e) => changeRole(u.id, e.target.value)}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <button className="btn-secondary text-xs" onClick={() => toggleActive(u.id, u.isActive)}>
                {u.isActive ? "Deactivate" : "Activate"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
