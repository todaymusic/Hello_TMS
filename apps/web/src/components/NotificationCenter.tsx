"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Notif = {
  id: string;
  type: string;
  content: string;
  link: string | null;
  read: boolean;
  createdAt: string;
};

const IC: Record<string, string> = {
  mention: "@",
  task: "📋",
  dm: "💬",
  system: "⚠️",
};

function urlB64ToUint8(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function ago(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

export default function NotificationCenter() {
  const { user: me } = useAuth();
  const router = useRouter();
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);
  const [toasts, setToasts] = useState<Notif[]>([]);
  const [perm, setPerm] = useState<NotificationPermission>("default");
  const seen = useRef<Set<string>>(new Set());
  const seeded = useRef(false);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setPerm(Notification.permission);
    }
  }, []);

  useEffect(() => {
    if (!me) return;
    let alive = true;

    async function poll() {
      try {
        const list = await api.get<Notif[]>(`/notifications?userId=${me!.id}`);
        if (!alive) return;
        setNotifs(list);
        if (!seeded.current) {
          // 첫 로드: 기존 알림은 토스트 없이 seen 처리
          list.forEach((n) => seen.current.add(n.id));
          seeded.current = true;
          return;
        }
        const fresh = list.filter((n) => !seen.current.has(n.id) && !n.read);
        for (const n of fresh) {
          seen.current.add(n.id);
          // 인앱 토스트
          setToasts((t) => [n, ...t].slice(0, 4));
          setTimeout(() => setToasts((t) => t.filter((x) => x.id !== n.id)), 6000);
          // 브라우저 OS 알림
          if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
            try {
              const no = new Notification("TMS 알림", { body: n.content, tag: n.id });
              no.onclick = () => {
                window.focus();
                if (n.link) router.push(n.link);
              };
            } catch {
              /* noop */
            }
          }
        }
        list.forEach((n) => seen.current.add(n.id));
      } catch {
        /* noop */
      }
    }
    void poll();
    const id = setInterval(poll, 20000);
    return () => {
      alive = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  if (!me) return null;
  const unread = notifs.filter((n) => !n.read).length;

  async function markRead(n: Notif) {
    setNotifs((cur) => cur.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    try {
      await api.patch(`/notifications/${n.id}/read`, {});
    } catch {
      /* noop */
    }
    if (n.link) {
      setOpen(false);
      router.push(n.link);
    }
  }
  async function markAll() {
    setNotifs((cur) => cur.map((n) => ({ ...n, read: true })));
    try {
      await api.patch(`/notifications/read-all?userId=${me!.id}`, {});
    } catch {
      /* noop */
    }
  }
  async function enablePush() {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return;
    const p = await Notification.requestPermission();
    setPerm(p);
    if (p !== "granted" || !me) return;
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      const vapid = await api.get<{ publicKey: string | null; enabled: boolean }>("/push/vapid");
      if (!vapid.publicKey || !vapid.enabled) return; // 서버 VAPID 미설정
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8(vapid.publicKey) as unknown as BufferSource,
      });
      await api.post(`/push/subscribe?userId=${me.id}`, JSON.parse(JSON.stringify(sub)));
    } catch {
      /* noop */
    }
  }

  return (
    <>
      {/* 토스트 */}
      <div style={{ position: "fixed", top: 16, right: 16, zIndex: 200, display: "grid", gap: 8, width: 320 }}>
        {toasts.map((t) => (
          <div
            key={t.id}
            onClick={() => markRead(t)}
            style={{
              background: "var(--surface,#fff)",
              border: "1px solid var(--border)",
              borderLeft: "4px solid var(--primary,#4f46e5)",
              borderRadius: 10,
              boxShadow: "0 8px 26px rgba(0,0,0,0.16)",
              padding: "12px 14px",
              fontSize: 13.5,
              cursor: "pointer",
              display: "flex",
              gap: 8,
              animation: "none",
            }}
          >
            <span>{IC[t.type] ?? "🔔"}</span>
            <span style={{ flex: 1 }}>{t.content}</span>
          </div>
        ))}
      </div>

      {/* 플로팅 벨 */}
      <button
        onClick={() => setOpen((o) => !o)}
        title="알림"
        style={{
          position: "fixed",
          bottom: 22,
          right: 22,
          zIndex: 150,
          width: 52,
          height: 52,
          borderRadius: "50%",
          background: "var(--primary,#4f46e5)",
          color: "#fff",
          border: "none",
          cursor: "pointer",
          boxShadow: "0 6px 20px rgba(79,70,229,0.4)",
          display: "grid",
          placeItems: "center",
        }}
      >
        <Bell size={22} />
        {unread > 0 && (
          <span
            style={{
              position: "absolute",
              top: -2,
              right: -2,
              background: "#dc2626",
              color: "#fff",
              fontSize: 11,
              fontWeight: 700,
              minWidth: 20,
              height: 20,
              borderRadius: 10,
              display: "grid",
              placeItems: "center",
              padding: "0 5px",
              border: "2px solid #fff",
            }}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {/* 알림 패널 */}
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 149 }} />
          <div
            style={{
              position: "fixed",
              bottom: 84,
              right: 22,
              zIndex: 151,
              width: 340,
              maxHeight: "60vh",
              overflow: "auto",
              background: "var(--surface,#fff)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              boxShadow: "0 12px 32px rgba(0,0,0,0.2)",
              padding: 8,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", padding: "6px 8px 10px" }}>
              <b style={{ fontSize: 14 }}>알림</b>
              <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                {perm !== "granted" && (
                  <button className="btn sm" onClick={enablePush}>🔔 OS 알림 켜기</button>
                )}
                {unread > 0 && <button className="btn sm" onClick={markAll}>모두 읽음</button>}
              </span>
            </div>
            {notifs.length === 0 && (
              <div style={{ padding: 16, color: "var(--text-3)", fontSize: 13, textAlign: "center" }}>알림이 없어요.</div>
            )}
            {notifs.slice(0, 30).map((n) => (
              <div
                key={n.id}
                onClick={() => markRead(n)}
                style={{
                  display: "flex",
                  gap: 8,
                  padding: "9px 10px",
                  borderRadius: 8,
                  cursor: "pointer",
                  background: n.read ? undefined : "rgba(79,70,229,0.07)",
                  fontSize: 13,
                }}
              >
                <span>{IC[n.type] ?? "🔔"}</span>
                <div style={{ flex: 1 }}>
                  <div>{n.content}</div>
                  <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{ago(n.createdAt)}</div>
                </div>
                {!n.read && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--primary,#4f46e5)", flexShrink: 0, marginTop: 5 }} />}
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
