import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";

export default function CampaignDetailPage() {
  const { id } = useParams();
  const [campaign, setCampaign] = useState<any>(null);

  useEffect(() => {
    api.get(`/campaigns/${id}`).then((res) => setCampaign(res.data));
  }, [id]);

  if (!campaign) return <div className="p-8 text-slate-500">Loading campaign…</div>;

  return (
    <div className="p-5 max-w-[1500px] mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-white">{campaign.name}</h1>
      <p className="text-sm text-slate-500">{campaign.description}</p>
      <div className="panel p-5">
        <h2 className="text-sm font-semibold text-slate-200 mb-3">Member Emails</h2>
        <ul className="space-y-1 text-sm">
          {campaign.members.filter((m: any) => m.email).map((m: any) => (
            <li key={m.id} className="text-slate-300 border-b border-forensic-border/50 py-1">{m.email.subject}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
