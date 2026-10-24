"use client";
/**
 * React bindings for sessions. OWNER: Developer 2.
 */
import { useSyncExternalStore } from "react";
import type { Store } from "./store";

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

const noopSubscribe = () => () => {};

/** window.location.origin without hydration mismatches ("" during SSR). */
export function useOrigin(): string {
  return useSyncExternalStore(
    noopSubscribe,
    () => window.location.origin,
    () => "",
  );
}
