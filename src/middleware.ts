import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { buildCsp } from "@/lib/csp";

// Routes reachable without a browser session.
const PUBLIC_PATHS = ["/login", "/auth/confirm"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Rig API authenticates with Bearer keys inside the route handlers.
  if (pathname.startsWith("/api/v1/")) return NextResponse.next();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce, supabaseUrl, process.env.NODE_ENV === "development");

  // Next.js reads the nonce from the request CSP header and applies it to its own scripts.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const next = () => {
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set("Content-Security-Policy", csp);
    return res;
  };

  let response = next();
  const supabase = createServerClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        requestHeaders.set("cookie", request.headers.get("cookie") ?? "");
        response = next();
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Verifies the JWT (and refreshes the session cookie when needed).
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!claims) {
    if (isPublic) return response;
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    return redirectTo(request, response, "/login", pathname);
  }

  if (pathname === "/login") return redirectTo(request, response, "/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, active")
    .eq("id", claims.sub)
    .maybeSingle();

  if (!profile || !profile.active) {
    await supabase.auth.signOut();
    return redirectTo(request, response, "/login?error=inactive");
  }

  return response;
}

function redirectTo(request: NextRequest, response: NextResponse, path: string, next?: string) {
  const url = request.nextUrl.clone();
  const [pathname, search] = path.split("?");
  url.pathname = pathname;
  url.search = search ? `?${search}` : "";
  if (next && next !== "/") url.searchParams.set("next", next);
  const redirect = NextResponse.redirect(url);
  // Carry refreshed auth cookies over to the redirect.
  for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}

export const config = {
  matcher: [
    // Everything except static assets and robots.txt.
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
