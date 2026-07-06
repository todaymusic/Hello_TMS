"use client";

import { useEffect, useMemo, useState } from "react";
import { api, type ScheduleBlock, type Task } from "@/lib/api";

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};
const toHHMM = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
// 브라우저 로컬 기준 YYYY-MM-DD (백엔드 date 필터는 UTC라 로컬로 재판정해야 함)
const localYmd = (dt: Date) =>
  `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;

const PRI_COLOR: Record<string, string> = {
  urgent: "#dc2626",
  high: "#ea580c",
  medium: "#4f46e5",
  low: "#64748b",
};

type WorkLog = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  task: { id: string; title: string } | null;
};

export default function ScheduleBoard({
  userId,
  dateKey,
  workStart,
  workEnd,
  tasks,
  dragTasks,
  readOnly = false,
}: {
  userId: string;
  dateKey: string; // YYYY-MM-DD
  workStart?: string | null;
  workEnd?: string | null;
  tasks: Task[]; // 실제 타임라인 소스(시작~종료 기록)
  dragTasks?: Task[]; // 드래그 소스(오늘의 업무). 없으면 tasks
  readOnly?: boolean;
}) {
  const chips = dragTasks ?? tasks;
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [logs, setLogs] = useState<WorkLog[]>([]);
  const [editing, setEditing] = useState<ScheduleBlock | null>(null);
  // 현재 시각(분) — 30초마다 갱신 → 줄이 내려감
  const [nowMin, setNowMin] = useState(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  });
  useEffect(() => {
    const id = setInterval(() => {
      const d = new Date();
      setNowMin(d.getHours() * 60 + d.getMinutes());
    }, 30000);
    return () => clearInterval(id);
  }, []);

  const startMin = toMin(workStart || "09:00");
  const endMin = toMin(workEnd || "18:00");
  const total = Math.max(endMin - startMin, 60);
  const H = Math.max(total * 0.85, 360); // px
  const scale = H / total;
  const yOf = (min: number) => (Math.min(Math.max(min, startMin), endMin) - startMin) * scale;

  async function load() {
    try {
      const b = await api.get<ScheduleBlock[]>(`/schedule?userId=${userId}&date=${dateKey}`);
      setBlocks(b);
    } catch {
      /* noop */
    }
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, dateKey]);

  // 실제 근무 로그(WorkLog 세션) — 업무 시작/중단/재개 시 tasks가 바뀌면 다시 불러옴.
  // 백엔드 date 필터가 UTC라, 로컬 하루가 걸치는 전날+당일(UTC 48h)을 받아 로컬 날짜로 재필터.
  async function loadLogs() {
    try {
      const prev = new Date(`${dateKey}T00:00:00`);
      prev.setDate(prev.getDate() - 1);
      const prevKey = localYmd(prev);
      const [a, b] = await Promise.all([
        api.get<WorkLog[]>(`/worklogs?userId=${userId}&date=${dateKey}`),
        api.get<WorkLog[]>(`/worklogs?userId=${userId}&date=${prevKey}`),
      ]);
      const map = new Map<string, WorkLog>();
      [...a, ...b].forEach((w) => map.set(w.id, w));
      setLogs([...map.values()]);
    } catch {
      /* noop */
    }
  }
  useEffect(() => {
    void loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, dateKey, tasks]);

  async function addBlock(taskId: string | undefined, label: string | undefined, s: number, e: number) {
    const created = await api.post<ScheduleBlock>("/schedule", {
      userId,
      date: dateKey,
      taskId,
      label,
      startMin: s,
      endMin: e,
    });
    setBlocks((c) => [...c, created]);
  }
  async function updateBlock(id: string, s: number, e: number) {
    const u = await api.patch<ScheduleBlock>(`/schedule/${id}`, { startMin: s, endMin: e });
    setBlocks((c) => c.map((b) => (b.id === id ? u : b)));
  }
  async function removeBlock(id: string) {
    await api.del(`/schedule/${id}`);
    setBlocks((c) => c.filter((b) => b.id !== id));
    setEditing(null);
  }

  function onDrop(e: React.DragEvent) {
    if (readOnly) return;
    e.preventDefault();
    const taskId = e.dataTransfer.getData("taskId");
    if (!taskId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    let s = startMin + Math.round((y / scale) / 15) * 15;
    s = Math.min(Math.max(s, startMin), endMin - 30);
    void addBlock(taskId, undefined, s, Math.min(s + 60, endMin));
  }


  // 실제 타임라인 = 그날(로컬)의 WorkLog 세션(시작~중단/종료). 세션별로 블록 표시.
  const actual = useMemo(
    () =>
      logs
        .filter((l) => localYmd(new Date(l.startedAt)) === dateKey)
        .map((l) => {
          const s = new Date(l.startedAt);
          const e = l.endedAt ? new Date(l.endedAt) : new Date();
          return {
            id: l.id,
            title: l.task?.title ?? "업무",
            done: !!l.endedAt,
            s: s.getHours() * 60 + s.getMinutes(),
            e: e.getHours() * 60 + e.getMinutes(),
          };
        }),
    [logs, dateKey],
  );

  // 시간 눈금(매시)
  const hours: number[] = [];
  for (let m = Math.ceil(startMin / 60) * 60; m <= endMin; m += 60) hours.push(m);

  const Axis = () => (
    <div style={{ position: "relative", width: 38, height: H, flexShrink: 0 }}>
      {hours.map((m) => (
        <div key={m} style={{ position: "absolute", top: yOf(m) - 6, right: 4, fontSize: 10, color: "var(--text-3)" }}>
          {toHHMM(m)}
        </div>
      ))}
    </div>
  );
  const showNow = nowMin >= startMin && nowMin <= endMin;
  const NowLine = ({ label = false }: { label?: boolean }) =>
    showNow ? (
      <div
        style={{
          position: "absolute",
          top: yOf(nowMin),
          left: 0,
          right: 0,
          borderTop: "2px solid #dc2626",
          zIndex: 6,
        }}
      >
        <span style={{ position: "absolute", left: -3, top: -4, width: 7, height: 7, borderRadius: "50%", background: "#dc2626" }} />
        {label && (
          <span style={{ position: "absolute", right: 2, top: -8, background: "#dc2626", color: "#fff", fontSize: 9, fontWeight: 700, padding: "0 5px", borderRadius: 4 }}>
            지금 {toHHMM(nowMin)}
          </span>
        )}
      </div>
    ) : null;

  const Grid = () =>
    hours.map((m) => (
      <div
        key={m}
        style={{
          position: "absolute",
          top: yOf(m),
          left: 0,
          right: 0,
          borderTop: "1px solid #e5e7eb",
        }}
      >
        <span style={{ position: "absolute", left: 3, top: 1, fontSize: 9, color: "#b0b0b0" }}>
          {toHHMM(m)}
        </span>
      </div>
    ));

  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="panel-head" style={{ marginBottom: 10 }}>
        <div className="sec-title"><span className="em">📅</span> 오늘 스케줄 (계획 ‖ 실제)</div>
        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-3)" }}>
          근무 {workStart || "09:00"}~{workEnd || "18:00"}
        </span>
      </div>

      {/* 드래그 소스: 오늘의 업무 */}
      {!readOnly && (
        <div style={{ marginBottom: 10 }}>
          <div className="hint" style={{ marginBottom: 4 }}>아래 업무를 ↓ 계획 타임라인으로 드래그하세요 (1시간 블록 생성 후 클릭해 시간 조정)</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {chips.length === 0 && <span style={{ fontSize: 12, color: "var(--text-3)" }}>오늘의 업무 없음</span>}
            {chips.map((t) => (
              <span
                key={t.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("taskId", t.id);
                  e.dataTransfer.effectAllowed = "copy";
                }}
                className="chip"
                style={{ cursor: "grab", borderLeft: `3px solid ${PRI_COLOR[t.priority]}` }}
              >
                {t.title}
              </span>
            ))}
            <button className="btn sm" onClick={() => addBlock(undefined, "점심", 12 * 60, 13 * 60)}>
              🍴 점심 추가
            </button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <Axis />
        {/* 계획 */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4, textAlign: "center" }}>📋 계획</div>
          <div
            onDragOver={(e) => !readOnly && e.preventDefault()}
            onDrop={onDrop}
            style={{ position: "relative", height: H, border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface-2,#fafafa)" }}
          >
            <Grid />
            <NowLine label />
            {blocks.map((b) => {
              const top = yOf(b.startMin);
              const h = Math.max((b.endMin - b.startMin) * scale, 16);
              const lunch = !b.taskId;
              return (
                <div
                  key={b.id}
                  onClick={() => !readOnly && setEditing(b)}
                  title={`${toHHMM(b.startMin)}~${toHHMM(b.endMin)}`}
                  style={{
                    position: "absolute", top, left: 3, right: 3, height: h,
                    background: lunch ? "#fde68a" : "#dbeafe",
                    border: `1px solid ${lunch ? "#f59e0b" : "#60a5fa"}`,
                    borderRadius: 6, padding: "2px 6px", fontSize: 11, overflow: "hidden",
                    cursor: readOnly ? "default" : "pointer", color: "#1e3a8a",
                  }}
                >
                  <b>{lunch ? "🍴 점심" : b.task?.title}</b>
                  <div style={{ fontSize: 9, opacity: 0.7 }}>{toHHMM(b.startMin)}~{toHHMM(b.endMin)}</div>
                </div>
              );
            })}
          </div>
        </div>
        {/* 실제 */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4, textAlign: "center" }}>✅ 실제</div>
          <div style={{ position: "relative", height: H, border: "1px solid var(--border)", borderRadius: 8 }}>
            <Grid />
            <NowLine />
            {actual.map((a) => {
              const top = yOf(a.s);
              const h = Math.max((Math.min(a.e, endMin) - a.s) * scale, 16);
              return (
                <div
                  key={a.id}
                  title={`${toHHMM(a.s)}~${a.done ? toHHMM(a.e) : "진행중"}`}
                  style={{
                    position: "absolute", top, left: 3, right: 3, height: h,
                    background: a.done ? "#dcfce7" : "#fef3c7",
                    border: `1px solid ${a.done ? "#22c55e" : "#f59e0b"}`,
                    borderRadius: 6, padding: "2px 6px", fontSize: 11, overflow: "hidden",
                  }}
                >
                  <b style={{ color: "#111" }}>{a.title}</b>
                  <div style={{ fontSize: 9, color: "#555" }}>{toHHMM(a.s)}~{a.done ? toHHMM(a.e) : "진행중"}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 블록 시간 편집 */}
      {editing && (
        <div
          onClick={() => setEditing(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "grid", placeItems: "center", zIndex: 50 }}
        >
          <div onClick={(e) => e.stopPropagation()} className="card" style={{ padding: 18, width: 300 }}>
            <div className="sec-title mb16" style={{ fontSize: 14 }}>
              {editing.taskId ? editing.task?.title : "점심"} 시간
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="time"
                className="inp"
                defaultValue={toHHMM(editing.startMin)}
                onChange={(e) => (editing.startMin = toMin(e.target.value))}
              />
              ~
              <input
                type="time"
                className="inp"
                defaultValue={toHHMM(editing.endMin)}
                onChange={(e) => (editing.endMin = toMin(e.target.value))}
              />
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button className="btn sm" style={{ color: "#dc2626" }} onClick={() => removeBlock(editing.id)}>삭제</button>
              <button
                className="btn primary sm"
                style={{ marginLeft: "auto" }}
                onClick={() => {
                  if (editing.endMin > editing.startMin) {
                    void updateBlock(editing.id, editing.startMin, editing.endMin);
                  }
                  setEditing(null);
                }}
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
