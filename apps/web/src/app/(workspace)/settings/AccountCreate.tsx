"use client";

import { useState } from "react";
import { api } from "@/lib/api";

const INIT_PW = "tms2026!";

export default function AccountCreate() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [dept, setDept] = useState("");
  const [role, setRole] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit() {
    if (!name.trim() || !email.trim()) {
      setMsg({ ok: false, text: "Enter name & email 이름과 이메일을 입력하세요" });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      // 1) 유저 생성 — 비관리자(내 활동만 사용)
      const created = await api.post<{ id: string }>("/users", {
        name: name.trim(),
        email: email.trim(),
        dept: dept.trim() || undefined,
        role: role.trim() || undefined,
        isAdmin: false,
      });
      // 2) 초기 비밀번호 설정 — 실패하면 방금 만든 계정을 롤백(로그인 불가한 유령 계정 방지)
      try {
        await api.post("/auth/set-password", {
          email: email.trim(),
          password: INIT_PW,
        });
      } catch (pwErr) {
        await api.del(`/users/${created.id}`).catch(() => {});
        throw pwErr;
      }
      setMsg({
        ok: true,
        text: `Created 생성 완료 — ${email.trim()} · 초기 비번 ${INIT_PW}`,
      });
      setName("");
      setEmail("");
      setDept("");
      setRole("");
    } catch (e) {
      setMsg({
        ok: false,
        text: e instanceof Error ? e.message : "Failed 생성 실패",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ padding: 22, maxWidth: 600 }}>
      <div className="sec-title mb16">
        <span className="em">➕</span> Create Account 계정 추가
      </div>
      <div
        className="assign-field"
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
      >
        <div>
          <label>Name 이름</label>
          <input
            className="inp"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="이름 name"
          />
        </div>
        <div>
          <label>Email 이메일</label>
          <input
            className="inp"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
          />
        </div>
        <div>
          <label>Dept 부서 (선택)</label>
          <input
            className="inp"
            value={dept}
            onChange={(e) => setDept(e.target.value)}
            placeholder="부서 dept"
          />
        </div>
        <div>
          <label>Role 직책 (선택)</label>
          <input
            className="inp"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="직책 role"
          />
        </div>
      </div>
      <div style={{ fontSize: 12, color: "var(--text-3)", margin: "10px 0" }}>
        Members use <b>My Activity only</b> (non-admin) · initial password{" "}
        <b>{INIT_PW}</b> · 생성 계정은 내 활동만 사용 가능(비관리자) · 초기 비밀번호
      </div>
      {msg && (
        <div
          style={{
            fontSize: 13,
            color: msg.ok ? "#0f766e" : "#dc2626",
            marginBottom: 8,
          }}
        >
          {msg.text}
        </div>
      )}
      <button className="btn primary" onClick={submit} disabled={busy}>
        {busy ? "Creating… 생성 중…" : "Add 추가"}
      </button>
    </div>
  );
}
