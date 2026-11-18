/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  // badge-${level} is built at runtime, so Tailwind cannot see these class names in the source
  safelist: ["badge-critical", "badge-high", "badge-medium", "badge-low", "badge-neutral"],
  theme: {
    extend: {
      colors: {
        slate: { 400: "#a3b5d3", 500: "#8397ba", 600: "#6a7fa6" },
        forensic: {
          bg: "#040a18",
          panel: "#081226",
          border: "#12284a",
          accent: "#22d3ee",
          accent2: "#818cf8",
          critical: "#ef4444",
          high: "#f97316",
          medium: "#eab308",
          low: "#22c55e",
        },
      },
      fontFamily: {
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
        sans: ["Inter", "ui-sans-serif", "system-ui"],
      },
      boxShadow: {
        glow: "0 0 24px -6px rgba(34,211,238,0.35)",
        "glow-red": "0 0 24px -6px rgba(239,68,68,0.35)",
      },
      keyframes: {
        "pulse-dot": {
          "0%,100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.5", transform: "scale(1.4)" },
        },
      },
      animation: { "pulse-dot": "pulse-dot 1.8s ease-in-out infinite" },
    },
  },
  plugins: [],
};
