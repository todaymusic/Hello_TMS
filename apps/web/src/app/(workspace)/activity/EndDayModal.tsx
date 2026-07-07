"use client";

import { useState } from "react";
import { api, progressColor, type Task } from "@/lib/api";

export function dailyKey(userId: string, dateKey: string) {
  return `tms_daily_${userId}_${dateKey}`;
}

export default function EndDayModal({
  userId,
  dateKey,
  tasks,
  onClose,
  onDone,
}: {
  userId: string;
  dateKey: string; // YYYY-MM-DD (오늘)
  tasks: Task[]; // 미완료(오늘의 업무 + 진행중)
  onClose: () => void;
  onDone: () => void;
}) {
  // 태스크별 리포트 입력값
  const [reports, setReports] = useState<Record<string, { progress: number; memo: string }>>(
    () => Object.fromEntries(tasks.map((t) => [t.id, { progress: t.progress, memo: t.statusMemo ?? "" }])),
  );
  const [daily, setDaily] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function setReport(id: string, patch: Partial<{ progress: number; memo: string }>) {
    setReports((cur) => ({ ...cur, [id]: { ...cur[id], ...patch } }));
  }

  async function submit() {
    setBusy(true);
    setMsg("Saving… 저장 중…");
    try {
      // 1) 태스크 리포트 저장 (진행률 + 개요→진행메모)
      await Promise.all(
        tasks.map((t) => {
          const r = reports[t.id];
          return api.patch(`/tasks/${t.id}`, {
            progress: r.progress,
            statusMemo: r.memo.trim(),
          });
        }),
      );
      // 2) 진행중 업무 모두 중단(자동 이월은 plannedDate carry-over로 처리됨)
      await Promise.all(
        tasks.filter((t) => t.status === "doing").map((t) => api.post(`/tasks/${t.id}/pause`, {})),
      );
      // 3) 데일리 평가 AI (한줄평 반영)
      setMsg("Generating AI daily review… AI 데일리 평가 생성 중…");
      let review = "";
      try {
        const r = await api.post<{ review: string }>(
          `/ai/daily-review?userId=${userId}&date=${dateKey}`,
          { comment: daily.trim() || undefined, taskIds: tasks.map((t) => t.id) },
        );
        review = r.review;
      } catch {
        review = "(Couldn't generate AI review AI 평가를 생성하지 못했습니다)";
      }
      // 4) 퇴근(업무 종료) 상태 → 현황판에 '업무 종료'로 표시
      try {
        await api.post("/auth/clock-out", {});
      } catch {
        /* noop */
      }
      // 5) 로컬 저장 (지난 업무 조회 시 표시)
      try {
        localStorage.setItem(
          dailyKey(userId, dateKey),
          JSON.stringify({ comment: daily.trim(), review, at: dateKey, count: tasks.length }),
        );
      } catch {
        /* noop */
      }
      onDone();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed 실패");
      setBusy(false);
    }
  }

  return (
    <div
      onClick={() => !busy && onClose()}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "grid", placeItems: "start center", zIndex: 60, padding: "24px 16px", overflow: "auto" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{ width: "100%", maxWidth: 560, padding: 22 }}
      >
        <div className="sec-title mb16"><span className="em">🔚</span> End Day · Report 업무 종료 · 오늘 리포트</div>
        <div className="field-hint" style={{ marginBottom: 14 }}>
          Ending pauses in-progress tasks & carries unfinished ones to tomorrow. 종료하면 진행 중 업무는 <b>중단</b>되고 미완료 업무는 <b>다음날로 이월</b>됩니다.
        </div>

        {/* 태스크 리포트 */}
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>📋 Task Report 태스크 리포트 (미완료 {tasks.length})</div>
        <div style={{ display: "grid", gap: 10, marginBottom: 18 }}>
          {tasks.length === 0 && (
            <div style={{ color: "var(--text-3)", fontSize: 13 }}>No unfinished tasks 미완료 업무가 없어요.</div>
          )}
          {tasks.map((t) => {
            const r = reports[t.id];
            return (
              <div key={t.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 6 }}>
                  {t.project && <span style={{ color: "var(--text-3)", fontSize: 11.5, fontWeight: 400 }}>({t.project.name}) </span>}
                  {t.title}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: "var(--text-3)", minWidth: 50 }}>Progress 진행률</span>
                  <input type="range" min={0} max={100} step={5} value={r.progress} onChange={(e) => setReport(t.id, { progress: Number(e.target.value) })} style={{ flex: 1 }} />
                  <b style={{ fontSize: 13, minWidth: 40, textAlign: "right", color: progressColor(r.progress) }}>{r.progress}%</b>
                </div>
                <textarea
                  className="inp"
                  value={r.memo}
                  onChange={(e) => setReport(t.id, { memo: e.target.value })}
                  placeholder="Summary · what you did today 업무 개요 · 오늘 한 일"
                  style={{ minHeight: 48, fontSize: 13 }}
                />
              </div>
            );
          })}
        </div>

        {/* 데일리 리포트 */}
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>📝 Daily Report 데일리 리포트 (오늘 한줄평)</div>
        <textarea
          className="inp"
          value={daily}
          onChange={(e) => setDaily(e.target.value)}
          placeholder="Sum up your day in one line — AI reviews it. 오늘 하루 업무를 한 줄로 정리해보세요. AI가 평가해줍니다."
          style={{ minHeight: 56, fontSize: 13, marginBottom: 12 }}
        />

        {msg && <div className="field-hint" style={{ color: msg.includes("중…") ? "var(--text-2)" : "#dc2626", marginBottom: 8 }}>{msg}</div>}

        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" style={{ flex: 1 }} onClick={() => !busy && onClose()} disabled={busy}>Cancel 취소</button>
          <button className="btn primary" style={{ flex: 2 }} onClick={submit} disabled={busy}>
            {busy ? "Processing… 처리 중…" : "🤖 Get AI review & end 평가 받고 종료"}
          </button>
        </div>
      </div>
    </div>
  );
}
