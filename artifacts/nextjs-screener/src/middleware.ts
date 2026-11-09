import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { checkRateLimit } from "@/lib/rate-limit";

const MAX_REQUEST_BODY_BYTES = 64 * 1024;

function getClientIp(request: Request): string {
  const headers = request.headers;
  return (
    headers.get("x-nf-client-connection-ip") ??
    headers.get("cf-connecting-ip") ??
    headers.get("x-real-ip") ??
    (process.env.TRUST_PROXY === "true"
      ? headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      : undefined) ??
    "unknown"
  );
}

export default auth(async (request) => {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");

  if (isApi) {
    const isAuthRoute = pathname.startsWith("/api/auth/");
    if (!isAuthRoute && !request.auth) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    if (!isAuthRoute && ["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
      const origin = request.headers.get("origin");
      if (origin && origin !== request.nextUrl.origin) {
        return NextResponse.json({ error: "Cross-origin request refused" }, { status: 403 });
      }
      if (request.headers.get("sec-fetch-site") === "cross-site") {
        return NextResponse.json({ error: "Cross-origin request refused" }, { status: 403 });
      }
      if (
        request.method !== "DELETE" &&
        !(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")
      ) {
        return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
      }
      const contentLength = Number(request.headers.get("content-length"));
      if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BODY_BYTES) {
        return NextResponse.json({ error: "Request body is too large" }, { status: 413 });
      }
    }

    try {
      const credentialsCallback =
        pathname === "/api/auth/callback/credentials";
      const result = await checkRateLimit(
        `${credentialsCallback ? "auth" : "api"}:${getClientIp(request)}`,
        credentialsCallback ? 10 : 120,
        60,
      );
      if (!result.configured) {
        return NextResponse.json(
          { error: "Shared rate limiting is not configured" },
          { status: 503 },
        );
      }
      if (!result.success) {
        return NextResponse.json(
          { error: "Too many requests" },
          {
            status: 429,
            headers: { "Retry-After": String(Math.max(1, Math.ceil((result.reset - Date.now()) / 1000))) },
          },
        );
      }
    } catch (error) {
      console.error("Shared rate limiter request failed", error);
      return NextResponse.json(
        { error: "Request protection is temporarily unavailable" },
        { status: 503 },
      );
    }

    return NextResponse.next();
  }

  if (!request.auth) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|favicon.svg|robots.txt|opengraph.jpg|login).*)"],
};
