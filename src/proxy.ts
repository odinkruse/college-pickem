import { NextResponse, type NextRequest } from "next/server";
import { isAdminAuthorization } from "@/lib/admin-auth";

// Proxy (Next 16's new name for middleware) runs before matching requests reach the app.
// Here it puts a browser password prompt in front of /admin and /picks (Phase 1: one player,
// no login; anyone with the URL could otherwise make picks as the owner).
export function proxy(request: NextRequest) {
  if (isAdminAuthorization(request.headers.get("authorization"))) {
    return NextResponse.next();
  }
  const configured = Boolean(process.env.ADMIN_PASSWORD);
  return new NextResponse(configured ? "Authentication required" : "ADMIN_PASSWORD is not set", {
    status: 401,
    headers: configured ? { "WWW-Authenticate": 'Basic realm="pickem-admin", charset="UTF-8"' } : {},
  });
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/picks", "/picks/:path*"],
};
