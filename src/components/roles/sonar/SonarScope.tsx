"use client";
/**
 * Circular boat-centered sonar well. OWNER: Developer 4.
 * Taps emit a world-space position; the parent decides whether to send MARK_HAZARD.
 */
import { useEffect, useRef } from "react";
import type { PointerEvent } from "react";
import type { SonarView, Vec2 } from "@/game/types";
import { drawSonarScope, type ScopeRipple } from "./draw-scope";
import { scopeToWorld, tapInWell } from "./scope-coords";

export interface SonarScopeProps {
  view: SonarView;
  onMark: (position: Vec2) => void;
  disabled?: boolean;
}

export function SonarScope({ view, onMark, disabled = false }: SonarScopeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef(view);
  const ripplesRef = useRef<ScopeRipple[]>([]);

  useEffect(() => {
    viewRef.current = view;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let size = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      size = rect.width;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.width * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let raf = 0;
    const loop = (now: number) => {
      ripplesRef.current = ripplesRef.current.filter((r) => now - r.bornMs < 420);
      if (size > 0) drawSonarScope(ctx, size, viewRef.current, now, ripplesRef.current, reducedMotion);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  const handlePointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const tap = {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
    if (!tapInWell(tap)) return;
    const position = scopeToWorld(tap, view.boat.position);
    ripplesRef.current = [...ripplesRef.current, { position, bornMs: performance.now() }];
    onMark(position);
  };

  return (
    <canvas
      ref={canvasRef}
      className="block aspect-square w-full touch-none rounded-full"
      role="img"
      aria-label="Drone radar. Land, jellies, and people. Tap to mark a hazard for the Driver."
      onPointerDown={handlePointerDown}
    />
  );
}
