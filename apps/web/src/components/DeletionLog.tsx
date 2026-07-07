"use client";

import { useEffect, useState } from "react";
import { api, type TaskDeletion } from "@/lib/api";

// 관리자용 '삭제 기록' — 삭제된 업무를 누가·언제 지웠는지 보고 복구.
// 공유 백엔드가 삭제 시 TaskDeletion 스냅샷을 남기므로 여기서 목록·복구한다.
export default function DeletionLog({ onRestored }: { onRestored?: () => void }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<TaskDeletion[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      setRows(await api.get<TaskDeletion[]>("/tasks/deletions"));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load 불러오기 실패");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open && rows.length === 0) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function restore(id: string) {
    if (
      !window.confirm(
        "Restore this task? 이 업무를 복구할까요?",
      )
    )
      return;
    setBusy(id);
    setErr(null);
    try {
      await api.post(`/tasks/deletions/${id}/restore`, {});
      await load();
      onRestored?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to restore 복구 실패");
    } finally {
      setBusy(null);
    }
  }

  function fmt(s: string) {
    const d = new Date(s);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 16px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span className="sec-title" style={{ fontSize: 14 }}>
          <span className="em">🗑</span> Deletion Log 삭제 기록
        </span>
        {rows.length > 0 && (
          <span className="count">{rows.length}</span>
        )}
        <span style={{ marginLeft: "auto", color: "var(--text-3)", fontSize: 13 }}>
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div style={{ padding: "0 16px 16px" }}>
          <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 10 }}>
            Deleted tasks — who & when, with restore · 삭제된 업무의 삭제자·시각과 복구
          </div>
          {err && (
            <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 8 }}>{err}</div>
          )}
          {loading && (
            <div style={{ color: "var(--text-3)", fontSize: 13 }}>Loading… 불러오는 중…</div>
          )}
          {!loading && rows.length === 0 && (
            <div style={{ color: "var(--text-3)", fontSize: 13 }}>
              No deletions 삭제 기록 없음
            </div>
          )}
          <div style={{ display: "grid", gap: 8 }}>
            {rows.map((r) => (
              <div
                key={r.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "8px 12px",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{r.title}</div>
                  <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
                    {fmt(r.deletedAt)} · Deleted by 삭제자:{" "}
                    <b>{r.deletedByName ?? "Unknown 알 수 없음"}</b>
                  </div>
                </div>
                <button
                  className="btn sm"
                  onClick={() => restore(r.id)}
                  disabled={busy === r.id}
                  title="Restore this task 이 업무를 복구합니다"
                >
                  {busy === r.id ? "Restoring… 복구 중…" : "↩ Restore 복구"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
