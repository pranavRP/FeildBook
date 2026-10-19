/** Builds a strict, nonce-based Content-Security-Policy. */
export function buildCsp(nonce: string, supabaseUrl: string, dev: boolean) {
  const supabase = new URL(supabaseUrl);
  const ws = `${supabase.protocol === "https:" ? "wss" : "ws"}://${supabase.host}`;
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(dev ? ["'unsafe-eval'"] : [])],
    // Inline style attributes are used by Radix/Recharts; no external styles are allowed.
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", supabase.origin],
    "font-src": ["'self'"],
    "connect-src": ["'self'", supabase.origin, ws],
    "frame-ancestors": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "object-src": ["'none'"],
  };
  if (!dev && supabase.protocol === "https:") directives["upgrade-insecure-requests"] = [];
  return Object.entries(directives)
    .map(([k, v]) => [k, ...v].join(" "))
    .join("; ");
}
