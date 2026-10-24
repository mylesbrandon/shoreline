/**
 * Tiny external store so React can subscribe with useSyncExternalStore. No framework needed.
 * OWNER: Developer 2.
 */
export class Store<T> {
  private listeners = new Set<() => void>();
  constructor(private snapshot: T) {}

  get = (): T => this.snapshot;

  set(next: T): void {
    this.snapshot = next;
    for (const l of this.listeners) l();
  }

  update(fn: (prev: T) => T): void {
    this.set(fn(this.snapshot));
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
}
