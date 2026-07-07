"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, progressColor, type ProjectListItem, type Task, type User } from "@/lib/api";

export default function MonitorPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setErr(null);
    try {
      const [u, t, p] = await Promise.all([
        api.get<User[]>("/users"),
        api.get<Task[]>("/tasks"),
        api.get<ProjectListItem[]>("/projects"),
      ]);
      setUsers(u);
      setTasks(t);
      setProjects(p);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Load failed 불러오기 실패");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    const id = setInterval(load, 20000); // 20초마다 실시간 갱신
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 각 사용자의 현재 진행중(doing) 업무
  const doingByUser = new Map<string, Task>();
  for (const t of tasks) {
    if (t.status === "doing" && t.assignee && !doingByUser.has(t.assignee.id)) {
      doingByUser.set(t.assignee.id, t);
    }
  }
  // 접속 판정: 하트비트(60s)보다 넉넉히 2.5분 이내면 온라인
  const OFFLINE_MS = 150_000;
  const nowMs = Date.now();
  const isOnline = (u: User) =>
    !!u.lastSeenAt && nowMs - new Date(u.lastSeenAt).getTime() < OFFLINE_MS;
  // 현황 우선순위: 오프라인(미접속) > 방해금지 > 자리비움(수동 상태) > 업무 종료(퇴근) > 진행중 > 대기
  const presenceOf = (u: User): { label: string; dot: string; sub?: string } => {
    if (!isOnline(u)) return { label: "Offline 오프라인", dot: "#9ca3af" };
    const msg = u.statusMessage?.trim() || undefined;
    if (u.status === "dnd") return { label: "DND 방해금지", dot: "#ef4444", sub: msg };
    if (u.status === "away") return { label: "Away 자리비움", dot: "#eab308", sub: msg };
    if (u.clockedOut) return { label: "Ended 업무 종료", dot: "#6366f1" };
    const task = doingByUser.get(u.id);
    if (task) return { label: "Working 진행중", dot: "#22c55e", sub: task.title };
    return { label: "Idle 대기 중", dot: "#22c55e", sub: msg };
  };
  const onlineCount = users.filter(isOnline).length;

  // 검색: 프로젝트명 / 태스크 제목·업무영역
  const search = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return { projects: [] as ProjectListItem[], tasks: [] as Task[] };
    return {
      projects: projects.filter((p) => p.name.toLowerCase().includes(term)).slice(0, 5),
      tasks: tasks
        .filter(
          (t) =>
            t.title.toLowerCase().includes(term) ||
            (t.subCategory?.toLowerCase().includes(term) ?? false),
        )
        .slice(0, 8),
    };
  }, [q, projects, tasks]);
  const hasResults = search.projects.length > 0 || search.tasks.length > 0;

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Status Board 현황판</h1>
          <div className="sub">Team Live Status 팀 실시간 업무 현황</div>
        </div>
        <div className="topbar-right">
          <div className="search" style={{ position: "relative" }}>
            🔍
            <input
              placeholder="Search tasks · projects 태스크 · 프로젝트 검색"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {q.trim() && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  right: 0,
                  width: 320,
                  maxHeight: 360,
                  overflow: "auto",
                  background: "var(--surface, #fff)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                  zIndex: 40,
                  padding: 6,
                }}
              >
                {!hasResults && (
                  <div style={{ padding: 12, fontSize: 13, color: "var(--text-3)" }}>No results 검색 결과가 없어요.</div>
                )}
                {search.projects.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => setQ("")}
                    style={{ padding: "8px 10px", borderRadius: 6, cursor: "default", fontSize: 13.5 }}
                  >
                    📁 {p.name}
                  </div>
                ))}
                {search.tasks.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => setQ("")}
                    style={{ padding: "8px 10px", borderRadius: 6, cursor: "default", fontSize: 13.5, display: "flex", gap: 6, alignItems: "center" }}
                  >
                    📋 {t.title}
                    {t.project && <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-3)" }}>{t.project.name}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="content">
        {err && (
          <div className="card" style={{ color: "#dc2626", marginBottom: 16 }}>
            API error API 오류: {err}
          </div>
        )}
        <div className="card">
          <div className="panel-head">
            <div className="sec-title">
              <span className="em">🟢</span> Live Status 실시간 업무현황
            </div>
            <span className="live">
              <span className="ping" />
              LIVE
            </span>
            <span className="count">Online {onlineCount} 접속 {onlineCount}명</span>
          </div>
          <div className="team-grid">
            {loading && <div style={{ color: "var(--text-3)", fontSize: 13 }}>Loading… 불러오는 중…</div>}
            {!loading &&
              users.map((m) => {
                const p = presenceOf(m);
                const task = p.label === "Working 진행중" ? doingByUser.get(m.id) : undefined;
                const pct = task?.progress ?? 0;
                return (
                  <Link
                    className="member"
                    key={m.id}
                    href={`/activity?userId=${m.id}`}
                    title={`View ${m.name}'s activity ${m.name}님의 활동 보기`}
                    style={{ cursor: "pointer", textDecoration: "none", color: "inherit" }}
                  >
                    <div className="member-top">
                      <div className="member-av">
                        <div className="avatar" style={{ background: m.avatarColor, width: 36, height: 36 }}>
                          {m.name.slice(0, 1)}
                        </div>
                        <span className="dot" style={{ background: p.dot }} />
                      </div>
                      <div>
                        <div className="member-name">{m.name}</div>
                        <div className="member-dept">{m.dept ?? ""}</div>
                      </div>
                      <span className="pill gray" style={{ marginLeft: "auto" }}>
                        {task?.project?.name ?? "—"}
                      </span>
                    </div>
                    <div className="member-task">
                      {p.label}{p.sub ? " · " : ""}
                      <b>{p.sub ?? ""}</b>
                    </div>
                    {task?.statusMemo && (
                      <div
                        style={{
                          fontSize: 11.5,
                          color: "var(--text-3)",
                          marginTop: 2,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        📝 {task.statusMemo}
                      </div>
                    )}
                    <div className="member-foot">
                      <div className="prog" style={{ flex: 1 }}>
                        <i style={{ width: `${pct}%`, background: progressColor(pct) }} />
                      </div>
                      <span className="pct" style={{ color: progressColor(pct) }}>
                        {pct}%
                      </span>
                    </div>
                  </Link>
                );
              })}
          </div>
        </div>
      </div>
    </>
  );
}
