"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth";

const DEMO = [
  { name: "마승일", email: "ohmusic2024@gmail.com" },
  { name: "신선중", email: "thedudir@gmail.com" },
  { name: "왕유림", email: "iamwangskyyy@gmail.com" },
  { name: "맹미란", email: "maengmiran97@gmail.com" },
  { name: "박채원", email: "won031204@gmail.com" },
];

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("ohmusic2024@gmail.com");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await login(email, password);
      router.push("/dashboard");
    } catch {
      setErr("이메일 또는 비밀번호가 올바르지 않습니다");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "var(--canvas, #f4f3ef)",
        padding: 20,
      }}
    >
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: "linear-gradient(135deg,#14b8a6,#0d9488)",
              color: "#fff",
              display: "grid",
              placeItems: "center",
              fontWeight: 800,
              fontSize: 20,
              margin: "0 auto 10px",
            }}
          >
            TH
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800 }}>HelloTMS Login 로그인</h1>
          <div style={{ color: "var(--text-3, #888)", fontSize: 13, marginTop: 4 }}>
            Work Management 사내 업무 관리
          </div>
        </div>

        <form onSubmit={submit} className="card" style={{ padding: 22 }}>
          <div className="assign-field">
            <label>Email 이메일</label>
            <input
              className="inp"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@tms.dev"
              required
            />
          </div>
          <div className="assign-field">
            <label>Password 비밀번호</label>
            <input
              className="inp"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호"
              required
            />
          </div>
          {err && (
            <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 10 }}>
              {err}
            </div>
          )}
          <button
            className="btn primary"
            style={{ width: "100%" }}
            disabled={busy}
          >
            {busy ? "Signing in… 로그인 중…" : "Login 로그인"}
          </button>
        </form>

        <div
          style={{
            marginTop: 16,
            fontSize: 12,
            color: "var(--text-3, #999)",
            lineHeight: 1.7,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>팀원 계정 (초기 비번: tms2026!)</div>
          {DEMO.map((d) => (
            <span
              key={d.email}
              onClick={() => setEmail(d.email)}
              style={{ cursor: "pointer", marginRight: 8, textDecoration: "underline" }}
            >
              {d.name}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
