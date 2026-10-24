/**
 * SERVER-ONLY helper. OWNER: Developer 2.
 *
 * In `npm run dev:lan`, the host usually opens http://localhost:3000, but a QR code pointing at
 * "localhost" sends a phone to ITSELF. This returns http://<laptop Wi-Fi IP>:<port> so the join QR
 * works. Returns null in production (the deployed origin is already reachable) or if no IP is found.
 */
import { networkInterfaces } from "node:os";

function isPrivateIPv4(ip: string): boolean {
  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
}

export function devLanOrigin(hostHeader: string | null): string | null {
  if (process.env.NODE_ENV !== "development") return null;
  const port = hostHeader?.split(":")[1] ?? "3000";
  const candidates: { name: string; address: string }[] = [];
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === "IPv4" && !a.internal && isPrivateIPv4(a.address)) candidates.push({ name, address: a.address });
    }
  }
  // Prefer Wi-Fi/Ethernet (en*, eth*, wlan*) over VPN/bridge/virtual adapters.
  const best = candidates.find((c) => /^(en|eth|wlan|wl)/.test(c.name)) ?? candidates[0];
  return best ? `http://${best.address}:${port}` : null;
}
