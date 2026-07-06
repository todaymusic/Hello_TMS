import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// 인증 가드 (Next 16: middleware → proxy). tms_token 쿠키 없으면 /login 으로.
export function proxy(req: NextRequest) {
  const token = req.cookies.get("tms_token")?.value;
  const { pathname } = req.nextUrl;
  const isLogin = pathname === "/login";

  if (!token && !isLogin) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (token && isLogin) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/dashboard/:path*",
    "/monitor/:path*",
    "/activity/:path*",
    "/settings/:path*",
    "/login",
  ],
};
