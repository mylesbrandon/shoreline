"use client";
import { useEffect, useRef } from "react";
import { drawTarget } from "../draw";
import styles from "./playtest.module.css";

/** The same person-in-life-ring canvas art used on the versus maps. */
export function PersonInWater() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = 66 * dpr;canvas.height = 66 * dpr;
    ctx.scale(dpr,dpr);
    drawTarget(ctx, { scale:66, ox:0, oy:0 }, { position:{x:.5,y:.6},rescueRadius:.3 }, 0);
  }, []);
  return <canvas ref={ref} className={styles.personArt} role="img" aria-label="Person waving in an orange life ring" />;
}
