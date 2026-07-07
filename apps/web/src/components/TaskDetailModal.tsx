"use client";

import { useEffect, useState } from "react";
import { api, type Priority, type TaskDetail, type TaskStatus } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const PRI_LABEL: Record<Priority, string> = {
  urgent: "긴급",
  high: "높음",
  medium: "보통",
  low: "낮음",
};
const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "할일",
  doing: "진행중",
  paused: "중단",
  review: "검토중",
  done: "완료",
  completed_pending: "완료(검수대기)",
  rejected: "미수락(반려)",
};
const CAT_LABEL: Record<string, string> = { long: "롱", shorts: "쇼츠", project: "프로젝트" };

type WorkLog = { id: string; startedAt: string; endedAt: string | null; note?: string | null };

function fmtDur(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 1) return "1분 미만";
  if (min < 60) return `${min}분`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}시간 ${m}분` : `${h}시간`;
}
function hm(s: string): string {
  const d = new Date(s);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function TaskDetailModal({
  taskId,
  onClose,
  onSaved,
  onDeleted,
  readOnly = false,
}: {
  taskId: string;
  onClose: () => void;
  onSaved?: (t: TaskDetail) => void;
  onDeleted?: (id: string) => void;
  readOnly?: boolean;
}) {
  const { user: me } = useAuth();
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [logs, setLogs] = useState<WorkLog[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [bigEdit, setBigEdit] = useState(false);
  const [docSaved, setDocSaved] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  // 삭제는 업무를 요청/생성한 사람(부여자) 또는 관리자만 가능. 부모가 onDeleted를 넘긴 경우에만 노출.
  const canDelete =
    !readOnly &&
    !!onDeleted &&
    !!me &&
    (!!me.isAdmin || (!!task?.assigner && me.id === task.assigner.id));

  async function remove() {
    setBusy(true);
    setErr(null);
    try {
      await api.del(`/tasks/${taskId}`);
      onDeleted?.(taskId);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "삭제 실패");
      setBusy(false);
    }
  }

  async function saveDocOnly() {
    setBusy(true);
    try {
      await api.patch(`/tasks/${taskId}`, { aiDescriptionDoc: doc.trim() || undefined });
      setDocSaved(true);
      setTimeout(() => setDocSaved(false), 2000);
    } finally {
      setBusy(false);
    }
  }

  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [status, setStatus] = useState<TaskStatus>("todo");
  const [dueDate, setDueDate] = useState("");
  const [progress, setProgress] = useState(0);
  const [memo, setMemo] = useState("");
  const [description, setDescription] = useState("");
  const [doc, setDoc] = useState("");
  const [reportLink, setReportLink] = useState("");
  const [videoLink, setVideoLink] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const t = await api.get<TaskDetail>(`/tasks/${taskId}`);
        setTask(t);
        setTitle(t.title);
        setPriority(t.priority);
        setStatus(t.status);
        setDueDate(t.dueDate ? t.dueDate.slice(0, 10) : "");
        setProgress(t.progress);
        setMemo(t.statusMemo ?? "");
        setDescription(t.description ?? "");
        setDoc(t.aiDescriptionDoc ?? "");
        setReportLink(t.reportLink ?? "");
        setVideoLink(t.videoLink ?? "");
        try {
          setLogs(await api.get<WorkLog[]>(`/worklogs?taskId=${taskId}`));
        } catch {
          /* 타임라인 없음 */
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : "불러오기 실패");
      }
    })();
  }, [taskId]);

  async function regenerateDoc() {
    if (!description.trim()) {
      setErr("AI 정리할 상세 설명을 먼저 입력하세요");
      return;
    }
    setAiBusy(true);
    setErr(null);
    try {
      const r = await api.post<{ doc: string }>("/ai/task-doc", {
        memo: description,
        title,
        category: task?.category,
        subCategory: task?.subCategory ?? undefined,
      });
      setDoc(r.doc);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "AI 생성 실패");
    } finally {
      setAiBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const updated = await api.patch<TaskDetail>(`/tasks/${taskId}`, {
        title: title.trim(),
        priority,
        status,
        progress,
        statusMemo: memo.trim() || undefined,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        description: description.trim() || undefined,
        aiDescriptionDoc: doc.trim() || undefined,
        reportLink: reportLink.trim() || undefined,
        videoLink: videoLink.trim() || undefined,
      });
      onSaved?.(updated);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setBusy(false);
    }
  }

  const ro = readOnly;

  // 업무 타임라인(WorkLog 세션): 시작 → 중단/종료, 세션 사이 재개 간격, 총 실작업 시간
  const sessions = [...logs].sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
  );
  const totalMs = sessions.reduce(
    (s, l) => s + ((l.endedAt ? new Date(l.endedAt).getTime() : Date.now()) - new Date(l.startedAt).getTime()),
    0,
  );
  const hasTimeline = sessions.length > 0 || !!task?.acceptedAt || !!task?.startedAt;
  // 완료 시 남긴 완료 메모(WorkLog.note) — 가장 최근 것
  const completionNote =
    [...logs]
      .filter((l) => l.note && l.note.trim())
      .sort(
        (a, b) =>
          new Date(b.endedAt ?? b.startedAt).getTime() - new Date(a.endedAt ?? a.startedAt).getTime(),
      )[0]?.note ?? null;

  // 마감 대비: 완료 업무는 마감 대비 지연/단축, 미완료는 초과/남은 일수
  const dueInfo = (() => {
    if (!task?.dueDate) return null;
    const dayMs = 86400000;
    const due = new Date(task.dueDate); due.setHours(0, 0, 0, 0);
    const isDone = task.status === "done" || task.status === "completed_pending";
    if (isDone && task.endedAt) {
      const end = new Date(task.endedAt); end.setHours(0, 0, 0, 0);
      const days = Math.round((end.getTime() - due.getTime()) / dayMs);
      if (days > 0) return { text: `⚠️ 마감 ${days}일 초과 완료`, color: "#b91c1c", bg: "#fee2e2", bd: "#fecaca" };
      if (days < 0) return { text: `✅ 마감 ${-days}일 전 완료`, color: "#15803d", bg: "#dcfce7", bd: "#bbf7d0" };
      return { text: "✅ 정시 완료", color: "#15803d", bg: "#dcfce7", bd: "#bbf7d0" };
    }
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const days = Math.round((today.getTime() - due.getTime()) / dayMs);
    if (days > 0) return { text: `⚠️ 마감 ${days}일 지남 (미완료)`, color: "#b91c1c", bg: "#fee2e2", bd: "#fecaca" };
    if (days === 0) return { text: "⏳ 오늘 마감", color: "#a16207", bg: "#fef3c7", bd: "#fde68a" };
    return { text: `🗓 마감까지 ${-days}일`, color: "#a16207", bg: "#fef9c3", bd: "#fde68a" };
  })();

  return (
    <>
    {bigEdit && (
      <div
        style={{ position: "fixed", inset: 0, background: "var(--surface,#fff)", zIndex: 60, display: "flex", flexDirection: "column", padding: 20 }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div className="sec-title"><span className="em">🤖</span> 업무설명 doc — {task?.title}</div>
          <span style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            {docSaved && <span style={{ color: "#16a34a", fontSize: 13 }}>✅ 저장됨</span>}
            {!ro && (
              <button className="btn primary" onClick={saveDocOnly} disabled={busy}>저장</button>
            )}
            <button className="btn" onClick={() => setBigEdit(false)}>닫기</button>
          </span>
        </div>
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, minHeight: 0 }}>
          <textarea
            value={doc}
            onChange={(e) => setDoc(e.target.value)}
            disabled={ro}
            placeholder="업무설명 doc (마크다운). 자유롭게 수정하세요."
            style={{ width: "100%", height: "100%", resize: "none", padding: 16, fontSize: 14, lineHeight: 1.7, border: "1px solid var(--border)", borderRadius: 10, fontFamily: "inherit" }}
          />
          <div style={{ overflow: "auto", padding: 16, border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface-2,#fafafa)", whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.8 }}>
            {doc || <span style={{ color: "var(--text-3)" }}>미리보기</span>}
          </div>
        </div>
      </div>
    )}
    <div
      onClick={() => !busy && onClose()}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "grid",
        placeItems: "center",
        zIndex: 50,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{ width: "100%", maxWidth: 560, maxHeight: "90vh", overflow: "auto", padding: 22 }}
      >
        {!task ? (
          <div style={{ color: "var(--text-3)", fontSize: 13 }}>{err ?? "불러오는 중…"}</div>
        ) : (
          <>
            <div className="panel-head">
              <div className="sec-title">
                <span className="em">📋</span> 업무 상세 {ro && <span className="pill gray">읽기 전용</span>}
              </div>
              <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                <span className="pill gray">{CAT_LABEL[task.category] ?? task.category}</span>
                {task.subCategory && <span className="pill gray">{task.subCategory}</span>}
              </span>
            </div>

            <div className="assign-field">
              <label>제목</label>
              <input className="inp" value={title} onChange={(e) => setTitle(e.target.value)} disabled={ro} />
            </div>

            <div className="assign-field" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <div>
                <label>우선순위</label>
                <select className="inp" value={priority} onChange={(e) => setPriority(e.target.value as Priority)} disabled={ro}>
                  {(Object.keys(PRI_LABEL) as Priority[]).map((p) => (
                    <option key={p} value={p}>{PRI_LABEL[p]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label>상태</label>
                <select className="inp" value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)} disabled={ro}>
                  {(["todo", "doing", "paused", "review", "done"] as TaskStatus[]).map((s) => (
                    <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label>마감일</label>
                <input className="inp" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} disabled={ro} />
              </div>
            </div>

            {dueInfo && (
              <div className="assign-field" style={{ marginTop: -4 }}>
                <span
                  className="pill"
                  style={{ background: dueInfo.bg, color: dueInfo.color, border: `1px solid ${dueInfo.bd}`, fontSize: 12, fontWeight: 700, padding: "4px 10px" }}
                >
                  {dueInfo.text}
                </span>
              </div>
            )}

            <div className="assign-field">
              <label>진행률 ({progress}%)</label>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={progress}
                onChange={(e) => setProgress(Number(e.target.value))}
                disabled={ro}
                style={{ width: "100%" }}
              />
            </div>

            <div className="assign-field">
              <label>📝 진행 메모 (대시보드 공유)</label>
              <input
                className="inp"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="예: 초안 80% 완료, 피드백 대기 중"
                disabled={ro}
              />
            </div>

            {completionNote && (
              <div className="assign-field">
                <label>✅ 완료 메모</label>
                <div
                  style={{
                    whiteSpace: "pre-wrap",
                    fontSize: 13.5,
                    lineHeight: 1.6,
                    background: "#f0fdf4",
                    border: "1px solid #bbf7d0",
                    color: "#166534",
                    borderRadius: 8,
                    padding: "9px 12px",
                  }}
                >
                  {completionNote}
                </div>
              </div>
            )}

            <div className="assign-field" style={{ fontSize: 13, color: "var(--text-2)" }}>
              담당자: <b>{task.assignee?.name ?? "—"}</b>
              {task.assigner && <> · 부여: {task.assigner.name}</>}
            </div>

            {hasTimeline && (
              <div className="assign-field">
                <label>🕒 Timeline 업무 타임라인</label>
                {/* 컴팩트: 세션당 한 줄(시작~종료 · 구분 · 소요) + 사유/메모는 아래 한 줄 */}
                <div style={{ display: "grid", gap: 3, fontSize: 12, background: "var(--surface-2,#fafafa)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 11px" }}>
                  {task.acceptedAt && (
                    <div style={{ color: "var(--text-3)" }}>📥 Accepted 수락 · {hm(task.acceptedAt)}</div>
                  )}
                  {sessions.length === 0 && !task.acceptedAt && (
                    <div style={{ color: "var(--text-3)" }}>No record yet 아직 시작 기록이 없어요.</div>
                  )}
                  {sessions.map((s, i) => {
                    const dur = (s.endedAt ? new Date(s.endedAt).getTime() : Date.now()) - new Date(s.startedAt).getTime();
                    const isLastDone = i === sessions.length - 1 && !!task.endedAt && !!s.endedAt;
                    const label = !s.endedAt ? "doing 진행중" : isLastDone ? "end 종료" : "pause 중단";
                    return (
                      <div key={s.id} style={{ display: "grid", gap: 1 }}>
                        <div style={{ display: "flex", gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 700 }}>▶ {hm(s.startedAt)}{s.endedAt ? ` ~ ${hm(s.endedAt)}` : " ~ …"}</span>
                          <span style={{ color: "var(--text-3)" }}>· {label} · {fmtDur(dur)}</span>
                        </div>
                        {s.note && (
                          <div style={{ color: "#a16207", paddingLeft: 14, whiteSpace: "pre-wrap" }}>{s.note}</div>
                        )}
                      </div>
                    );
                  })}
                  {task.endedAt && (
                    <div style={{ fontWeight: 700, color: "#16a34a" }}>✅ Done 완료 · {hm(task.endedAt)}</div>
                  )}
                  <div style={{ borderTop: "1px dashed var(--border)", paddingTop: 5, marginTop: 1, fontWeight: 700 }}>
                    Σ Total 총 {fmtDur(totalMs)} · {sessions.length}회
                  </div>
                </div>
              </div>
            )}

            {(task.reportRequired || reportLink) && (
              <div className="assign-field">
                <label>📊 보고링크</label>
                <input className="inp" value={reportLink} onChange={(e) => setReportLink(e.target.value)} placeholder="https://..." disabled={ro} />
              </div>
            )}
            {(task.videoRequired || videoLink) && (
              <div className="assign-field">
                <label>🎥 설명영상</label>
                <input className="inp" value={videoLink} onChange={(e) => setVideoLink(e.target.value)} placeholder="https://..." disabled={ro} />
              </div>
            )}

            <div className="assign-field">
              <label>상세 설명 (메모)</label>
              <textarea className="inp" value={description} onChange={(e) => setDescription(e.target.value)} style={{ minHeight: 70 }} disabled={ro} />
            </div>

            <div className="assign-field">
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <label style={{ margin: 0 }}>🤖 AI 업무설명 doc</label>
                <button
                  type="button"
                  className="btn sm"
                  style={{ marginLeft: "auto" }}
                  onClick={() => setBigEdit(true)}
                  disabled={ro && !doc.trim()}
                >
                  📄 {doc.trim() ? "업무설명 열기" : ro ? "없음" : "업무설명 작성"}
                </button>
                {!ro && (
                  <button type="button" className="btn sm" onClick={regenerateDoc} disabled={aiBusy}>
                    {aiBusy ? "생성 중…" : "AI 재생성"}
                  </button>
                )}
              </div>
            </div>

            {err && <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 8 }}>{err}</div>}

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {canDelete &&
                (confirmDel ? (
                  <>
                    <span style={{ fontSize: 13, color: "#dc2626", fontWeight: 600 }}>
                      삭제할까요?
                    </span>
                    <button
                      className="btn"
                      onClick={remove}
                      disabled={busy}
                      style={{ color: "#fff", background: "#dc2626", borderColor: "#dc2626" }}
                    >
                      {busy ? "삭제 중…" : "삭제"}
                    </button>
                    <button className="btn" onClick={() => setConfirmDel(false)} disabled={busy}>
                      취소
                    </button>
                  </>
                ) : (
                  <button
                    className="btn"
                    onClick={() => setConfirmDel(true)}
                    disabled={busy}
                    title="이 업무를 삭제합니다 (요청한 사람만 가능)"
                    style={{ color: "#dc2626", borderColor: "#f0c9c9" }}
                  >
                    🗑 삭제
                  </button>
                ))}
              <span style={{ flex: 1 }} />
              <button className="btn" onClick={() => !busy && onClose()}>
                닫기
              </button>
              {!ro && (
                <button className="btn primary" onClick={save} disabled={busy}>
                  {busy ? "저장 중…" : "저장"}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
    </>
  );
}
