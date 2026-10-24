"use client";
/**
 * Square, responsive, DPI-aware ocean canvas. OWNER: Developer 3.
 *
 * Renders whatever scene it is given on every animation frame. It knows nothing about networking
 * or rules. TODO(dev3): interpolate boat position/heading between successive `scene.boat` values
 * (views arrive at ~10 Hz; render at 60 fps, NETWORK.interpolationDelayMs behind).
 */
import { useEffect, useRef } from "react";
import { drawScene, type OceanScene } from "./draw";

export interface OceanCanvasProps extends OceanScene {
  className?: string;
  /** Optional tap handler in normalized map coordinates (e.g. sonar marking). */
  onTapMap?: (position: { x: number; y: number }) => void;
}

export function OceanCanvas({ className = "", onTapMap, ...scene }: OceanCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<OceanScene>(scene);

  // Latest props for the render loop (written after render, read in rAF).
  useEffect(() => {
    sceneRef.current = scene;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

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
      if (size > 0) drawScene(ctx, size, sceneRef.current, now);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={`block aspect-square w-full touch-none rounded-2xl ${className}`}
      onPointerDown={
        onTapMap
          ? (e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              onTapMap({ x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height });
            }
          : undefined
      }
    />
  );
}
