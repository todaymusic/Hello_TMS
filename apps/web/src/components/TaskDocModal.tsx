"use client";

import { useEffect, useState } from "react";
import { api, type TaskDetail } from "@/lib/api";

/**
 * 업무설명 doc 전용 "새 창에서 보기/편집" 모달.
 * TaskDetailModal의 큰 doc 편집창과 동일한 형태로, 오늘의 업무 등에서 바로 열 수 있게 분리한 컴포넌트.
 */
export default function TaskDocModal({
  taskId,
  title,
  readOnly = false,
  onClose,
  onSaved,
}: {
  taskId: string;
  title: string;
  readOnly?: boolean;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [doc, setDoc] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const t = await api.get<TaskDetail>(`/tasks/${taskId}`);
        setDoc(t.aiDescriptionDoc ?? "");
      } finally {
        setLoading(false);
      }
    })();
  }, [taskId]);

  async function save() {
    setBusy(true);
    try {
      await api.patch(`/tasks/${taskId}`, { aiDescriptionDoc: doc.trim() || undefined });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onSaved?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--surface,#fff)",
        zIndex: 60,
        display: "flex",
        flexDirection: "column",
        padding: 20,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div className="sec-title">
          <span className="em">🤖</span> 업무설명 doc — {title}
        </div>
        <span style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          {saved && <span style={{ color: "#16a34a", fontSize: 13 }}>✅ 저장됨</span>}
          {!readOnly && (
            <button className="btn primary" onClick={save} disabled={busy || loading}>
              {busy ? "저장 중…" : "저장"}
            </button>
          )}
          <button className="btn" onClick={onClose}>
            닫기
          </button>
        </span>
      </div>
      {loading ? (
        <div style={{ color: "var(--text-3)", fontSize: 13 }}>불러오는 중…</div>
      ) : (
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, minHeight: 0 }}>
          <textarea
            value={doc}
            onChange={(e) => setDoc(e.target.value)}
            disabled={readOnly}
            placeholder="업무설명 doc (마크다운). 자유롭게 수정하세요."
            style={{
              width: "100%",
              height: "100%",
              resize: "none",
              padding: 16,
              fontSize: 14,
              lineHeight: 1.7,
              border: "1px solid var(--border)",
              borderRadius: 10,
              fontFamily: "inherit",
            }}
          />
          <div
            style={{
              overflow: "auto",
              padding: 16,
              border: "1px solid var(--border)",
              borderRadius: 10,
              background: "var(--surface-2,#fafafa)",
              whiteSpace: "pre-wrap",
              fontSize: 14,
              lineHeight: 1.8,
            }}
          >
            {doc || <span style={{ color: "var(--text-3)" }}>미리보기</span>}
          </div>
        </div>
      )}
    </div>
  );
}
