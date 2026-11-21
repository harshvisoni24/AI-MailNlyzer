/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  // badge-${level} is built at runtime, so Tailwind cannot see these class names in the source
  safelist: ["badge-critical", "badge-high", "badge-medium", "badge-low", "badge-neutral"],
  theme: {
    extend: {
      colors: {
        slate: {
          100: "rgb(var(--s100) / <alpha-value>)",
          200: "rgb(var(--s200) / <alpha-value>)",
          300: "rgb(var(--s300) / <alpha-value>)",
          400: "rgb(var(--s400) / <alpha-value>)",
          500: "rgb(var(--s500) / <alpha-value>)",
          600: "rgb(var(--s600) / <alpha-value>)",
        },
        forensic: {
          bg: "rgb(var(--f-bg) / <alpha-value>)",
          panel: "rgb(var(--f-panel) / <alpha-value>)",
          border: "rgb(var(--f-border) / <alpha-value>)",
          accent: "rgb(var(--f-accent) / <alpha-value>)",
          accent2: "rgb(var(--f-accent2) / <alpha-value>)",
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