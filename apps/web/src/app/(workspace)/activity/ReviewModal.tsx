"use client";

import { useEffect, useState } from "react";
import { api, type Task } from "@/lib/api";

const GRADES = ["우수", "양호", "보완"] as const;

export default function ReviewModal({
  task,
  onClose,
  onDone,
}: {
  task: Task;
  onClose: () => void;
  onDone: () => void;
}) {
  const [review, setReview] = useState<string | null>(task.aiReview ?? null);
  const [recGrade, setRecGrade] = useState<string>("");
  const [grade, setGrade] = useState<string>("양호");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reworking, setReworking] = useState(false);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.post<{ evaluation: string; grade: string }>(`/tasks/${task.id}/ai-review`, {});
        setReview(r.evaluation);
        setRecGrade(r.grade);
        setGrade(r.grade);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "AI evaluation failed AI 평가 실패");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id]);

  async function approve() {
    setBusy(true);
    try {
      await api.post(`/tasks/${task.id}/approve`, { grade });
      onDone();
      onClose();
    } finally {
      setBusy(false);
    }
  }
  async function rework() {
    if (!reason.trim()) {
      setErr("Enter a rework reason 재작업 사유를 입력하세요");
      return;
    }
    setBusy(true);
    try {
      await api.post(`/tasks/${task.id}/rework`, { reason: reason.trim() });
      onDone();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  const link = task.reportLink || task.videoLink;

  return (
    <div onClick={() => !busy && onClose()} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "grid", placeItems: "center", zIndex: 55, padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: "100%", maxWidth: 520, maxHeight: "90vh", overflow: "auto", padding: 22 }}>
        <div className="sec-title mb16">
          <span className="em">🔍</span> Task Review 업무 검수 — {task.title}
          {task.reworkCount ? <span className="pill" style={{ background: "#ffedd5", color: "#c2410c", marginLeft: 6 }}>Rework 재작업 #{task.reworkCount}</span> : null}
        </div>

        {/* AI 평가 */}
        <div className="field-lbl" style={{ marginBottom: 6 }}>🤖 AI Completion Review 완료 평가</div>
        {loading ? (
          <div style={{ color: "var(--text-3)", fontSize: 13 }}>Generating review… 평가 생성 중…</div>
        ) : (
          <div style={{ fontSize: 13.5, lineHeight: 1.7, background: "#f5f3ff", borderRadius: 8, padding: "12px 14px", whiteSpace: "pre-wrap" }}>
            {review}
            {recGrade && <div style={{ marginTop: 8, fontWeight: 700 }}>→ AI recommended grade AI 추천 등급: {recGrade}</div>}
          </div>
        )}

        {/* 제출물 */}
        <div className="field-lbl" style={{ margin: "14px 0 6px" }}>📎 Submission 제출 내용</div>
        <div style={{ fontSize: 13, display: "grid", gap: 4 }}>
          <div>Progress 진행률: <b>{task.progress}%</b></div>
          <div>Memo 진행 메모: {task.statusMemo || "—"}</div>
          <div>
            Deliverable 산출물:{" "}
            {link ? <a href={link} target="_blank" rel="noreferrer">{link.slice(0, 50)}…</a> : "—"}
          </div>
        </div>

        {err && <div style={{ color: "#dc2626", fontSize: 13, marginTop: 8 }}>{err}</div>}

        {!reworking ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 18 }}>
            <button className="btn" style={{ color: "#c2410c" }} onClick={() => setReworking(true)} disabled={busy}>
              🔁 Request rework 재작업 요청
            </button>
            <span style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
              <select className="inp" value={grade} onChange={(e) => setGrade(e.target.value)} style={{ width: 90 }}>
                {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
              <button className="btn primary" onClick={approve} disabled={busy}>Approve + grade 승인 + 등급</button>
            </span>
          </div>
        ) : (
          <div style={{ marginTop: 16 }}>
            <label className="field-lbl">Rework reason (sent to same assignee) 재작업 사유 (동일 담당자에게 전송)</label>
            <textarea className="inp" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Describe what needs improvement 무엇을 보완해야 하는지 적어주세요" style={{ minHeight: 80, marginTop: 4 }} />
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button className="btn" style={{ flex: 1 }} onClick={() => setReworking(false)}>Cancel 취소</button>
              <button className="btn primary" style={{ flex: 2 }} onClick={rework} disabled={busy}>Send rework request 재작업 요청 보내기</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
