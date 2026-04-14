import { NextRequest, NextResponse } from "next/server";

// Next.js 16 "proxy" (formerly middleware) runs at the edge before routing
// and cache, so it intercepts every request — including prerendered pages
// served from the Vercel edge cache. Use it to 308-redirect the non-canonical
// .com host to horpen.ai.
export function proxy(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  if (host === "horpen.com" || host === "www.horpen.com") {
    const url = new URL(req.url);
    url.host = "horpen.ai";
    url.protocol = "https:";
    url.port = "";
    return NextResponse.redirect(url, 308);
  }
  return NextResponse.next();
}

export const config = {
  // Match everything except Next.js internal paths and common asset extensions.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|json)).*)",
  ],
};
