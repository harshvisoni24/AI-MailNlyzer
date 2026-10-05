import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import ReactFlow, { Background, Controls, Edge, Node } from "reactflow";
import "reactflow/dist/style.css";
import { api } from "../lib/api";

interface GraphNode { id: string; type: string; label: string }
interface GraphEdge { source: string; target: string; relationship: string }

const NODE_COLORS: Record<string, string> = {
  EMAIL: "#22d3ee",
  SENDER: "#818cf8",
  IP: "#f97316",
  URL: "#ef4444",
  DOMAIN: "#eab308",
  CAMPAIGN: "#a855f7",
  CASE: "#22c55e",
};

function shortLabel(type: string, label: string): string {
  if (type === "URL") {
    try {
      const u = new URL(label);
      const path = u.pathname.length > 1 ? u.pathname : "";
      const text = u.hostname + path;
      return text.length > 30 ? text.slice(0, 29) + "…" : text;
    } catch {
      /* not a valid URL, fall through */
    }
  }
  return label.length > 30 ? label.slice(0, 29) + "…" : label;
}

export default function ThreatGraphPage() {
  const [params] = useSearchParams();
  const emailId = params.get("emailId");
  const [graph, setGraph] = useState<{ nodes: GraphNode[]; edges: GraphEdge[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!emailId) return;
    api
      .get(`/campaigns/threat-graph?emailId=${emailId}`)
      .then((res) => setGraph(res.data))
      .catch(() => setError("Could not load threat graph for this email."));
  }, [emailId]);

  const { nodes, edges } = useMemo(() => {
    if (!graph) return { nodes: [] as Node[], edges: [] as Edge[] };

    const order = ["SENDER", "IP", "DOMAIN", "URL", "CAMPAIGN", "CASE"];
    const rank = (t: string) => (order.indexOf(t) === -1 ? order.length : order.indexOf(t));
    const emails = graph.nodes.filter((n) => n.type === "EMAIL");
    const outer = graph.nodes
      .filter((n) => n.type !== "EMAIL")
      .sort((a, b) => rank(a.type) - rank(b.type));

    const radius = Math.max(320, outer.length * 34);
    const positions = new Map<string, { x: number; y: number }>();
    emails.forEach((n, i) => positions.set(n.id, { x: -90, y: -22 + i * 70 }));
    outer.forEach((n, i) => {
      const angle = (i / outer.length) * Math.PI * 2 - Math.PI / 2;
      positions.set(n.id, {
        x: radius * Math.cos(angle) - 90,
        y: radius * Math.sin(angle) - 22,
      });
    });

    const nodes: Node[] = graph.nodes.map((n) => {
      const color = NODE_COLORS[n.type] ?? "#334155";
      return {
        id: n.id,
        position: positions.get(n.id) ?? { x: 0, y: 0 },
        data: {
          label: (
            <div title={n.label} style={{ textAlign: "left" }}>
              <div style={{ color, fontSize: 9, fontWeight: 700, letterSpacing: 0.5 }}>{n.type}</div>
              <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {shortLabel(n.type, n.label)}
              </div>
            </div>
          ),
        },
        style: {
          background: "#0f1520",
          border: `1px solid ${color}`,
          color: "#e2e8f0",
          borderRadius: 8,
          fontSize: 11,
          padding: "6px 10px",
          width: 180,
        },
      };
    });

    const edges: Edge[] = graph.edges.map((e, i) => ({
      id: `e-${i}`,
      source: e.source,
      target: e.target,
      type: "straight",
      label: e.relationship === "OBSERVED_IN" ? undefined : e.relationship.replace(/_/g, " "),
      style: { stroke: "#334155" },
      labelStyle: { fill: "#94a3b8", fontSize: 10 },
      labelBgStyle: { fill: "#0b1018" },
    }));

    return { nodes, edges };
  }, [graph]);

  if (!emailId) {
    return <div className="p-8 text-slate-500">Select an email from Investigate → All Emails to view its threat graph.</div>;
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-8 py-5 border-b border-forensic-border">
        <h1 className="text-xl font-semibold text-slate-100">Interactive Threat Graph</h1>
        <p className="text-sm text-slate-500">Nodes: email, sender, IPs, domains, URLs, campaigns, case. Hover a node to see its full value.</p>
      </div>
      {error && <div className="p-6 text-red-400 text-sm">{error}</div>}
      <div className="flex-1 relative">
        <ReactFlow nodes={nodes} edges={edges} fitView fitViewOptions={{ padding: 0.2 }} minZoom={0.1}>
          <Background color="#1e2733" gap={24} />
          <Controls />
        </ReactFlow>
        <div
          className="absolute top-3 left-3 z-10 flex flex-wrap gap-3 rounded-md border border-forensic-border px-3 py-2 text-xs text-slate-300"
          style={{ background: "rgba(11,16,24,0.9)" }}
        >
          {Object.entries(NODE_COLORS).map(([t, c]) => (
            <span key={t} className="flex items-center gap-1">
              <span style={{ background: c }} className="inline-block h-2 w-2 rounded-full" />
              {t}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}