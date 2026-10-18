/**
 * Keeps a free Render web service awake by calling its own PUBLIC URL every few minutes.
 * (Render sleeps a free service after ~15 minutes without inbound traffic; requests to
 * localhost don't count, so the call has to go out through Render's public address.)
 *
 * Settings (all optional):
 *   KEEP_ALIVE_URL               public base URL to ping; defaults to Render's RENDER_EXTERNAL_URL
 *   KEEP_ALIVE_INTERVAL_MINUTES  how often to ping (default 10, minimum 1)
 *   KEEP_ALIVE=off               turn it off
 * Locally neither URL is set, so nothing runs.
 */
const PATH = "/api/keep-alive";

export function startKeepAlive() {
  const base = (process.env.KEEP_ALIVE_URL || process.env.RENDER_EXTERNAL_URL || "").replace(/\/+$/, "");
  if (!base || process.env.KEEP_ALIVE === "off") return null;

  const minutes = Math.max(1, Number(process.env.KEEP_ALIVE_INTERVAL_MINUTES) || 10);
  const url = `${base}${PATH}`;
  let failures = 0;

  const ping = async () => {
    try {
      const res = await fetch(url, { headers: { "user-agent": "dharshak-manch-keep-alive" }, signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (failures) console.log(`Keep-alive working again (${url})`);
      failures = 0;
    } catch (err) {
      failures += 1;
      // Log the first failure and then every 6th, so a long outage doesn't flood the logs.
      if (failures === 1 || failures % 6 === 0) console.warn(`Keep-alive ping failed (${failures}x): ${err.message}`);
    }
  };

  const timer = setInterval(ping, minutes * 60_000);
  timer.unref(); // never keeps the process alive on its own (clean shutdowns)
  console.log(`Keep-alive: pinging ${url} every ${minutes} min`);
  return timer;
}
