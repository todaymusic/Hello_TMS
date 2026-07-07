"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

// 비관리자는 hellotms에서 '내 활동'만 사용 가능.
// 관리자 전용 라우트는 자식(페이지)을 아예 렌더하지 않아 데이터 요청·순간 노출을 막고 /activity 로 되돌린다.
const ADMIN_ONLY_PREFIXES = ["/dashboard", "/monitor", "/settings"];

export default function AccessGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const isAdminRoute = ADMIN_ONLY_PREFIXES.some((p) => pathname.startsWith(p));
  const blocked = isAdminRoute && !loading && !!user && !user.isAdmin;

  useEffect(() => {
    if (blocked) router.replace("/activity");
  }, [blocked, router]);

  // 관리자 라우트에서는 권한 확인 전(loading)이거나 비관리자면 자식을 렌더하지 않는다.
  // → 관리자 페이지 컴포넌트가 마운트되지 않으므로 fetch 효과가 실행되지 않고, 화면 순간 노출도 없다.
  if (isAdminRoute && (loading || !user || !user.isAdmin)) {
    return null;
  }
  return <>{children}</>;
}
