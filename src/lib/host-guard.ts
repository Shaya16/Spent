// The app serves localhost by default. Rejecting any other Host header defeats DNS rebinding,
// where a hostile site's name is pointed at 127.0.0.1 so the browser treats this app as same-origin.
// Self-hosters who reach the app by another name (home server, LAN IP) list it in SPENT_ALLOWED_HOSTS.
const ALLOWED = new Set(["127.0.0.1", "localhost", "[::1]", "spent.localhost"]);

const fromEnv = (process.env.SPENT_ALLOWED_HOSTS ?? "")
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

export function isAllowedHost(host: string | null, extra: string[] = fromEnv): boolean {
  if (!host) return false;
  const name = (host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0]).toLowerCase();
  return ALLOWED.has(name) || extra.some((h) => h.toLowerCase() === name);
}
