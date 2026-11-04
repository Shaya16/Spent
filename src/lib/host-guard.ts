// The app only ever serves localhost. Rejecting any other Host header defeats DNS rebinding,
// where a hostile site's name is pointed at 127.0.0.1 so the browser treats this app as same-origin.
const ALLOWED = new Set(["127.0.0.1", "localhost", "[::1]", "spent.localhost"]);

export function isAllowedHost(host: string | null): boolean {
  if (!host) return false;
  const name = host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0];
  return ALLOWED.has(name.toLowerCase());
}
