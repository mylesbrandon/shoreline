/**
 * Test helper: wait until `condition()` holds, polling every 5 ms, instead of a fixed sleep that
 * flakes on a busy machine. Used by the session integration tests only.
 */
export async function waitFor(condition: () => boolean, what: string, timeoutMs = 1_000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timed out after ${timeoutMs} ms waiting for: ${what}`);
    await new Promise((r) => setTimeout(r, 5));
  }
}
