"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Calendar,
  LayoutDashboard,
  LogOut,
  Settings,
  UserRound,
} from "lucide-react";
import { api, STATUS_LABEL, type UserStatus } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const NAV = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Task Pool 업무풀" },
  { href: "/activity", icon: UserRound, label: "My Activity 내 활동" },
] as const;

const STATUSES: UserStatus[] = ["on", "away", "dnd", "off"];
const DOT: Record<UserStatus, string> = {
  on: "#22c55e",
  away: "#f59e0b",
  dnd: "#ef4444",
  off: "#9ca3af",
};

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout, refresh } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  const status = user?.status ?? "off";
  useEffect(() => {
    setMsg(user?.statusMessage ?? "");
  }, [user?.statusMessage]);

  async function changeStatus(s: UserStatus) {
    if (!user) return;
    setMenuOpen(false);
    try {
      await api.patch(`/users/${user.id}`, { status: s });
      await refresh();
    } catch {
      /* noop */
    }
  }
  async function saveMsg() {
    if (!user) return;
    setSaving(true);
    try {
      await api.patch(`/users/${user.id}`, { statusMessage: msg.trim() });
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  const item = (href: string, Icon: typeof Calendar, label: string, badge = 0) => (
    <Link
      key={href}
      href={href}
      title={badge > 0 ? `${label} · 안읽음 ${badge}` : label}
      className={`nav-item${pathname.startsWith(href) ? " active" : ""}`}
      style={{ position: "relative" }}
    >
      <Icon size={24} strokeWidth={2} />
      {badge > 0 && (
        <span
          style={{
            position: "absolute",
            top: 4,
            right: 4,
            minWidth: 17,
            height: 17,
            padding: "0 4px",
            borderRadius: 9,
            background: "#dc2626",
            color: "#fff",
            fontSize: 10,
            fontWeight: 700,
            display: "grid",
            placeItems: "center",
            border: "2px solid var(--ink)",
          }}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );

  return (
    <aside className="sidebar">
      <Link
        href={user?.isAdmin ? "/monitor" : "/activity"}
        className={`brand${pathname.startsWith(user?.isAdmin ? "/monitor" : "/activity") ? " active" : ""}`}
        title={user?.isAdmin ? "Status Board 현황판" : "My Activity 내 활동"}
        style={{ textDecoration: "none" }}
      >
        <div className="brand-mark" style={{ fontSize: 15 }}>TH</div>
      </Link>

      {/* 비관리자는 '내 활동'만 노출 */}
      {NAV.filter((n) => user?.isAdmin || n.href === "/activity").map((n) =>
        item(n.href, n.icon, n.label),
      )}

      {user?.isAdmin && (
        <>
          <div className="nav-div" />
          {item("/settings", Settings, "Settings 설정")}
        </>
      )}

      <div className="status-box" style={{ position: "relative", marginTop: "auto" }}>
        <button
          onClick={() => setMenuOpen((o) => !o)}
          title={user ? `${user.name} · ${user.statusMessage || STATUS_LABEL[status]}` : "내 상태"}
          style={{
            display: "grid",
            placeItems: "center",
            width: 44,
            height: 44,
            margin: "0 auto",
            borderRadius: "50%",
            background: user?.avatarColor ?? "#4f46e5",
            color: "#fff",
            fontWeight: 700,
            border: "none",
            cursor: "pointer",
            position: "relative",
          }}
        >
          {user ? user.name.slice(0, 1) : "나"}
          <span
            style={{
              position: "absolute",
              right: -1,
              bottom: -1,
              width: 12,
              height: 12,
              borderRadius: "50%",
              background: DOT[status],
              border: "2px solid var(--ink)",
            }}
          />
        </button>

        {menuOpen && (
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: "calc(100% + 8px)",
              width: 220,
              background: "var(--surface,#fff)",
              color: "var(--text-1)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              boxShadow: "0 8px 28px rgba(0,0,0,0.18)",
              zIndex: 60,
              padding: 6,
            }}
          >
            <div style={{ padding: "6px 10px", fontWeight: 700, fontSize: 13 }}>{user?.name}</div>
            {STATUSES.map((s) => (
              <div
                key={s}
                className="status-opt"
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", cursor: "pointer", fontSize: 13 }}
                onClick={() => changeStatus(s)}
              >
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: DOT[s] }} />
                {STATUS_LABEL[s]}
                {status === s && <span style={{ marginLeft: "auto" }}>✓</span>}
              </div>
            ))}
            <div style={{ borderTop: "1px solid var(--border)", padding: "8px 10px" }} onClick={(e) => e.stopPropagation()}>
              <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 4 }}>커스텀 상태</div>
              <div style={{ display: "flex", gap: 6 }}>
                <input className="inp" value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="예: 회의 중" style={{ flex: 1, fontSize: 12, padding: "4px 8px" }} />
                <button className="btn sm" onClick={saveMsg} disabled={saving}>{saving ? "…" : "저장"}</button>
              </div>
            </div>
            <div
              className="status-opt"
              style={{ display: "flex", alignItems: "center", gap: 8, borderTop: "1px solid var(--border)", padding: "9px 10px", color: "#dc2626", cursor: "pointer", fontSize: 13 }}
              onClick={() => logout()}
            >
              <LogOut size={16} /> 로그아웃
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
