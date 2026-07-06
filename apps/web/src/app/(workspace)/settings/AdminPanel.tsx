"use client";

import { useEffect, useState } from "react";
import { api, type Leave, type LeaveType, type User } from "@/lib/api";

const LEAVE_LABEL: Record<LeaveType, string> = {
  annual: "연차",
  half: "반차",
  quarter: "반반차",
  sick: "병가",
  etc: "기타",
};
const STATUS_KO = { requested: "신청됨", approved: "승인", rejected: "반려" } as const;

type LeaveWithUser = Leave & { user: { id: string; name: string; avatarColor: string } };
type Edit = { dept: string; role: string; bal: string };

function fmt(d: string) {
  const dt = new Date(d);
  return `${dt.getMonth() + 1}/${dt.getDate()}`;
}

export default function AdminPanel() {
  const [users, setUsers] = useState<User[]>([]);
  const [leaves, setLeaves] = useState<LeaveWithUser[]>([]);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const [u, l] = await Promise.all([
      api.get<User[]>("/users"),
      api.get<LeaveWithUser[]>("/leaves"),
    ]);
    setUsers(u);
    setLeaves(l);
    setEdits(
      Object.fromEntries(
        u.map((x) => [
          x.id,
          { dept: x.dept ?? "", role: x.role ?? "", bal: String(x.leaveBalance ?? 0) },
        ]),
      ),
    );
  }
  useEffect(() => {
    void load();
  }, []);

  async function saveMember(id: string) {
    setBusy(id);
    try {
      await api.patch(`/users/${id}`, {
        dept: edits[id]?.dept || undefined,
        role: edits[id]?.role || undefined,
        leaveBalance: Number(edits[id]?.bal ?? 0) || 0,
      });
      await load();
    } finally {
      setBusy(null);
    }
  }
  async function setLeaveStatus(id: string, status: "approved" | "rejected") {
    setBusy(id);
    try {
      await api.patch(`/leaves/${id}/status`, { status });
      await load(); // 승인 시 잔여 차감 → 멤버 목록도 갱신
    } finally {
      setBusy(null);
    }
  }
  // 취소 요청 승인(삭제+연차 복구) / 거절
  async function confirmCancel(id: string) {
    setBusy(id);
    try {
      await api.del(`/leaves/${id}`);
      await load();
    } finally {
      setBusy(null);
    }
  }
  async function denyCancel(id: string) {
    setBusy(id);
    try {
      await api.patch(`/leaves/${id}/deny-cancel`, {});
      await load();
    } finally {
      setBusy(null);
    }
  }

  // 최근 3개월(종료일 기준) + 취소요청은 항상 표시
  const cutoff = Date.now() - 1000 * 60 * 60 * 24 * 92;
  const visibleLeaves = leaves.filter(
    (lv) => lv.cancelRequested || new Date(lv.endDate).getTime() >= cutoff,
  );

  const upd = (id: string, patch: Partial<Edit>) =>
    setEdits((c) => ({ ...c, [id]: { ...c[id], ...patch } }));

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
        gap: 16,
        alignItems: "start",
      }}
    >
      {/* 멤버 관리 */}
      <div className="card" style={{ padding: 22 }}>
        <div className="sec-title mb16">
          <span className="em">🧑‍💼</span> 멤버 관리 (직책 · 담당업무 · 연차잔여)
        </div>
        <div style={{ display: "grid", gap: 12 }}>
          {users.map((u) => (
            <div key={u.id} style={{ display: "grid", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div className="avatar" style={{ background: u.avatarColor, width: 26, height: 26, fontSize: 12 }}>
                  {u.name.slice(0, 1)}
                </div>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{u.name}</span>
                {u.isAdmin && <span className="pill teal">관리자</span>}
              </div>
              <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                <input
                  className="inp"
                  placeholder="담당업무"
                  value={edits[u.id]?.dept ?? ""}
                  onChange={(e) => upd(u.id, { dept: e.target.value })}
                  style={{ flex: 1, minWidth: 0, padding: "6px 8px" }}
                />
                <input
                  className="inp"
                  placeholder="직책"
                  value={edits[u.id]?.role ?? ""}
                  onChange={(e) => upd(u.id, { role: e.target.value })}
                  style={{ flex: 1, minWidth: 0, padding: "6px 8px" }}
                />
                <input
                  className="inp"
                  type="number"
                  step="0.25"
                  title="연차 잔여(일)"
                  value={edits[u.id]?.bal ?? "0"}
                  onChange={(e) => upd(u.id, { bal: e.target.value })}
                  style={{ width: 52, padding: "6px 6px", flexShrink: 0 }}
                />
                <button
                  className="btn primary sm"
                  style={{ flexShrink: 0, padding: "6px 12px" }}
                  onClick={() => saveMember(u.id)}
                  disabled={busy === u.id}
                >
                  저장
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 전 멤버 휴가 */}
      <div className="card" style={{ padding: 22 }}>
        <div className="sec-title mb16">
          <span className="em">🗂️</span> 전 멤버 휴가 (승인/반려)
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          {visibleLeaves.length === 0 && (
            <div style={{ color: "var(--text-3)", fontSize: 13 }}>최근 3개월 내 휴가가 없습니다.</div>
          )}
          {visibleLeaves.map((lv) => (
            <div
              key={lv.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 12px",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 13,
                flexWrap: "wrap",
              }}
            >
              <span style={{ fontWeight: 600, minWidth: 44 }}>{lv.user.name}</span>
              <span className="pill gray">{LEAVE_LABEL[lv.type]}</span>
              <span>
                {fmt(lv.startDate)}–{fmt(lv.endDate)}
              </span>
              <span style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
                <span
                  className="pill"
                  style={{
                    background:
                      lv.status === "approved" ? "#dcfce7" : lv.status === "rejected" ? "#fee2e2" : "#fef9c3",
                    color:
                      lv.status === "approved" ? "#15803d" : lv.status === "rejected" ? "#b91c1c" : "#a16207",
                  }}
                >
                  {STATUS_KO[lv.status]}
                </span>
                {lv.status === "requested" && (
                  <>
                    <button className="btn sm" onClick={() => setLeaveStatus(lv.id, "approved")} disabled={busy === lv.id}>
                      승인
                    </button>
                    <button className="btn sm" onClick={() => setLeaveStatus(lv.id, "rejected")} disabled={busy === lv.id}>
                      반려
                    </button>
                  </>
                )}
                {lv.cancelRequested && (
                  <>
                    <span className="pill" style={{ background: "#fef9c3", color: "#a16207" }}>
                      취소요청
                    </span>
                    <button className="btn sm" onClick={() => confirmCancel(lv.id)} disabled={busy === lv.id}>
                      취소 승인
                    </button>
                    <button className="btn sm" onClick={() => denyCancel(lv.id)} disabled={busy === lv.id}>
                      거절
                    </button>
                  </>
                )}
              </span>
            </div>
          ))}
        </div>
        <div className="hint" style={{ marginTop: 10 }}>
          승인 시 연차 −1 / 반차 −0.5 / 반반차 −0.25 자동 차감됩니다.
        </div>
      </div>
    </div>
  );
}
