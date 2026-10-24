"use client";
import { useEffect, useRef } from "react";
import { NETWORK } from "@/game/config";
import { drawScene, type OceanScene } from "./draw";
import { interpolateBoat, type BoatSample } from "./interpolation";

export interface OceanCanvasProps extends OceanScene {
  className?: string;
  gameId?: string;
  onTapMap?: (position: { x: number; y: number }) => void;
}

export function OceanCanvas({ className = "", onTapMap, gameId, ...scene }: OceanCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<OceanScene>(scene);
  const samples = useRef<BoatSample[]>([]);
  const previousGame = useRef(gameId);

  useEffect(() => {
    sceneRef.current = scene;
    if (previousGame.current !== gameId) {
      samples.current = [];
      previousGame.current = gameId;
    }
    if (samples.current.at(-1)?.boat !== scene.boat) {
      samples.current = [...samples.current, { boat: scene.boat, at: performance.now() }].slice(-32);
    }
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let size = 0;
    let dpr = 0;
    const resize = () => {
      size = canvas.clientWidth;
      dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(size * dpr);
      canvas.height = Math.round(size * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0;
    const loop = (now: number) => {
      if (dpr !== (window.devicePixelRatio || 1)) resize();
      const boat = interpolateBoat(samples.current, now - NETWORK.interpolationDelayMs) ?? sceneRef.current.boat;
      if (size > 0) drawScene(ctx, size, { ...sceneRef.current, boat }, media.matches ? 0 : now);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); observer.disconnect(); };
  }, []);

  return <canvas ref={canvasRef} role="img" aria-label="Ocean chart showing rescue boat, visible hazards, shared markers and current"
    className={`block aspect-square w-full touch-none rounded-2xl ${className}`}
    onPointerDown={onTapMap ? (e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      onTapMap({ x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)) });
    } : undefined} />;
}

