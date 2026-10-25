"use client";
/**
 * End-of-match beach landing. OWNER: Developer 3.
 * Both skis glide in to their docks, the rescued people step off one by one onto the sand, and
 * each crew's count ticks up as they land (timing in ./landing). SVG + CSS only; with reduced
 * motion the finished scene shows at once.
 */
import { useEffect, useState } from "react";
import { TEAMS, type TeamId } from "@/game/versus/contract";
import { TEAM_INFO } from "@/components/shared/teams";
import { LANDING, landedBy, revealAt, stepOffAt } from "./landing";

const W = 360;
const H = 150;
const SHORE_Y = 64;
const DOCK_X: Record<TeamId, number> = { blue: 96, red: 264 };
/** Where the people line up on each crew's half of the sand. */
const SLOTS = { cols: 5, gapX: 27, rowY: 90, gapY: 21, x0: { blue: 30, red: 210 } as Record<TeamId, number> };
/** People are drawn this much bigger than the ski so they read on a phone. */
const PERSON_SCALE = 1.55;
const SKIN = ["#ffdec0", "#e8b48a", "#c68b5e", "#8d5a3b"];
const SWIMSUIT = ["#ff8a3d", "#f472b6", "#a78bfa", "#facc15", "#34d399", "#fb7185"];

function slot(team: TeamId, i: number) {
  return { x: SLOTS.x0[team] + (i % SLOTS.cols) * SLOTS.gapX, y: SLOTS.rowY + Math.floor(i / SLOTS.cols) * SLOTS.gapY };
}

export function BeachLanding({ rescues }: { rescues: Record<TeamId, number> }) {
  const [elapsed, setElapsed] = useState(0);
  const done = revealAt(rescues.blue, rescues.red);

  // One clock drives the counters; the walking itself is CSS, so it stays smooth.
  useEffect(() => {
    let raf = 0;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      raf = requestAnimationFrame(() => setElapsed(done));
      return () => cancelAnimationFrame(raf);
    }
    const start = performance.now();
    const tick = () => {
      const t = performance.now() - start;
      setElapsed(t);
      if (t < done) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [done]);

  return (
    <div className="landing" aria-label={`${TEAM_INFO.blue.label} brought in ${rescues.blue}, ${TEAM_INFO.red.label} brought in ${rescues.red}`}>
      <svg viewBox={`0 0 ${W} ${H}`} className="landing-scene" role="img" aria-hidden>
        <rect width={W} height={SHORE_Y + 4} fill="#0f8a96" />
        <path d={`M0 22 Q 30 16 60 22 T 120 22 T 180 22 T 240 22 T 300 22 T 360 22`} stroke="#fffdf6" strokeOpacity=".35" fill="none" />
        <path d={`M0 42 Q 30 36 60 42 T 120 42 T 180 42 T 240 42 T 300 42 T 360 42`} stroke="#fffdf6" strokeOpacity=".25" fill="none" />
        <rect y={SHORE_Y} width={W} height={H - SHORE_Y} fill="#f2c879" />
        <path
          d={`M0 ${SHORE_Y} ${Array.from({ length: 13 }, (_, k) => `Q ${k * 30 + 15} ${SHORE_Y + 7} ${k * 30 + 30} ${SHORE_Y}`).join(" ")}`}
          fill="#fffdf6"
          fillOpacity=".85"
        />
        {TEAMS.map((team) => (
          <g key={team}>
            {/* Dock: planks from the sand out into the water. */}
            <rect x={DOCK_X[team] - 9} y={30} width={18} height={SHORE_Y - 30 + 14} fill="#b89160" stroke="#61472e" strokeWidth="1" />
            {[36, 44, 52, 60, 68].map((y) => (
              <line key={y} x1={DOCK_X[team] - 9} x2={DOCK_X[team] + 9} y1={y} y2={y} stroke="#61472e" strokeWidth=".8" />
            ))}
            {/* The crew's ski, gliding in beside its dock. */}
            <g transform={`translate(${DOCK_X[team] + 18} 40)`}>
              <g className="landing-ski">
                <path d="M0 -10 C 5 -4 6 4 4 10 L -4 10 C -6 4 -5 -4 0 -10 Z" fill={TEAM_INFO[team].hex} stroke="#073f4d" strokeWidth="1.2" />
                <rect x="-2.5" y="0" width="5" height="4" rx="1" fill="#073f4d" />
              </g>
            </g>
            {/* People stepping off, one by one. */}
            {Array.from({ length: Math.min(rescues[team], LANDING.maxDrawn) }, (_, i) => {
              const to = slot(team, i);
              const from = { x: DOCK_X[team] + 18 - to.x, y: 48 - to.y };
              return (
                <g key={i} transform={`translate(${to.x} ${to.y})`}>
                  <g
                    className="landing-walker"
                    style={{
                      ["--from-x" as string]: `${from.x}px`,
                      ["--from-y" as string]: `${from.y}px`,
                      animationDelay: `${stepOffAt(i, rescues[team])}ms`,
                      animationDuration: `${LANDING.walkMs}ms`,
                    }}
                  >
                    <g transform={`scale(${PERSON_SCALE})`}>
                    <ellipse cx="0" cy="6" rx="4" ry="1.4" fill="#000" opacity=".15" />
                    <rect x="-2.6" y="-3" width="5.2" height="7" rx="2" fill={SWIMSUIT[(i + (team === "red" ? 3 : 0)) % SWIMSUIT.length]} />
                    <line x1="-1.3" y1="4" x2="-1.6" y2="6" stroke="#5b3a29" strokeWidth="1.2" />
                    <line x1="1.3" y1="4" x2="1.6" y2="6" stroke="#5b3a29" strokeWidth="1.2" />
                    <circle cx="0" cy="-5.6" r="2.6" fill={SKIN[i % SKIN.length]} />
                    </g>
                  </g>
                </g>
              );
            })}
          </g>
        ))}
      </svg>
      <div className="landing-counts">
        {TEAMS.map((team) => {
          const shown = landedBy(elapsed, rescues[team]);
          return (
            <p key={team} style={{ color: TEAM_INFO[team].hex }}>
              <strong className="font-poster" key={shown}>{shown}</strong>
              <span>{TEAM_INFO[team].label} brought in</span>
            </p>
          );
        })}
      </div>
    </div>
  );
}
