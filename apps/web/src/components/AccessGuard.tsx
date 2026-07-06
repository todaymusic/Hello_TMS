"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

// 비관리자는 hellotms에서 '내 활동'만 사용 가능.
// 관리자 전용 라우트 접근 시 /activity 로 되돌린다.
const ADMIN_ONLY_PREFIXES = ["/dashboard", "/monitor", "/settings"];

export default function AccessGuard() {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (loading || !user) return;
    if (
      !user.isAdmin &&
      ADMIN_ONLY_PREFIXES.some((p) => pathname.startsWith(p))
    ) {
      router.replace("/activity");
    }
  }, [user, loading, pathname, router]);

  return null;
}
