"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  api,
  type ProjectListItem,
  type Task,
  type User,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import TaskDetailModal from "@/components/TaskDetailModal";
import ReviewModal from "../activity/ReviewModal";

// 업무 대분류 (category) — 대시보드는 롱/쇼츠만(프로젝트는 프로젝트 탭에서)
const CATEGORIES = [
  { key: "long", ic: "⏳", label: "롱", desc: "긴 업무" },
  { key: "shorts", ic: "⚡", label: "쇼츠", desc: "짧은 업무" },
] as const;

const SUBCATS = ["디자인", "개발", "마케팅", "기획", "지점업무", "교육", "운영", "인사·총무"];

const PRIOS = [
  { key: "urgent", label: "긴급" },
  { key: "high", label: "높음" },
  { key: "medium", label: "보통" },
  { key: "low", label: "낮음" },
] as const;

const PRI_TAG: Record<string, { bg: string; fg: string; label: string }> = {
  urgent: { bg: "#fee2e2", fg: "#b91c1c", label: "긴급" },
  high: { bg: "#ffedd5", fg: "#c2410c", label: "높음" },
  medium: { bg: "#e0e7ff", fg: "#4338ca", label: "보통" },
  low: { bg: "#f1f5f9", fg: "#64748b", label: "낮음" },
};

const DEFAULT_AI_PROMPT = `당신은 업무 정의 어시스턴트입니다. 아래 간략 메모를 바탕으로 담당자가 바로 이해하고 착수할 수 있는 업무설명 문서를 작성하세요.
출력: 1) 배경/목적  2) 목표(완료기준)  3) 작업범위  4) 요구 산출물  5) 체크포인트/마감`;

