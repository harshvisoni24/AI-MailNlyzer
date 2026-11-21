import { useState } from "react";

export default function SettingsPage() {
  const [retention, setRetention] = useState("90");

  return (
    <div className="p-5 w-full space-y-6">
      <h1 className="text-2xl font-bold text-white">Settings</h1>
      <div className="panel p-5 space-y-4">
        <div>
          <label className="text-xs text-slate-500 block mb-1">Data Retention Period</label>
          <select className="input" value={retention} onChange={(e) => setRetention(e.target.value)}>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
            <option value="180">180 days</option>
            <option value="custom">Custom</option>
          </select>
          <p className="text-xs text-slate-600 mt-2">
            Configure RETENTION_DEFAULT_DAYS in the backend .env to enforce this at the infrastructure level.
          </p>
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">Privacy</label>
          <p className="text-xs text-slate-500">
            Sensitive fields such as recipient email addresses are masked (e.g. ha****@example.com) for roles below Investigator
            in report exports. Configure per-role visibility in Administration.
          </p>
        </div>
      </div>
    </div>
  );
}
