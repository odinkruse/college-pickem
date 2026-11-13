import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Proxy (Next 16's name for middleware) runs before every matched request. It does two things:
//  1. Keeps the Supabase session fresh: if the access token in the cookie has expired, the refresh
//     happens here and the new cookies are written to both the request (so the page sees them) and
//     the response (so the browser keeps them). Server Components can't write cookies themselves.
//  2. Sends signed-out visitors on /picks or /admin to /login. Whether someone is an *admin* is
//     checked in the admin layout and in every admin Server Action (that needs a database lookup).

const PROTECTED = ["/picks", "/admin"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet, headers) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers ?? {})) response.headers.set(key, value);
      },
    },
  });

  // Must run before anything else reads the session: it validates (and if needed refreshes) it.
  const { data } = await supabase.auth.getClaims();

  const path = request.nextUrl.pathname;
  if (!data?.claims && PROTECTED.some((p) => path === p || path.startsWith(`${p}/`))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  // Everything except static assets and the cron endpoint (which has its own bearer secret).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