// 배정 탭(요청업무 관리 스타일) 표 헬퍼
function fmtDate(s?: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}
function duration(t: Task) {
  if (!t.startedAt || !t.endedAt) return "—";
  const ms = new Date(t.endedAt).getTime() - new Date(t.startedAt).getTime();
  const h = Math.floor(ms / 3600000);
  const d = Math.floor(h / 24);
  if (d >= 1) return `${d}일 ${h % 24}시간`;
  const m = Math.floor(ms / 60000);
  return h >= 1 ? `${h}시간` : `${m}분`;
}
function deadlineDiff(t: Task): { txt: string; color: string } {
  if (!t.dueDate || !t.endedAt) return { txt: "—", color: "var(--text-3)" };
  const days = Math.ceil((new Date(t.endedAt).getTime() - new Date(t.dueDate).getTime()) / 86400000);
  if (days > 0) return { txt: `+${days}일 초과`, color: "#dc2626" };
  if (days < 0) return { txt: `${-days}일 단축`, color: "#16a34a" };
  return { txt: "정시", color: "#16a34a" };
}
function statusLabel(t: Task) {
  if (t.status === "done") return "완료";
  if (t.status === "completed_pending") return "검수대기";
  if (t.status === "rejected") return "미수락";
  if (t.status === "doing") return "진행중";
  if (t.status === "paused") return "중단";
  return "대기";
}
function ymKey(s?: string | null) {
  if (!s) return "";
  const d = new Date(s);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function DashboardInner() {
  const [users, setUsers] = useState<User[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  // 업무 부여/추가 폼
  const [category, setCategory] = useState<string>("long");
  const [subcat, setSubcat] = useState<string>("디자인");
  const [prio, setPrio] = useState<string>("high");
  const [needReport, setNeedReport] = useState<boolean>(false);
  const [needVideo, setNeedVideo] = useState<boolean>(false);
  const [assigneeId, setAssigneeId] = useState<string>(""); // "" = 미지정(풀에 쌓기)
  const [title, setTitle] = useState<string>("");
  const [dueDate, setDueDate] = useState<string>("");
  const [projectId, setProjectId] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [aiPrompt, setAiPrompt] = useState<string>(DEFAULT_AI_PROMPT);
  const [showPrompt, setShowPrompt] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);
  const [aiDoc, setAiDoc] = useState<string>("");
  const [aiBusy, setAiBusy] = useState(false);
  const [docOpen, setDocOpen] = useState(false);
  // AI 예상 소요시간 (상세설명 기반 자동 측정)
  const [estimate, setEstimate] = useState<{ minutes: number; label: string; rationale: string } | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [estimatedText, setEstimatedText] = useState<string>(""); // 마지막으로 측정한 상세설명(중복 호출 방지)
  const [busyId, setBusyId] = useState<string | null>(null);
  // 업무 풀 탭: 미배정 / 배정 · 배정 탭 담당자·월 필터
  const [detailId, setDetailId] = useState<string | null>(null);
  const [reviewTask, setReviewTask] = useState<Task | null>(null);
  const router = useRouter();
  const sp = useSearchParams();
  // 탭을 URL에 저장 → 상세 열고 뒤로가기/새로고침해도 그 탭에 머묾 (replace라 히스토리 안 늘림)
  const tab: "unassigned" | "assigned" = sp.get("tab") === "assigned" ? "assigned" : "unassigned";
  const setTab = (k: "unassigned" | "assigned") => router.replace(`/dashboard?tab=${k}`, { scroll: false });
  const [who, setWho] = useState("all");
  const [month, setMonth] = useState("all");

  const { user: me } = useAuth();

  async function load() {
    setLoading(true);
    setLoadErr(null);
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
      setLoadErr(e instanceof Error ? e.message : "불러오기 실패");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const outputHint = [
    needReport ? "보고 형식 안내 (예: 주차별 진행률 포함)" : null,
    needVideo ? "영상에 담을 항목 (예: 결과 시연 / 코드 설명)" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // 미배정 풀 = 내가 만들었지만(assigner=나) 아직 담당자 미지정인 미완료 업무 (남이 만든 건 안 보임)
  const pool = tasks.filter(
    (t) => !t.assignee && t.status !== "done" && t.assigner?.id === me?.id,
  );
  // 배정 업무 = 내가 배정(요청)한 업무만 (내 활동 > 요청한 업무와 동일)
  const assigned = tasks.filter(
    (t) => t.assigner?.id === me?.id && !!t.assignee && t.assignee.id !== me?.id,
  );
  const assignees = Array.from(new Map(assigned.map((t) => [t.assignee!.id, t.assignee!])).values());
  const assignedRows = assigned
    .filter((t) => (who === "all" ? true : t.assignee?.id === who))
    .filter((t) => (month === "all" ? true : ymKey(t.endedAt || t.createdAt) === month))
    .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());
  // 담당자별 종합 통계 (담당자 선택 시)
  const summary = useMemo(() => {
    if (who === "all") return null;
    const list = assignedRows;
    const done = list.filter((t) => t.endedAt);
    const withDue = done.filter((t) => t.dueDate);
    const onTime = withDue.filter((t) => new Date(t.endedAt!) <= new Date(t.dueDate!)).length;
    const durations = done
      .map((t) => (t.startedAt && t.endedAt ? new Date(t.endedAt).getTime() - new Date(t.startedAt).getTime() : null))
      .filter((x): x is number => x != null);
    const avgH = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length / 360000) / 10 : 0;
    const rework = list.reduce((a, t) => a + (t.reworkCount ?? 0), 0);
    const g = { 우수: 0, 양호: 0, 보완: 0 } as Record<string, number>;
    list.forEach((t) => { if (t.grade && g[t.grade] != null) g[t.grade]++; });
    return {
      total: list.length,
      done: done.length,
      onTimeRate: withDue.length ? Math.round((onTime / withDue.length) * 100) : null,
      avgH,
      avgRework: list.length ? Math.round((rework / list.length) * 10) / 10 : 0,
      g,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignedRows, who]);
  const personName = assignees.find((p) => p.id === who)?.name ?? "";

  // (태스크·프로젝트 검색은 현황판으로 이동됨)

  async function generateDoc() {
    if (!description.trim()) {
      setSubmitMsg("AI 정리할 상세 설명(메모)을 먼저 입력하세요");
      return;
    }
    setAiBusy(true);
    try {
      const r = await api.post<{ doc: string }>("/ai/task-doc", {
        memo: description,
        prompt: aiPrompt,
        title,
        category,
        subCategory: subcat,
      });
      setAiDoc(r.doc);
    } catch (e) {
      setAiDoc(`(생성 실패: ${e instanceof Error ? e.message : "오류"})`);
    } finally {
      setAiBusy(false);
    }
  }

  // 상세 설명 → AI 예상 소요시간 측정 (설명 바뀌었을 때만)
  async function estimateDuration(force = false) {
    const memo = description.trim();
    if (!memo) { setEstimate(null); setEstimatedText(""); return; }
    if (!force && memo === estimatedText) return; // 이미 이 내용으로 측정함
    setEstimating(true);
    try {
      const r = await api.post<{ minutes: number; label: string; rationale: string }>(
        "/ai/estimate-duration",
        { memo, title, category, subCategory: subcat },
      );
      setEstimate(r);
      setEstimatedText(memo);
    } catch {
      setEstimate(null);
    } finally {
      setEstimating(false);
    }
  }

  // 업무 생성 — 담당자 없으면 풀에 쌓임(assigneeId 미전송)
  async function submitTask() {
    if (!title.trim()) {
      setSubmitMsg("제목을 입력하세요");
      return;
    }
    setSubmitting(true);
    setSubmitMsg(null);
    try {
      await api.post<Task>("/tasks", {
        title: title.trim(),
        category,
        subCategory: subcat,
        priority: prio,
        reportRequired: needReport,
        videoRequired: needVideo,
        assigneeId: assigneeId || undefined,
        assignerId: me?.id,
        projectId: projectId || undefined,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        description: description.trim() || undefined,
        descriptionPrompt: aiPrompt.trim() || undefined,
        aiDescriptionDoc: aiDoc.trim() || undefined,
        estimateMinutes: estimate?.minutes,
      });
      setSubmitMsg(assigneeId ? "✅ 담당자에게 부여했습니다" : "✅ 업무 풀에 쌓았습니다 (담당자 나중에 지정)");
      setTitle("");
      setDescription("");
      setAiDoc("");
      setEstimate(null);
      setEstimatedText("");
      await load();
    } catch (e) {
      setSubmitMsg(e instanceof Error ? e.message : "생성 실패");
    } finally {
      setSubmitting(false);
    }
  }

  // 풀 업무에 담당자 지정 (나에게 = 내 활동으로, 남에게 = 요청받은 업무로)
  async function assignPool(taskId: string, userId: string) {
    setBusyId(taskId);
    try {
      await api.patch(`/tasks/${taskId}`, { assigneeId: userId });
      await load();
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "담당자 지정 실패");
    } finally {
      setBusyId(null);
    }
  }
  async function delPool(taskId: string) {
    setBusyId(taskId);
    try {
      await api.del(`/tasks/${taskId}`);
      await load();
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "삭제 실패");
    } finally {
      setBusyId(null);
    }
  }
  async function requestAgain(taskId: string) {
    setBusyId(taskId);
    try {
      await api.post(`/tasks/${taskId}/request-again`, {});
      await load();
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "재요청 실패");
    } finally {
      setBusyId(null);
    }
  }
  const canDelete = (t: Task) => !!me && (!!me.isAdmin || t.assigner?.id === me.id);
  // 배정 탭 월 이동(◀ 이전달 / 다음달 ▶). "전체"에서 시작하면 현재 달 기준.
  function shiftMonth(delta: number) {
    const base =
      month === "all"
        ? { y: new Date().getFullYear(), m: new Date().getMonth() }
        : { y: Number(month.slice(0, 4)), m: Number(month.slice(5)) - 1 };
    const d = new Date(base.y, base.m + delta, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Task Pool 업무 풀</h1>
          <div className="sub">Task Pool · assign to owners 업무를 쌓아두고 담당자에게 배분 · 미지정은 풀에 대기</div>
        </div>
        <div className="topbar-right">
          <div className="avatar" style={{ background: me?.avatarColor ?? "#4f46e5" }}>
            {me ? me.name.slice(0, 1) : "나"}
          </div>
        </div>
      </div>

      <div className="content">
        {loadErr && (
          <div className="card" style={{ color: "#dc2626", marginBottom: 16 }}>API 오류: {loadErr}</div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(340px, 420px)", gap: 18, alignItems: "start" }}>
          {/* 좌: 업무 풀 (미배정 | 배정 탭) */}
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ display: "flex", gap: 6, padding: "10px 12px 0", borderBottom: "1px solid var(--border)" }}>
              {([["unassigned", `미배정 ${pool.length}`], ["assigned", `배정 ${assigned.length}`]] as const).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  style={{
                    border: "none", background: "none", cursor: "pointer",
                    padding: "8px 12px", fontSize: 14, fontWeight: 700,
                    color: tab === k ? "var(--primary)" : "var(--text-3)",
                    borderBottom: `2px solid ${tab === k ? "var(--primary)" : "transparent"}`,
                    marginBottom: -1,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === "unassigned" ? (
              <>
                <div style={{ padding: "12px 14px 14px", display: "grid", gap: 6 }}>
                  {loading && <div style={{ color: "var(--text-3)", fontSize: 13 }}>불러오는 중…</div>}
                  {!loading && pool.length === 0 && (
                    <div style={{ color: "var(--text-3)", fontSize: 13 }}>
                      담당자 미지정 업무가 없어요. 오른쪽에서 <b>담당자 미지정</b>으로 만들면 여기 쌓입니다.
                    </div>
                  )}
                  {pool.map((t) => (
                    <div
                      key={t.id}
                      style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "9px 10px", border: "1px solid var(--border)", borderRadius: 8 }}
                    >
                      <span className="pill" style={{ background: PRI_TAG[t.priority].bg, color: PRI_TAG[t.priority].fg, fontSize: 10 }}>{PRI_TAG[t.priority].label}</span>
                      {t.subCategory && <span className="pill gray" style={{ fontSize: 10 }}>{t.subCategory}</span>}
                      <span
                        onClick={() => setDetailId(t.id)}
                        title="업무 상세 보기"
                        style={{ flex: 1, minWidth: 120, fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}
                      >
                        {t.project && <span style={{ color: "var(--text-3)", fontSize: 11.5, fontWeight: 400 }}>({t.project.name}) </span>}
                        {t.title}
                      </span>
                      {me && (
                        <button className="btn sm" onClick={() => assignPool(t.id, me.id)} disabled={busyId === t.id} title="나에게 담기 → 내 활동으로">
                          🙋 나에게
                        </button>
                      )}
                      <select
                        className="inp"
                        value=""
                        onChange={(e) => { if (e.target.value) void assignPool(t.id, e.target.value); }}
                        disabled={busyId === t.id}
                        style={{ width: 120, fontSize: 12 }}
                      >
                        <option value="">담당자 지정…</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                      {canDelete(t) && (
                        <button className="btn sm" style={{ color: "#dc2626" }} onClick={() => delPool(t.id)} disabled={busyId === t.id} title="삭제">🗑</button>
                      )}
                    </div>
                  ))}
                </div>
                <div className="hint" style={{ padding: "0 14px 14px" }}>
                  🙋 나에게 = 내 활동으로 이동 · 담당자 지정 = 그 사람의 "요청받은 업무"로
                </div>
              </>
            ) : (
              <>
                <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "10px 14px" }}>
                  <span style={{ fontSize: 12, color: "var(--text-3)" }}>담당자</span>
                  <select className="inp" value={who} onChange={(e) => setWho(e.target.value)} style={{ width: 130, fontSize: 12 }}>
                    <option value="all">전체</option>
                    {assignees.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <span style={{ fontSize: 12, color: "var(--text-3)" }}>월(완료 기준)</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <button className="btn sm" onClick={() => shiftMonth(-1)} title="이전 달">◀</button>
                    <b style={{ minWidth: 62, textAlign: "center", fontSize: 12.5 }}>
                      {month === "all" ? "전체" : `${month.slice(0, 4)}.${Number(month.slice(5))}`}
                    </b>
                    <button className="btn sm" onClick={() => shiftMonth(1)} title="다음 달">▶</button>
                    <button className={`btn sm${month === "all" ? " primary" : ""}`} style={{ marginLeft: 2 }} onClick={() => setMonth("all")}>전체</button>
                  </div>
                  <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-2)" }}>총 {assignedRows.length}건</span>
                </div>
                {summary && (
                  <div style={{ margin: "0 14px 12px", padding: 14, background: "var(--surface-2,#fafafa)", border: "1px solid var(--border)", borderRadius: 10 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>📊 {personName}님 종합 ({month === "all" ? "전체" : month})</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(90px,1fr))", gap: 8 }}>
                      {[
                        ["요청", `${summary.total}건`],
                        ["완료", `${summary.done}건`],
                        ["마감 준수율", summary.onTimeRate == null ? "—" : `${summary.onTimeRate}%`],
                        ["평균 소요", `${summary.avgH}시간`],
                        ["평균 재작업", `${summary.avgRework}회`],
                        ["등급", `우수 ${summary.g.우수}·양호 ${summary.g.양호}·보완 ${summary.g.보완}`],
                      ].map(([k, v]) => (
                        <div key={k} style={{ background: "var(--surface,#fff)", borderRadius: 8, padding: "8px 10px" }}>
                          <div style={{ fontSize: 10.5, color: "var(--text-3)" }}>{k}</div>
                          <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>{v}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div style={{ overflow: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left", color: "var(--text-3)", fontSize: 11 }}>
                        {["업무", "담당자", "상태", "요청일", "수락일", "미수락 사유", "소요", "완료일", "마감대비", "재작업", "등급", ""].map((hd, i) => (
                          <th key={i} style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>{hd}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {assignedRows.length === 0 && (
                        <tr><td colSpan={12} style={{ padding: 20, color: "var(--text-3)", textAlign: "center" }}>배정된 업무가 없어요.</td></tr>
                      )}
                      {assignedRows.map((t) => {
                        const dd = deadlineDiff(t);
                        const isRejected = t.status === "rejected";
                        const isReview = t.status === "completed_pending";
                        const isCompleted = t.status === "completed_pending" || t.status === "done";
                        const canManage = !!me && (!!me.isAdmin || t.assigner?.id === me.id);
                        const stBg = isRejected ? "#fee2e2" : isReview ? "#fef3c7" : "#eef0fe";
                        const stFg = isRejected ? "#b91c1c" : isReview ? "#a16207" : "#4338ca";
                        return (
                          <tr key={t.id} onClick={() => setDetailId(t.id)} title="업무 상세 보기" style={{ borderBottom: "1px solid var(--border)", cursor: "pointer", background: isRejected ? "#fff5f5" : undefined }}>
                            <td style={{ padding: "8px 10px", minWidth: 150 }}>
                              {t.project && <span style={{ color: "var(--text-3)", fontSize: 11 }}>({t.project.name}) </span>}
                              {t.title}
                            </td>
                            <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>{t.assignee?.name}</td>
                            <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                              <span className="pill" style={{ background: stBg, color: stFg, fontSize: 10 }}>{statusLabel(t)}</span>
                            </td>
                            <td style={{ padding: "8px 10px", whiteSpace: "nowrap", color: "var(--text-3)" }}>{fmtDate(t.createdAt)}</td>
                            <td style={{ padding: "8px 10px", whiteSpace: "nowrap", color: "var(--text-3)" }}>{fmtDate(t.acceptedAt)}</td>
                            <td style={{ padding: "8px 10px", fontSize: 11.5, color: "#b91c1c", maxWidth: 160 }}>{isRejected && t.rejectReason ? t.rejectReason : "—"}</td>
                            <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>{duration(t)}</td>
                            <td style={{ padding: "8px 10px", whiteSpace: "nowrap", color: "var(--text-3)" }}>{fmtDate(t.endedAt)}</td>
                            <td style={{ padding: "8px 10px", whiteSpace: "nowrap", color: dd.color }}>{dd.txt}</td>
                            <td style={{ padding: "8px 10px", textAlign: "center", color: t.reworkCount ? "#c2410c" : "var(--text-3)" }}>{t.reworkCount ? `#${t.reworkCount}` : "—"}</td>
                            <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>{t.grade ? <span className="pill" style={{ background: "#ede9fe", color: "#6d28d9", fontSize: 10 }}>{t.grade}</span> : "—"}</td>
                            <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                              {isRejected && canManage ? (
                                <span style={{ display: "flex", gap: 4 }}>
                                  <button className="btn sm" style={{ color: "#4338ca", borderColor: "#c7d2fe" }} onClick={() => requestAgain(t.id)} disabled={busyId === t.id} title="다시 수락 요청">↻ 재요청</button>
                                  <button className="btn sm" style={{ color: "#dc2626" }} onClick={() => delPool(t.id)} disabled={busyId === t.id} title="업무 취소(삭제)">🗑</button>
                                </span>
                              ) : isCompleted && canManage ? (
                                <button className="btn primary sm" onClick={() => setReviewTask(t)} disabled={busyId === t.id} title="완료 검수 · AI 평가 · 등급">{t.grade ? "🔁 재검수" : "🔍 검수"}</button>
                              ) : (
                                "—"
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          {/* 우: 업무 부여/추가 */}
          <div className="dash-right">
            <div className="card">
              <div className="panel-head">
                <div className="sec-title"><span className="em">➕</span> 업무 추가</div>
              </div>

              {/* 제목 + 우선순위 */}
              <div className="assign-field">
                <label>제목 · 우선순위</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input className="inp" style={{ flex: 1 }} placeholder="예: 6월 신메뉴 포스터 디자인" value={title} onChange={(e) => setTitle(e.target.value)} />
                  <select className="inp" style={{ width: 100, flexShrink: 0 }} value={prio} onChange={(e) => setPrio(e.target.value)}>
                    {PRIOS.map((p) => (
                      <option key={p.key} value={p.key}>{p.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 대분류 */}
              <div className="assign-field">
                <label>대분류</label>
                <div className="cat-row">
                  {CATEGORIES.map((c) => (
                    <div key={c.key} className={`cat${category === c.key ? " on" : ""}`} onClick={() => setCategory(c.key)}>
                      {c.ic} {c.label}
                    </div>
                  ))}
                </div>
              </div>

              {/* 소분류 */}
              <div className="assign-field">
                <label>소분류 (업무 영역)</label>
                <div className="chips">
                  {SUBCATS.map((s) => (
                    <span key={s} className={`chip${subcat === s ? " on" : ""}`} onClick={() => setSubcat(s)}>{s}</span>
                  ))}
                </div>
              </div>

              {/* 산출물 요구 */}
              <div className="assign-field">
                <label>산출물 요구</label>
                <div className="chk-row">
                  <label className="chk">
                    <input type="checkbox" checked={needReport} onChange={(e) => setNeedReport(e.target.checked)} /> 📊 보고링크
                  </label>
                  <label className="chk">
                    <input type="checkbox" checked={needVideo} onChange={(e) => setNeedVideo(e.target.checked)} /> 🎥 설명영상
                  </label>
                </div>
              </div>

              {/* 담당자 */}
              <div className="assign-field">
                <label>담당자 <span style={{ color: "var(--text-3)", fontWeight: 400 }}>(미지정 시 풀에 쌓임)</span></label>
                <div className="chips">
                  <span className={`chip${assigneeId === "" ? " on" : ""}`} onClick={() => setAssigneeId("")}>미지정(풀)</span>
                  {users.map((u) => (
                    <span key={u.id} className={`chip${assigneeId === u.id ? " on" : ""}`} onClick={() => setAssigneeId(u.id)}>{u.name}</span>
                  ))}
                </div>
              </div>

              {/* 상세 설명 + AI 예상 소요시간 자동 측정 */}
              <div className="assign-field">
                <label>상세 설명</label>
                <textarea
                  className="inp"
                  placeholder="업무 내용을 적으면 AI가 예상 소요시간을 자동 측정해줘요 (요약본도 만들 수 있어요)"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onBlur={() => void estimateDuration()}
                  style={{ minHeight: 84 }}
                />
                {outputHint && <div className="field-hint">💡 {outputHint}</div>}
                {estimating ? (
                  <div className="field-hint">⏱ 예상 소요시간 측정 중…</div>
                ) : estimate ? (
                  <div className="field-hint" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span>⏱ 예상 소요시간 <b style={{ color: "var(--text-1)" }}>{estimate.label}</b></span>
                    <button type="button" className="btn sm" style={{ padding: "2px 8px" }} onClick={() => void estimateDuration(true)}>다시 측정</button>
                    <span style={{ flexBasis: "100%", color: "var(--text-3)" }}>{estimate.rationale}</span>
                  </div>
                ) : description.trim() ? (
                  <button type="button" className="btn sm" style={{ marginTop: 6 }} onClick={() => void estimateDuration(true)}>⏱ 소요시간 측정</button>
                ) : null}
              </div>

              {/* 마감기한 + 업무설명 요약본 링크 */}
              <div className="assign-field">
                <label>마감기한 · 업무설명 요약본</label>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input className="inp" type="date" style={{ flex: 1 }} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                  <button type="button" className="btn sm" style={{ flexShrink: 0 }} onClick={() => setDocOpen(true)} title="AI 업무설명 요약본 작성·확인">
                    📄 요약본{aiDoc.trim() ? " ✓" : ""}
                  </button>
                </div>
              </div>

              {submitMsg && (
                <div className="field-hint" style={{ color: submitMsg.startsWith("✅") ? "#16a34a" : "#dc2626" }}>{submitMsg}</div>
              )}

              {/* 완료 */}
              <button className="btn primary" style={{ width: "100%", marginTop: 4 }} onClick={submitTask} disabled={submitting}>
                {submitting ? "처리 중…" : assigneeId ? "완료 · 담당자에게 배정" : "완료 · 업무풀에 쌓기"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {detailId && (
        <TaskDetailModal
          taskId={detailId}
          onClose={() => setDetailId(null)}
          onSaved={() => { setDetailId(null); void load(); }}
          onDeleted={() => { setDetailId(null); void load(); }}
        />
      )}

      {reviewTask && (
        <ReviewModal
          task={reviewTask}
          onClose={() => setReviewTask(null)}
          onDone={() => { setReviewTask(null); void load(); }}
        />
      )}

      {docOpen && (
        <div
          onClick={() => setDocOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "grid", placeItems: "center", zIndex: 60, padding: 20 }}
        >
          <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: "100%", maxWidth: 560, maxHeight: "85vh", overflow: "auto", padding: 22 }}>
            <div className="sec-title mb16"><span className="em">📄</span> 업무설명 요약본</div>
            <div className="field-hint" style={{ marginBottom: 10 }}>
              상세 설명을 AI가 정돈된 업무설명 문서로 만들어줍니다. 직접 수정·추가도 가능해요.
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <button type="button" className="btn" onClick={generateDoc} disabled={aiBusy}>
                {aiBusy ? "생성 중…" : "🤖 AI 요약본 생성"}
              </button>
              <button type="button" className="btn sm" style={{ marginLeft: "auto" }} onClick={() => setShowPrompt((s) => !s)}>
                {showPrompt ? "프롬프트 숨기기" : "프롬프트 수정"}
              </button>
            </div>
            {showPrompt && (
              <textarea className="inp" value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} style={{ minHeight: 88, marginBottom: 8 }} />
            )}
            <textarea
              className="inp"
              value={aiDoc}
              onChange={(e) => setAiDoc(e.target.value)}
              placeholder="AI로 생성하거나 직접 작성·추가하세요"
              style={{ minHeight: 240 }}
            />
            <button className="btn primary" style={{ width: "100%", marginTop: 12 }} onClick={() => setDocOpen(false)}>확인</button>
          </div>
        </div>
      )}
    </>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <DashboardInner />
    </Suspense>
  );
}
