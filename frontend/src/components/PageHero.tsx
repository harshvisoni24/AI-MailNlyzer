import { ReactNode } from "react";

/** Full-width page wrapper with the glowing wave background used by the neon pages. */
export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="page-waves min-h-full">
      <div className="p-5 max-w-[1500px] mx-auto space-y-5">{children}</div>
    </div>
  );
}

interface HeroProps {
  /** Icon element shown in the glowing tile on the left */
  icon: ReactNode;
  /** Title text. The last word is shown in cyan. */
  title: string;
  subtitle?: string;
  /** Optional element on the right (button, artwork) */
  right?: ReactNode;
}

/** Page header: icon tile, two-tone title, subtitle and the dotted world map behind it. */
export default function PageHero({ icon, title, subtitle, right }: HeroProps) {
  const words = title.trim().split(" ");
  const accent = words.length > 1 ? words.pop() : null;
  const lead = words.join(" ");

  return (
    <div className="relative overflow-hidden min-h-[120px] flex items-center justify-between gap-4">
      <img
        src="/hero-map.svg"
        alt=""
        aria-hidden
        className="pointer-events-none select-none absolute right-[6%] top-1/2 -translate-y-[46%] h-[210%] w-[52%] object-contain opacity-90 hidden md:block"
        style={{ maskImage: "linear-gradient(to right, transparent, #000 22%, #000 78%, transparent)", WebkitMaskImage: "linear-gradient(to right, transparent, #000 22%, #000 78%, transparent)" }}
      />
      <div className="relative z-10 flex items-center gap-5 min-w-0">
        <div className="hero-icon shrink-0">{icon}</div>
        <span className="hidden sm:block h-[72px] w-px bg-gradient-to-b from-transparent via-sky-400/50 to-transparent" />
        <div className="min-w-0">
          <h1 className="text-[34px] leading-tight font-bold tracking-tight text-white">
            {lead}
            {accent && <span className="text-cyan-400">{lead ? " " : ""}{accent}</span>}
          </h1>
          {subtitle && <p className="text-[14px] text-slate-200/90 mt-1 max-w-[560px]">{subtitle}</p>}
        </div>
      </div>
      {right && <div className="relative z-10 shrink-0">{right}</div>}
    </div>
  );
}
