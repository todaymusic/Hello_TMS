"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api, progressColor, type Leave, type Priority, type Task, type User } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import TaskDetailModal from "@/components/TaskDetailModal";
import TaskDocModal from "@/components/TaskDocModal";
import ScheduleBoard from "@/components/ScheduleBoard";
import ReviewModal from "./ReviewModal";
import EndDayModal, { dailyKey } from "./EndDayModal";

const PRI: Record<Priority, { label: string; bg: string; fg: string }> = {
  urgent: { label: "긴급", bg: "#fee2e2", fg: "#b91c1c" },
  high: { label: "높음", bg: "#ffedd5", fg: "#c2410c" },
  medium: { label: "보통", bg: "#e0e7ff", fg: "#4338ca" },
  low: { label: "낮음", bg: "#f1f5f9", fg: "#64748b" },
};

// 진행률에 따른 카드 배경(연한 톤) — progressColor 버킷과 동일
function progressBg(p: number): string {
  if (p <= 0) return "#f9fafb";
  if (p <= 25) return "#fef2f2";
  if (p <= 50) return "#fff7ed";
  if (p <= 75) return "#fefce8";
  if (p <= 99) return "#eff6ff";
  return "#f0fdf4";
}

function ymd(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
function mdd(s?: string | null) {
  if (!s) return "";
  const d = new Date(s);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

const LEAVE_KO: Record<string, string> = {
  annual: "연차",
  half: "반차",
  quarter: "반반차",
  sick: "병가",
  etc: "기타",
};

type Notif = {
  id: string;
  type: string;
  content: string;
  link: string | null;
  read: boolean;
  createdAt: string;
};

const FEED_IC: Record<string, { cls: string; ic: string }> = {
  mention: { cls: "mention", ic: "@" },
  task: { cls: "task", ic: "📋" },
  dm: { cls: "task", ic: "💬" },
  system: { cls: "sys", ic: "⚠️" },
};


function ago(d: string): string {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

function ActivityInner() {
  const { user: me } = useAuth();
  const sp = useSearchParams();
  const viewId = sp.get("userId");
  const isSelf = !viewId || viewId === me?.id;
  const targetId = viewId || me?.id;

  const [tasks, setTasks] = useState<Task[]>([]);
  const [assigned, setAssigned] = useState<Task[]>([]);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [userLeaves, setUserLeaves] = useState<Leave[]>([]);
  const [targetUser, setTargetUser] = useState<User | null>(null);
  const [targetName, setTargetName] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null); // 미수락 사유 입력 중인 업무
  const [rejectText, setRejectText] = useState("");
  // 업무 종료 산출물 입력 모달
  const [endTask, setEndTask] = useState<Task | null>(null);
  const [endReport, setEndReport] = useState("");
  const [endVideo, setEndVideo] = useState("");
  const [endNote, setEndNote] = useState("");
  const [endBusy, setEndBusy] = useState(false);
  // 날짜 이동(어제/오늘/내일) · 상세 모달 · 퇴근 알림
  const [dayOffset, setDayOffset] = useState(0);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [reviewTask, setReviewTask] = useState<Task | null>(null);
  const [endAlarm, setEndAlarm] = useState(false);
  // 내 업무 빠른 추가
  const [myAddOpen, setMyAddOpen] = useState(false);
  const [myTitle, setMyTitle] = useState("");
  const [myPrio, setMyPrio] = useState<Priority>("medium");
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  // 업무 통계: 월 이동 + 완료/진행중/대기 선택
  const [statMonth, setStatMonth] = useState(() => new Date());
  const [statSel, setStatSel] = useState<"done" | "doing" | "todo" | "overdue" | "rework">("done");
  // 업무 리스트 → 오늘의 업무로 끌어오는 드래그
  const [listDragId, setListDragId] = useState<string | null>(null);
  // 오늘의 업무 → 업무 리스트로 되돌리는 드래그(plannedDate 해제)
  const [todayDragId, setTodayDragId] = useState<string | null>(null);
  // 업무 종료(오늘 리포트) 모달
  const [endDayOpen, setEndDayOpen] = useState(false);
  // 현재 업무중: 메인 업무 지정(개인) + 메인/서브 드래그
  const [mainTaskId, setMainTaskId] = useState<string | null>(null);
  const [curDragId, setCurDragId] = useState<string | null>(null);
  // 업무설명 doc 새 창
  const [docTask, setDocTask] = useState<{ id: string; title: string } | null>(null);
  // 포스트잇 자유 메모(개인 · 서버 DB 저장 + 자동저장, localStorage는 오프라인 캐시)
  const [scratch, setScratch] = useState("");
  const [memoStatus, setMemoStatus] = useState<"idle" | "saving" | "saved">("idle");
  const memoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const memoLatest = useRef<string>("");   // 최신 입력값(즉시 저장/flush용)
  const memoSaved = useRef<string>("");    // 마지막으로 서버에 저장된 값(중복 저장 방지)
  // 지난일 데일리 평가(서버 보관 · localStorage 캐시 폴백)
  const [pastDaily, setPastDaily] = useState<{ comment?: string; review?: string } | null>(null);

  async function load() {
    if (!me || !targetId) return;
    setErr(null);
    // 하루 경계 리셋: 전날부터 진행중이던 내 업무를 '중단'으로 내린 뒤 목록을 불러온다
    // (퇴근/종료를 안 누르고 탭만 닫아도 다음날 '현재 업무중'에 남지 않게)
    if (isSelf && me?.id) {
      try {
        await api.post(`/tasks/day-reset?userId=${me.id}`, {});
      } catch {
        /* 실패해도 아래 목록 로딩은 계속 */
      }
    }
    try {
      const [t, lv, asg] = await Promise.all([
        api.get<Task[]>(`/tasks?assigneeId=${targetId}`),
        api.get<Leave[]>(`/leaves?userId=${targetId}`),
        api.get<Task[]>(`/tasks?assignerId=${targetId}`),
      ]);
      setTasks(t);
      setUserLeaves(lv);
      setAssigned(asg);
      if (isSelf) {
        setNotifs(await api.get<Notif[]>(`/notifications?userId=${me.id}`));
        setTargetName(me.name);
        setTargetUser(me);
      } else {
        // 다른 사람 보기: 이름·근무시간 조회
        const users = await api.get<User[]>("/users");
        const u = users.find((x) => x.id === targetId) ?? null;
        setTargetUser(u);
        setTargetName(u?.name ?? "");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "불러오기 실패");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, viewId]);

  // 포스트잇 메모 불러오기(본인) — 서버 정본, localStorage는 즉시표시·오프라인 폴백
  useEffect(() => {
    if (!me?.id) return;
    let alive = true;
    // 1) 캐시로 즉시 표시(깜빡임 방지)
    try {
      const cached = localStorage.getItem(`tms_scratch_${me.id}`);
      if (cached != null) {
        setScratch(cached);
        memoLatest.current = cached;
      }
    } catch {
      /* noop */
    }
    // 2) 서버 정본 로드
    api
      .get<{ memo: string }>("/auth/memo")
      .then((r) => {
        if (!alive) return;
        const v = r.memo ?? "";
        setScratch(v);
        memoLatest.current = v;
        memoSaved.current = v;
        try {
          if (me?.id) localStorage.setItem(`tms_scratch_${me.id}`, v);
        } catch {
          /* noop */
        }
      })
      .catch(() => {
        /* 오프라인/실패 시 캐시 유지 */
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id]);

  // 서버로 실제 저장(중복·불필요 저장 방지)
  async function flushMemo() {
    if (!me?.id) return;
    const v = memoLatest.current;
    if (v === memoSaved.current) return; // 바뀐 게 없으면 skip
    setMemoStatus("saving");
    try {
      await api.patch("/auth/memo", { memo: v });
      memoSaved.current = v;
      setMemoStatus("saved");
    } catch {
      // 실패해도 localStorage 캐시엔 남아있음 → 다음 입력/이탈 때 재시도
      setMemoStatus("idle");
    }
  }

  function updateScratch(v: string) {
    setScratch(v);
    memoLatest.current = v;
    // 오프라인 대비 즉시 캐시
    try {
      if (me?.id) localStorage.setItem(`tms_scratch_${me.id}`, v);
    } catch {
      /* noop */
    }
    // 디바운스 자동저장(0.8초)
    setMemoStatus("saving");
    if (memoTimer.current) clearTimeout(memoTimer.current);
    memoTimer.current = setTimeout(() => {
      void flushMemo();
    }, 800);
  }

  // 입력칸 이탈/탭 숨김/페이지 이탈 시에도 저장(유실 방지)
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") {
        if (memoTimer.current) clearTimeout(memoTimer.current);
        void flushMemo();
      }
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id]);

  // 지난일 데일리 평가 로드 — 서버 정본(GET /ai/daily-report), localStorage는 즉시표시·폴백
  useEffect(() => {
    if (!me?.id || dayOffset > 0) {
      setPastDaily(null);
      return;
    }
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    let alive = true;
    try {
      const raw = localStorage.getItem(dailyKey(me.id, key));
      setPastDaily(raw ? (JSON.parse(raw) as { comment?: string; review?: string }) : null);
    } catch {
      setPastDaily(null);
    }
    api
      .get<{ comment?: string; review?: string; exists?: boolean }>(
        `/ai/daily-report?userId=${me.id}&date=${key}`,
      )
      .then((r) => {
        if (alive && r.exists) setPastDaily({ comment: r.comment, review: r.review });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id, dayOffset]);

  // 메인 업무 지정 불러오기(개인)
  useEffect(() => {
    if (!me?.id) return;
    try {
      setMainTaskId(localStorage.getItem(`tms_main_${me.id}`) || null);
    } catch {
      /* noop */
    }
  }, [me?.id]);
  function setMain(id: string | null) {
    setMainTaskId(id);
    try {
      if (!me?.id) return;
      if (id) localStorage.setItem(`tms_main_${me.id}`, id);
      else localStorage.removeItem(`tms_main_${me.id}`);
    } catch {
      /* noop */
    }
  }

  async function start(id: string) {
    setBusy(id);
    try {
      await api.post(`/tasks/${id}/start`, {});
      await load();
    } finally {
      setBusy(null);
    }
  }
  async function pause(id: string) {
    setBusy(id);
    try {
      await api.post(`/tasks/${id}/pause`, {});
      await load();
    } finally {
      setBusy(null);
    }
  }
  async function resume(id: string) {
    setBusy(id);
    try {
      await api.post(`/tasks/${id}/resume`, {});
      await load();
    } finally {
      setBusy(null);
    }
  }
  function openEnd(t: Task) {
    setEndTask(t);
    setEndReport(t.reportLink ?? "");
    setEndVideo(t.videoLink ?? "");
    setEndNote("");
  }
  async function submitEnd() {
    if (!endTask) return;
    setEndBusy(true);
    try {
      await api.post(`/tasks/${endTask.id}/end`, {
        reportLink: endReport.trim() || undefined,
        videoLink: endVideo.trim() || undefined,
        note: endNote.trim() || undefined,
      });
      setEndTask(null);
      await load();
    } finally {
      setEndBusy(false);
    }
  }

  async function addMyTask() {
    if (!me || !myTitle.trim()) return;
    setBusy("myadd");
    try {
      await api.post("/tasks", {
        title: myTitle.trim(),
        category: "shorts",
        priority: myPrio,
        status: "todo",
        assignerId: me.id,
        assigneeId: me.id,
        // plannedDate 미설정 — '나의 업무' 리스트에 담기고, 오늘의 업무로는 직접 드래그해 옮긴다
      });
      setMyTitle("");
      setMyAddOpen(false);
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function accept(id: string) {
    setBusy(id);
    try {
      await api.post(`/tasks/${id}/accept`, {});
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function reject(id: string, reason: string) {
    setBusy(id);
    try {
      await api.post(`/tasks/${id}/reject`, { reason: reason.trim() });
      setRejectId(null);
      setRejectText("");
      await load();
    } finally {
      setBusy(null);
    }
  }

  // 특정 날짜의 '오늘의 업무'로 담기/해제 (plannedDate = 보고 있는 날짜, null이면 해제)
  async function planForDay(id: string, dateISO: string | null) {
    setBusy(id);
    try {
      await api.patch(`/tasks/${id}`, { plannedDate: dateISO ?? "" });
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function markRead(id: string) {
    setNotifs((cur) => cur.map((n) => (n.id === id ? { ...n, read: true } : n)));
    try {
      await api.patch(`/notifications/${id}/read`, {});
    } catch {
      /* noop */
    }
  }
  async function markAllRead() {
    if (!me) return;
    setNotifs((cur) => cur.map((n) => ({ ...n, read: true })));
    try {
      await api.patch(`/notifications/read-all?userId=${me.id}`, {});
    } catch {
      /* noop */
    }
  }

  const stateOf = (t: Task): "todo" | "doing" | "done" =>
    t.status === "done" || t.status === "completed_pending"
      ? "done"
      : t.status === "doing" || t.status === "paused"
        ? "doing"
        : "todo";

  // 업무 통계(월별) — 완료는 그 달 종료분, 진행중/대기는 현재 상태
  const statMonthKey = `${statMonth.getFullYear()}-${String(statMonth.getMonth() + 1).padStart(2, "0")}`;
  const endMonthKey = (t: Task) =>
    t.endedAt ? `${new Date(t.endedAt).getFullYear()}-${String(new Date(t.endedAt).getMonth() + 1).padStart(2, "0")}` : "";
  const doneInMonth = tasks
    .filter((t) => stateOf(t) === "done" && endMonthKey(t) === statMonthKey)
    // 최근 완료(종료 시각)순 — 최신 완료가 위로
    .sort((a, b) => new Date(b.endedAt ?? 0).getTime() - new Date(a.endedAt ?? 0).getTime());
  const doingNow = tasks.filter((t) => t.status === "doing");
  const todoNow = tasks.filter((t) => t.status === "todo");
  const nowMs = Date.now();
  const dueMonthKey = (t: Task) =>
    t.dueDate ? `${new Date(t.dueDate).getFullYear()}-${String(new Date(t.dueDate).getMonth() + 1).padStart(2, "0")}` : "";
  // 마감초과 = 선택한 달에 마감이면서 아직 미완료·마감 지난 업무
  const overdueNow = tasks.filter(
    (t) => stateOf(t) !== "done" && t.dueDate && new Date(t.dueDate).getTime() < nowMs && dueMonthKey(t) === statMonthKey,
  );
  const reworkTasks = tasks.filter((t) => (t.reworkCount ?? 0) > 0);
  const statList =
    statSel === "done" ? doneInMonth
    : statSel === "doing" ? doingNow
    : statSel === "todo" ? todoNow
    : statSel === "overdue" ? overdueNow
    : reworkTasks;

  // 선택 날짜
  const selDate = new Date();
  selDate.setDate(selDate.getDate() + dayOffset);
  const selKey = ymd(selDate);
  const dayLabel = dayOffset === 0 ? "오늘" : dayOffset === -1 ? "어제" : dayOffset === 1 ? "내일" : `${selDate.getMonth() + 1}/${selDate.getDate()}`;
  const ddays = (t: Task) =>
    t.dueDate ? Math.ceil((new Date(t.dueDate).getTime() - Date.now()) / 86400000) : Infinity;
  const todayStart0 = new Date();
  todayStart0.setHours(0, 0, 0, 0);
  const dateOnly = (s: string) => {
    const d = new Date(s);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  // 오늘의 업무 = (오늘 이하로 계획된 미완료=이월) + 마감 D-3이내/지난 미완료 + 진행중. 마감 급한 순.
  const dayTasks = tasks
    .filter((t) => {
      // 남이 요청한 업무는 수락 전엔 오늘의 업무에서 제외
      if (t.assigner && t.assigner.id !== targetId && !t.acceptedAt) return false;
      if (dayOffset === 0) {
        // 오늘의 업무 = 내가 직접 담은 것(plannedDate, 미완료는 이월) + 마감 지난 미완료(자동 이월) + 진행중.
        // 마감 임박(아직 안 지난 것) 자동 편입은 하지 않음 — 업무 리스트에 남고 직접 드래그해 담는다.
        const plannedCarry =
          !!t.plannedDate && dateOnly(t.plannedDate) <= todayStart0.getTime() && stateOf(t) !== "done";
        // 마감일이 오늘 이전(지난)인데 아직 미완료 → 오늘로 이월(놓치지 않게)
        const overdueCarry =
          !!t.dueDate && dateOnly(t.dueDate) < todayStart0.getTime() && stateOf(t) !== "done";
        return plannedCarry || overdueCarry || stateOf(t) === "doing";
      }
      // 어제/내일 보기: 그 날짜에 계획됐거나 마감인 것
      const planned = t.plannedDate && ymd(new Date(t.plannedDate)) === selKey;
      return planned || (t.dueDate && ymd(new Date(t.dueDate)) === selKey);
    })
    .sort((a, b) => {
      // 수동 순서(dayOrder) 우선, 없으면 마감 급한 순
      const oa = a.dayOrder ?? Infinity;
      const ob = b.dayOrder ?? Infinity;
      if (oa !== ob) return oa - ob;
      return ddays(a) - ddays(b);
    });

  // 현재 업무중 = 지금 시작해서 진행 중(doing)인 업무 · 메인 1 + 서브 나머지
  const currentTasks = tasks.filter((t) => t.status === "doing");
  const mainTask = currentTasks.find((t) => t.id === mainTaskId) ?? currentTasks[0] ?? null;
  const subTasks = currentTasks.filter((t) => t.id !== mainTask?.id);
  // 오늘: 진행중은 '현재 업무중'으로 분리 표시(목록 제외).
  // 과거/미래 뷰: 그날의 기록이므로 상태(진행중·완료 포함) 무관하게 그날 계획/마감 업무를 전부 표시.
  const todayList = dayOffset === 0 ? dayTasks.filter((t) => t.status !== "doing") : dayTasks;
  const todayIds = new Set(dayTasks.map((t) => t.id));

  // 드래그로 오늘의 업무 순서 변경
  async function reorderToday(toIdx: number) {
    const from = dragIdx;
    setDragIdx(null);
    if (from === null || from === toIdx) return;
    const arr = [...todayList];
    const [moved] = arr.splice(from, 1);
    arr.splice(toIdx, 0, moved);
    setTasks((cur) =>
      cur.map((t) => {
        const i = arr.findIndex((x) => x.id === t.id);
        return i >= 0 ? { ...t, dayOrder: i } : t;
      }),
    );
    await Promise.all(arr.map((t, i) => api.patch(`/tasks/${t.id}`, { dayOrder: i }))).catch(() => {});
  }
  // 마감 임박(3일 이내 미완료)
  const now = new Date();
  const soon = tasks
    .filter((t) => t.dueDate && stateOf(t) !== "done")
    .map((t) => ({ t, days: Math.ceil((new Date(t.dueDate!).getTime() - now.getTime()) / 86400000) }))
    .filter((x) => x.days <= 3)
    .sort((a, b) => a.days - b.days);

  // ───── 스케줄(오늘): 계획 + 실제 + 근태 ─────
  const _td = new Date();
  const dateKeyISO = `${_td.getFullYear()}-${String(_td.getMonth() + 1).padStart(2, "0")}-${String(_td.getDate()).padStart(2, "0")}`;
  const work = { start: targetUser?.workStart, end: targetUser?.workEnd };
  const todayLeave = userLeaves.find((l) => {
    if (l.status !== "approved") return false;
    const s = new Date(l.startDate); s.setHours(0, 0, 0, 0);
    const e = new Date(l.endDate); e.setHours(23, 59, 59, 999);
    return now >= s && now <= e;
  });
  // 내가 부여한 업무: 나에게 / 남에게  +  남이 나에게 부여한 업무
  const assignedSelf = assigned.filter((t) => t.assignee?.id === targetId);
  const fromOthers = tasks.filter((t) => t.assigner && t.assigner.id !== targetId);
  // 업무 리스트(백로그) = 아직 오늘의 업무에 없고 미완료인 것
  const myBacklog = assignedSelf.filter((t) => stateOf(t) !== "done" && !todayIds.has(t.id));
  const recvBacklog = fromOthers.filter(
    (t) => stateOf(t) !== "done" && (!t.acceptedAt || !todayIds.has(t.id)),
  );
  // 업무 리스트에서 오늘의 업무로 드래그&드롭
  async function dropToToday() {
    const id = listDragId;
    setListDragId(null);
    if (!id) return;
    await planForDay(id, selDate.toISOString());
  }
  // 오늘의 업무 카드를 업무 리스트로 드롭 → plannedDate 해제(리스트로 복귀)
  async function dropToBacklog() {
    const id = todayDragId;
    setTodayDragId(null);
    if (!id) return;
    await planForDay(id, null);
  }
  // 현재 업무중: 메인/서브 존으로 드롭
  function dropCur(zone: "main" | "sub") {
    const id = curDragId;
    setCurDragId(null);
    if (!id) return;
    if (zone === "main") setMain(id); // 메인으로 승격(기존 메인은 서브로 밀림)
    else if (mainTask && id === mainTask.id) setMain(subTasks[0]?.id ?? null); // 메인을 서브로 내림
  }
  // 현재 업무중 카드(메인=크게 / 서브=병렬 카드). 세로 카드형.
  const curCard = (t: Task, isMain: boolean) => (
    <div
      key={t.id}
      draggable={isSelf}
      onDragStart={(e) => { if (isSelf) { setCurDragId(t.id); e.dataTransfer.effectAllowed = "move"; } }}
      onDragEnd={() => setCurDragId(null)}
      style={{
        display: "flex", flexDirection: "column", gap: isMain ? 10 : 7,
        padding: isMain ? "20px 22px" : "12px 14px",
        border: "1px solid var(--primary)", borderRadius: 12,
        background: "var(--primary-soft, #eef0fe)",
        cursor: isSelf ? "grab" : "default",
        opacity: curDragId === t.id ? 0.4 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="pill" style={{ background: PRI[t.priority].bg, color: PRI[t.priority].fg, fontSize: 10 }}>{PRI[t.priority].label}</span>
        {t.project && <span style={{ fontSize: 11, color: "var(--text-3)" }}>{t.project.name}</span>}
        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          <b style={{ fontSize: isMain ? 15 : 12, color: progressColor(t.progress) }}>{t.progress}%</b>
          {t.dueDate && (
            <div style={{ fontSize: 10.5, marginTop: 1, color: ddays(t) <= 0 ? "#b91c1c" : ddays(t) <= 2 ? "#a16207" : "var(--text-3)" }}>
              📅 {mdd(t.dueDate)} ({ddays(t) < 0 ? `D+${-ddays(t)}` : ddays(t) === 0 ? "D-Day" : `D-${ddays(t)}`})
            </div>
          )}
        </div>
      </div>
      <div
        onClick={() => setDetailId(t.id)}
        style={{ fontWeight: 800, fontSize: isMain ? 23 : 14, lineHeight: 1.3, cursor: "pointer" }}
      >
        {t.title}
      </div>
      {(t.aiDescriptionDoc || isSelf) && (
        <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
          {t.aiDescriptionDoc && (
            <button className="btn sm" onClick={(e) => { e.stopPropagation(); setDocTask({ id: t.id, title: t.title }); }} title="업무설명 doc 보기/편집">⛶ 업무설명</button>
          )}
          {isSelf && (
            <>
              <button className="btn sm" onClick={(e) => { e.stopPropagation(); pause(t.id); }} disabled={busy === t.id}>⏸ 일시정지</button>
              <button className="btn primary sm" onClick={(e) => { e.stopPropagation(); openEnd(t); }} disabled={busy === t.id}>✓ Done 완료</button>
            </>
          )}
        </div>
      )}
    </div>
  );
  const stLabel = (t: Task) =>
    stateOf(t) === "done" ? "완료" : stateOf(t) === "doing" ? "진행중" : "대기";

  // 퇴근 5분 전 알림(본인, workEnd 설정 시, 앱 열려있을 때)
  useEffect(() => {
    if (!isSelf || !me?.workEnd) return;
    const check = () => {
      const [h, m] = (me.workEnd ?? "").split(":").map(Number);
      if (Number.isNaN(h)) return;
      const d = new Date();
      const mins = (h * 60 + m) - (d.getHours() * 60 + d.getMinutes());
      setEndAlarm(mins > 0 && mins <= 5);
    };
    check();
    const id = setInterval(check, 30000);
    return () => clearInterval(id);
  }, [isSelf, me?.workEnd]);

  return (
    <>
      <div className="topbar">
        <div>
          <h1>{isSelf ? "My Activity 내 활동" : `${targetName || "팀원"}님의 활동`}</h1>
          <div className="sub">
            {isSelf
              ? `${me?.name ?? ""} · 현재 업무 · 오늘의 업무 · 업무 리스트`
              : "오늘 할일 · 스케줄 · 업무 통계 (읽기 전용)"}
          </div>
        </div>
        {isSelf && (
          <div className="topbar-right">
            <button className="btn primary" onClick={() => setEndDayOpen(true)} title="오늘 업무 종료 · 리포트 작성">
              🔚 End Day 업무 종료
            </button>
          </div>
        )}
      </div>

      <div className="content">
        {!isSelf && (
          <Link href="/dashboard" className="detail-back">
            ← 대시보드로
          </Link>
        )}
        {err && (
          <div className="card" style={{ color: "#dc2626", marginBottom: 16 }}>
            API 오류: {err}
          </div>
        )}

        {/* 퇴근 5분 전 알림 */}
        {isSelf && endAlarm && (
          <div
            style={{
              display: "flex", alignItems: "center", gap: 10, marginBottom: 14,
              padding: "12px 16px", background: "#fef3c7", borderRadius: 10, fontSize: 14, fontWeight: 600,
            }}
          >
            ⏰ 곧 퇴근이에요! 진행 중인 업무의 <b>진행률을 기입</b>해주세요~
          </div>
        )}

        {/* 상단 2단: 좌(메인) / 우(오늘 스케줄·메모 고정) */}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(320px, 380px)", gap: 18, alignItems: "start" }}>
          {/* ───────── 좌: 메인 ───────── */}
          <div style={{ display: "grid", gap: 18, minWidth: 0 }}>
            {/* ▶ 현재 업무중 + ⏳ 마감 임박 — 오늘 뷰에서만 (과거/미래 뷰는 그날 기록만 표시) */}
            {dayOffset === 0 && (
            <div className="card" style={{ borderLeft: "4px solid var(--primary)" }}>
              <div style={{ display: "flex", padding: "12px 14px 0" }}>
                <span className="count" style={{ marginLeft: "auto" }}>{currentTasks.length}</span>
              </div>
              <div style={{ padding: "8px 14px 12px", display: "grid", gap: 10 }}>
                {currentTasks.length === 0 && (
                  <div style={{ color: "var(--text-3)", fontSize: 13 }}>
                    {isSelf
                      ? "지금 진행 중인 업무가 없어요. 아래 “오늘의 업무”에서 체크하면 여기로 올라옵니다."
                      : "지금 진행 중인 업무가 없어요."}
                  </div>
                )}
                {currentTasks.length > 0 && (
                  <>
                    {/* 메인 — 크게 (드롭 존) */}
                    <div
                      onDragOver={(e) => { if (isSelf && curDragId) e.preventDefault(); }}
                      onDrop={() => { if (isSelf) dropCur("main"); }}
                      style={{ borderRadius: 12, outline: curDragId ? "2px dashed var(--primary)" : undefined, outlineOffset: 3 }}
                    >
                      {mainTask ? (
                        curCard(mainTask, true)
                      ) : (
                        <div style={{ border: "2px dashed var(--border)", borderRadius: 12, padding: 18, fontSize: 12, color: "var(--text-3)", textAlign: "center" }}>여기로 드래그해 메인 업무 지정</div>
                      )}
                    </div>
                    {/* 서브 — 병렬 카드 (드롭 존) */}
                    <div
                      onDragOver={(e) => { if (isSelf && curDragId) e.preventDefault(); }}
                      onDrop={() => { if (isSelf) dropCur("sub"); }}
                      style={{
                        display: "grid",
                        gridTemplateColumns: subTasks.length ? "repeat(auto-fit, minmax(190px, 1fr))" : "1fr",
                        gap: 8, borderRadius: 12,
                        outline: curDragId ? "2px dashed var(--primary)" : undefined, outlineOffset: 3,
                      }}
                    >
                      {subTasks.length === 0 ? (
                        <div style={{ border: "2px dashed var(--border)", borderRadius: 12, padding: 12, fontSize: 12, color: "var(--text-3)", textAlign: "center" }}>서브 업무 없음 — 카드를 여기로 드래그</div>
                      ) : (
                        subTasks.map((t) => curCard(t, false))
                      )}
                    </div>
                  </>
                )}
              </div>
              {soon.length > 0 && (
                <div style={{ borderTop: "1px solid var(--border)", padding: "10px 14px 14px" }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6, color: "#a16207" }}>⏳ 마감 임박</div>
                  <div style={{ display: "grid", gap: 4 }}>
                    {soon.map(({ t, days }) => (
                      <div
                        key={t.id}
                        onClick={() => setDetailId(t.id)}
                        style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}
                      >
                        <span className="pill" style={{ background: days <= 0 ? "#fee2e2" : "#fef3c7", color: days <= 0 ? "#b91c1c" : "#a16207" }}>
                          {days < 0 ? `D+${-days}` : days === 0 ? "D-Day" : `D-${days}`}
                        </span>
                        <span style={{ flex: 1 }}>{t.title}</span>
                        {t.project && <span style={{ fontSize: 11, color: "var(--text-3)" }}>{t.project.name}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            )}

            {/* ✅ 오늘의 업무 — 체크=시작, 리스트에서 드래그 담기, 순서 변경 */}
            <div
              className="card"
              style={{ outline: listDragId ? "2px dashed var(--primary)" : undefined, outlineOffset: -2 }}
              onDragOver={(e) => { if (isSelf && listDragId) e.preventDefault(); }}
              onDrop={() => { if (isSelf) void dropToToday(); }}
            >
              <div className="panel-head">
                <div className="sec-title"><span className="em">✅</span> Today's Tasks 오늘의 업무</div>
                <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
                  <button className="btn sm" onClick={() => setDayOffset((d) => d - 1)}>◀</button>
                  <b style={{ fontSize: 13, minWidth: 64, textAlign: "center" }}>
                    {dayLabel} ({selDate.getMonth() + 1}/{selDate.getDate()})
                  </b>
                  <button className="btn sm" onClick={() => setDayOffset((d) => d + 1)}>▶</button>
                  {dayOffset !== 0 && (
                    <button className="btn sm" onClick={() => setDayOffset(0)}>오늘</button>
                  )}
                </span>
              </div>
              <div className="chklist">
                {loading && (
                  <div style={{ padding: 18, color: "var(--text-3)", fontSize: 13 }}>불러오는 중…</div>
                )}
                {!loading && todayList.length === 0 && (
                  <div style={{ padding: 18, color: "var(--text-3)", fontSize: 13 }}>
                    {dayLabel} 담긴 업무가 없어요. 아래 <b>업무 리스트</b>에서 항목을 드래그해 여기로 담으세요.
                  </div>
                )}
                {todayList.map((it, idx) => {
                  const output =
                    [it.reportRequired ? "📊" : "", it.videoRequired ? "🎥" : ""]
                      .filter(Boolean)
                      .join("") || "—";
                  return (
                    <div
                      key={it.id}
                      className={`chk-item ${stateOf(it)}`}
                      draggable={isSelf && dayOffset === 0}
                      onDragStart={(e) => { if (isSelf && dayOffset === 0) { setDragIdx(idx); setTodayDragId(it.id); e.dataTransfer.effectAllowed = "move"; } }}
                      onDragEnd={() => { setDragIdx(null); setOverIdx(null); setTodayDragId(null); }}
                      onClick={() => setDetailId(it.id)}
                      style={{
                        cursor: isSelf && dayOffset === 0 ? "grab" : "pointer",
                        flexWrap: "wrap",
                        opacity: dragIdx === idx ? 0.4 : 1,
                        background: progressBg(it.progress),
                        borderLeft: `4px solid ${progressColor(it.progress)}`,
                        borderTop:
                          dragIdx !== null && dragIdx !== idx && overIdx === idx
                            ? "3px solid var(--primary)"
                            : undefined,
                      }}
                      title="드래그하면 순서 변경 · 클릭하면 상세"
                      onDragOver={(e) => {
                        if (isSelf && dragIdx !== null) {
                          e.preventDefault();
                          if (overIdx !== idx) setOverIdx(idx);
                        }
                      }}
                      onDrop={(e) => {
                        if (isSelf && dragIdx !== null) {
                          e.stopPropagation();
                          void reorderToday(idx);
                          setOverIdx(null);
                        }
                      }}
                    >
                      {isSelf && dayOffset === 0 && (
                        <span
                          onClick={(e) => e.stopPropagation()}
                          title="드래그해서 순서 변경"
                          style={{ color: "var(--text-3)", fontSize: 15, lineHeight: 1, userSelect: "none" }}
                        >
                          ⠿
                        </span>
                      )}
                      {/* 체크(시작)는 오늘 뷰에서만 — 과거/미래는 기록 표시라 체크박스 숨김(오클릭 방지) */}
                      {dayOffset === 0 && (
                        <input
                          type="checkbox"
                          checked={false}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isSelf && busy !== it.id) {
                              if (it.status === "paused") void resume(it.id);
                              else void start(it.id);
                            }
                          }}
                          onChange={() => {}}
                          disabled={!isSelf || busy === it.id}
                          title={
                            it.status === "paused"
                              ? "체크하면 재개 → 현재 업무중"
                              : "체크하면 시작 → 현재 업무중"
                          }
                          style={{ width: 16, height: 16, accentColor: "var(--primary)", cursor: isSelf ? "pointer" : "default" }}
                        />
                      )}
                      <span
                        className="pill"
                        style={{ background: PRI[it.priority].bg, color: PRI[it.priority].fg, fontSize: 11 }}
                      >
                        {PRI[it.priority].label}
                      </span>
                      {it.aiDescriptionDoc && (
                        <button
                          className="btn sm"
                          onClick={(e) => { e.stopPropagation(); setDocTask({ id: it.id, title: it.title }); }}
                          title="업무설명 doc 보기/편집"
                          style={{ padding: "1px 6px", fontSize: 11, lineHeight: 1.2 }}
                        >
                          ⛶
                        </button>
                      )}
                      <span className="ct">
                        {it.project && (
                          <span style={{ color: "var(--text-3)", fontSize: 11.5 }}>({it.project.name}) </span>
                        )}
                        {it.title}
                      </span>
                      <span className="meta">{output}</span>
                      <b style={{ fontSize: 12, color: progressColor(it.progress) }}>{it.progress}%</b>
                      {it.dueDate && (
                        <span
                          className="pill"
                          style={{
                            fontSize: 10,
                            background: ddays(it) <= 0 ? "#fee2e2" : ddays(it) <= 2 ? "#fef3c7" : "#eef0f2",
                            color: ddays(it) <= 0 ? "#b91c1c" : ddays(it) <= 2 ? "#a16207" : "#5c606b",
                          }}
                          title="마감일"
                        >
                          📅 {mdd(it.dueDate)} ({ddays(it) < 0 ? `D+${-ddays(it)}` : ddays(it) === 0 ? "D-Day" : `D-${ddays(it)}`})
                        </span>
                      )}
                      {it.status === "paused" && (
                        <>
                          <span className="pill" style={{ background: "#fef3c7", color: "#a16207", fontSize: 10 }}>진행중이던 업무</span>
                          {isSelf && (
                            <button className="btn sm" onClick={(e) => { e.stopPropagation(); openEnd(it); }} disabled={busy === it.id}>
                              ✓ Done 완료
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
              {dayOffset === 0 && (
                <div className="hint" style={{ padding: "0 18px 16px" }}>
                  업무 리스트에서 <b>드래그</b>해 담기 · 손잡이(⠿)로 순서 변경 · <b>체크</b>하면 “현재 업무중”으로 올라갑니다
                </div>
              )}
              {/* 그날 업무 종료 때 생성된 데일리 평가 (오늘 포함) */}
              {pastDaily?.review && (
                <div style={{ margin: "0 18px 16px", padding: 12, background: "#f5f3ff", borderRadius: 10, border: "1px solid #e5e0ff" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#6d28d9", marginBottom: 4 }}>🤖 {dayLabel} 데일리 평가</div>
                  {pastDaily.comment && (
                    <div style={{ fontSize: 12.5, color: "var(--text-2)", marginBottom: 6 }}>📝 {pastDaily.comment}</div>
                  )}
                  <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{pastDaily.review}</div>
                </div>
              )}
            </div>

            {/* 나의 업무 + 요청받은 업무 (드래그해서 오늘의 업무로 ↔ 되돌리기) */}
            <div
              className="card"
              onDragOver={(e) => { if (isSelf && todayDragId) e.preventDefault(); }}
              onDrop={() => { if (isSelf) void dropToBacklog(); }}
              style={{ outline: todayDragId ? "2px dashed var(--primary)" : undefined, outlineOffset: -2 }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 16,
                  padding: "14px",
                }}
              >
                {/* 🙋 나의 업무 */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <div className="sec-title" style={{ fontSize: 14 }}><span className="em">🙋</span> My Tasks 나의 업무</div>
                    <span style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
                      {isSelf && <button className="btn sm" onClick={() => setMyAddOpen((o) => !o)}>＋ 추가</button>}
                      <span className="count">{myBacklog.length}</span>
                    </span>
                  </div>
                  {isSelf && myAddOpen && (
                    <div style={{ display: "flex", gap: 6, paddingBottom: 10, alignItems: "center" }}>
                      <input
                        className="inp"
                        placeholder="내 업무 제목"
                        value={myTitle}
                        onChange={(e) => setMyTitle(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") void addMyTask(); }}
                        style={{ flex: 1, minWidth: 0 }}
                        autoFocus
                      />
                      <select className="inp" value={myPrio} onChange={(e) => setMyPrio(e.target.value as Priority)} style={{ width: 80 }}>
                        {(["urgent", "high", "medium", "low"] as Priority[]).map((p) => (
                          <option key={p} value={p}>{PRI[p].label}</option>
                        ))}
                      </select>
                      <button className="btn primary sm" onClick={addMyTask} disabled={busy === "myadd"}>Add 추가</button>
                    </div>
                  )}
                  <div style={{ display: "grid", gap: 6 }}>
                    {myBacklog.length === 0 && (
                      <div style={{ color: "var(--text-3)", fontSize: 13 }}>담을 업무가 없어요. ＋추가로 만들어보세요.</div>
                    )}
                    {myBacklog.map((t) => (
                      <div
                        key={t.id}
                        draggable={isSelf}
                        onDragStart={(e) => { if (isSelf) { setListDragId(t.id); e.dataTransfer.effectAllowed = "move"; } }}
                        onDragEnd={() => setListDragId(null)}
                        style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "7px 8px", border: "1px solid var(--border)", borderRadius: 8, cursor: isSelf ? "grab" : "default", background: listDragId === t.id ? "var(--primary-soft,#eef0fe)" : undefined }}
                        title={isSelf ? "드래그해서 오늘의 업무로" : ""}
                      >
                        {isSelf && <span style={{ color: "var(--text-3)", fontSize: 14, userSelect: "none" }}>⠿</span>}
                        <span className="pill" style={{ background: PRI[t.priority].bg, color: PRI[t.priority].fg, fontSize: 10 }}>{PRI[t.priority].label}</span>
                        <span style={{ flex: 1, cursor: "pointer" }} onClick={() => setDetailId(t.id)}>{t.title}</span>
                        <span className="pill gray" style={{ fontSize: 10 }}>{stLabel(t)}</span>
                        <b style={{ fontSize: 12, color: progressColor(t.progress) }}>{t.progress}%</b>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 📥 요청받은 업무 */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <div className="sec-title" style={{ fontSize: 14 }}><span className="em">📥</span> Requests 요청받은 업무</div>
                    <span className="count" style={{ marginLeft: "auto" }}>{recvBacklog.length}</span>
                  </div>
                  <div style={{ display: "grid", gap: 6 }}>
                    {recvBacklog.length === 0 && (
                      <div style={{ color: "var(--text-3)", fontSize: 13 }}>없음</div>
                    )}
                    {recvBacklog.map((t) => {
                      const accepted = !!t.acceptedAt;
                      return (
                        <div
                          key={t.id}
                          draggable={isSelf && accepted}
                          onDragStart={(e) => { if (isSelf && accepted) { setListDragId(t.id); e.dataTransfer.effectAllowed = "move"; } }}
                          onDragEnd={() => setListDragId(null)}
                          style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "7px 8px", border: `1px solid ${t.reworkCount ? "#fb923c" : "var(--border)"}`, borderRadius: 8, flexWrap: "wrap", background: t.reworkCount ? "#fff7ed" : (listDragId === t.id ? "var(--primary-soft,#eef0fe)" : undefined), cursor: isSelf && accepted ? "grab" : "default" }}
                          title={isSelf && accepted ? "드래그해서 오늘의 업무로" : ""}
                        >
                          {isSelf && accepted && <span style={{ color: "var(--text-3)", fontSize: 14, userSelect: "none" }}>⠿</span>}
                          <span className="pill" style={{ background: PRI[t.priority].bg, color: PRI[t.priority].fg, fontSize: 10 }}>{PRI[t.priority].label}</span>
                          {t.reworkCount ? (
                            <span className="pill" style={{ background: "#c2410c", color: "#fff", fontSize: 10, fontWeight: 700 }}>재작업 #{t.reworkCount}</span>
                          ) : null}
                          <span style={{ flex: 1, minWidth: 80, cursor: "pointer" }} onClick={() => setDetailId(t.id)}>
                            {t.project && <span style={{ color: "var(--text-3)", fontSize: 11.5 }}>({t.project.name}) </span>}
                            {t.title}
                          </span>
                          <span style={{ fontSize: 11, color: "var(--text-3)" }} title="요청자 · 요청일">
                            {t.assigner?.name} · {mdd(t.createdAt)}
                          </span>
                          {t.status === "rejected" ? (
                            <span className="pill" style={{ background: "#fee2e2", color: "#b91c1c", fontSize: 10, fontWeight: 700 }}>미수락 · 재요청 대기</span>
                          ) : !accepted ? (
                            isSelf ? (
                              <span style={{ display: "flex", gap: 4 }}>
                                <button className="btn primary sm" onClick={() => accept(t.id)} disabled={busy === t.id}>수락</button>
                                <button className="btn sm" style={{ color: "#b91c1c", borderColor: "#f0c9c9" }} onClick={() => { setRejectId(t.id); setRejectText(""); }} disabled={busy === t.id}>미수락</button>
                              </span>
                            ) : (
                              <span className="pill" style={{ background: "#fef9c3", color: "#a16207", fontSize: 10 }}>수락대기</span>
                            )
                          ) : (
                            <>
                              <span className="pill gray" style={{ fontSize: 10 }}>{stLabel(t)}</span>
                            </>
                          )}
                          {rejectId === t.id ? (
                            <div style={{ flexBasis: "100%", display: "flex", gap: 6, alignItems: "center", paddingTop: 4 }}>
                              <input
                                className="inp"
                                autoFocus
                                value={rejectText}
                                onChange={(e) => setRejectText(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter" && rejectText.trim()) void reject(t.id, rejectText); }}
                                placeholder="미수락 사유 (부여자에게 전달)"
                                style={{ flex: 1, fontSize: 12.5 }}
                              />
                              <button className="btn sm" style={{ color: "#fff", background: "#b91c1c", borderColor: "#b91c1c" }} onClick={() => reject(t.id, rejectText)} disabled={busy === t.id || !rejectText.trim()}>미수락 확정</button>
                              <button className="btn sm" onClick={() => { setRejectId(null); setRejectText(""); }} disabled={busy === t.id}>취소</button>
                            </div>
                          ) : null}
                          {t.status === "rejected" && t.rejectReason ? (
                            <div style={{ flexBasis: "100%", fontSize: 11.5, color: "#b91c1c", paddingLeft: 2 }}>
                              🚫 미수락 사유: {t.rejectReason}
                            </div>
                          ) : null}
                          {t.reworkCount && t.reworkReason ? (
                            <div style={{ flexBasis: "100%", fontSize: 11.5, color: "#c2410c", paddingLeft: 2 }}>
                              🔁 재작업 사유: {t.reworkReason}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* 📤 요청한 업무 · 📨 멘션 소통피드 — 나란히 */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, alignItems: "start" }}>
              {/* 📊 업무 통계 (월별 · 완료/진행중/대기 클릭 → 목록) */}
              <div className="card">
                <div className="panel-head">
                  <div className="sec-title"><span className="em">📊</span> Stats 업무 통계</div>
                  <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
                    <button className="btn sm" onClick={() => setStatMonth((m) => { const d = new Date(m); d.setMonth(d.getMonth() - 1); return d; })}>◀</button>
                    <b style={{ fontSize: 13, minWidth: 64, textAlign: "center" }}>{statMonth.getFullYear()}.{statMonth.getMonth() + 1}</b>
                    <button className="btn sm" onClick={() => setStatMonth((m) => { const d = new Date(m); d.setMonth(d.getMonth() + 1); return d; })}>▶</button>
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, padding: "6px 14px 10px" }}>
                  {([
                    ["done", `${statMonth.getMonth() + 1}월 완료`, doneInMonth.length, "#16a34a"],
                    ["doing", "진행중", doingNow.length, "#2563eb"],
                    ["todo", "대기", todoNow.length, "#eab308"],
                  ] as const).map(([k, label, n, color]) => (
                    <button
                      key={k}
                      onClick={() => setStatSel(k)}
                      style={{
                        border: `1px solid ${statSel === k ? color : "var(--border)"}`,
                        background: statSel === k ? `${color}14` : "transparent",
                        borderRadius: 10, padding: "10px 6px", cursor: "pointer", textAlign: "center",
                      }}
                    >
                      <div style={{ fontSize: 22, fontWeight: 800, color }}>{n}</div>
                      <div style={{ fontSize: 11.5, color: "var(--text-2)" }}>{label}</div>
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8, padding: "0 14px 10px", flexWrap: "wrap" }}>
                  {([
                    ["overdue", `⚠️ 마감초과 ${overdueNow.length}`, "#dc2626"],
                    ["rework", `🔁 재요청 ${reworkTasks.length}`, "#c2410c"],
                  ] as const).map(([k, label, color]) => (
                    <button
                      key={k}
                      onClick={() => setStatSel(k)}
                      style={{
                        border: `1px solid ${statSel === k ? color : "var(--border)"}`,
                        background: statSel === k ? `${color}14` : "transparent",
                        borderRadius: 999, padding: "5px 12px", cursor: "pointer", fontSize: 12, fontWeight: 700, color,
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div style={{ padding: "0 14px 14px", display: "grid", gap: 6 }}>
                  {statList.length === 0 && (
                    <div style={{ color: "var(--text-3)", fontSize: 13 }}>해당 업무가 없어요.</div>
                  )}
                  {statList.map((t) => (
                    <div
                      key={t.id}
                      onClick={() => setDetailId(t.id)}
                      style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", padding: "7px 8px", border: "1px solid var(--border)", borderRadius: 8 }}
                    >
                      <span className="pill" style={{ background: PRI[t.priority].bg, color: PRI[t.priority].fg, fontSize: 10 }}>{PRI[t.priority].label}</span>
                      <span style={{ flex: 1, minWidth: 60 }}>
                        {t.project && <span style={{ color: "var(--text-3)", fontSize: 11.5 }}>({t.project.name}) </span>}
                        {t.title}
                      </span>
                      {statSel === "done" && t.endedAt && (
                        <span style={{ fontSize: 11, color: "var(--text-3)" }}>{mdd(t.endedAt)}</span>
                      )}
                      {statSel === "overdue" && t.dueDate && (
                        <span style={{ fontSize: 11, color: "#dc2626", fontWeight: 700 }}>마감 {mdd(t.dueDate)} (D+{Math.ceil((nowMs - new Date(t.dueDate).getTime()) / 86400000)})</span>
                      )}
                      {statSel === "rework" && (
                        <span className="pill" style={{ background: "#ffedd5", color: "#c2410c", fontSize: 10 }}>재작업 #{t.reworkCount}</span>
                      )}
                      <b style={{ fontSize: 12, color: progressColor(t.progress) }}>{t.progress}%</b>
                    </div>
                  ))}
                </div>
              </div>

              {/* 📨 멘션 & 소통 피드 (본인만) */}
              {isSelf && (
                <div className="card">
                  <div className="panel-head">
                    <div className="sec-title"><span className="em">📨</span> 멘션 &amp; 소통 피드</div>
                    <span style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
                      <span className="count">새 알림 {notifs.filter((n) => !n.read).length}</span>
                      {notifs.some((n) => !n.read) && (
                        <button className="btn sm" onClick={markAllRead}>모두 읽음</button>
                      )}
                    </span>
                  </div>
                  {!loading && notifs.length === 0 && (
                    <div style={{ padding: 18, color: "var(--text-3)", fontSize: 13 }}>아직 알림이 없어요.</div>
                  )}
                  {notifs.map((n) => {
                    const ic = FEED_IC[n.type] ?? FEED_IC.system;
                    return (
                      <div
                        key={n.id}
                        className={`feed-item${n.read ? "" : " unread"}`}
                        onClick={() => !n.read && markRead(n.id)}
                        style={{ cursor: n.read ? "default" : "pointer" }}
                        title={n.read ? "" : "클릭하면 읽음 처리"}
                      >
                        <div className={`feed-ic ${ic.cls}`}>{ic.ic}</div>
                        <div>
                          <div className="feed-txt">{n.content}</div>
                          <div className="feed-time">{ago(n.createdAt)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ───────── 우: 오늘 스케줄 · 포스트잇 메모 · 통계 (상단 고정) ───────── */}
          <div style={{ position: "sticky", top: 14, display: "grid", gap: 16 }}>
            {todayLeave && (
              <div style={{ padding: "8px 12px", background: "#dcfce7", borderRadius: 8, fontSize: 13, color: "#15803d" }}>
                🌴 오늘은 휴가 ({LEAVE_KO[todayLeave.type]})
              </div>
            )}
            <ScheduleBoard
              userId={targetId ?? ""}
              dateKey={dateKeyISO}
              workStart={work.start}
              workEnd={work.end}
              tasks={tasks}
              dragTasks={dayTasks}
              readOnly={!isSelf}
            />

            {/* 📌 포스트잇 자유 메모 (개인) */}
            {isSelf && (
              <div
                style={{
                  background: "#fff9c4",
                  border: "1px solid #f5e58c",
                  borderRadius: 10,
                  padding: 14,
                  boxShadow: "0 2px 8px rgba(0,0,0,.06)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#8a6d0b" }}>📌 Memo 메모</div>
                  <div style={{ fontSize: 11, color: memoStatus === "saved" ? "#16a34a" : "#a89545" }}>
                    {memoStatus === "saving" ? "저장 중…" : memoStatus === "saved" ? "저장됨 ✓" : ""}
                  </div>
                </div>
                <textarea
                  value={scratch}
                  onChange={(e) => updateScratch(e.target.value)}
                  onBlur={() => {
                    if (memoTimer.current) clearTimeout(memoTimer.current);
                    void flushMemo();
                  }}
                  placeholder="자유롭게 끄적여보세요… (서버 자동 저장)"
                  style={{
                    width: "100%",
                    minHeight: 160,
                    resize: "vertical",
                    border: "none",
                    outline: "none",
                    background: "transparent",
                    fontSize: 13.5,
                    lineHeight: 1.7,
                    fontFamily: "inherit",
                    color: "#5c4b06",
                  }}
                />
              </div>
            )}

          </div>
        </div>
      </div>

      {endTask && (
        <div
          onClick={() => !endBusy && setEndTask(null)}
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
            style={{ width: "100%", maxWidth: 460, padding: 22 }}
          >
            <div className="panel-head">
              <div className="sec-title">
                <span className="em">✅</span> 업무 종료 — {endTask.title}
              </div>
            </div>
            {!endTask.reportRequired && !endTask.videoRequired && (
              <div className="field-hint" style={{ marginBottom: 8 }}>
                이 업무는 산출물 요구가 없어요. 메모만 남기고 종료할 수 있습니다.
              </div>
            )}
            {endTask.reportRequired && (
              <div className="assign-field">
                <label>📊 보고링크</label>
                <input
                  className="inp"
                  value={endReport}
                  onChange={(e) => setEndReport(e.target.value)}
                  placeholder="https://..."
                />
              </div>
            )}
            {endTask.videoRequired && (
              <div className="assign-field">
                <label>🎥 설명영상 링크</label>
                <input
                  className="inp"
                  value={endVideo}
                  onChange={(e) => setEndVideo(e.target.value)}
                  placeholder="https://..."
                />
              </div>
            )}
            <div className="assign-field">
              <label>완료 메모 (선택)</label>
              <textarea
                className="inp"
                value={endNote}
                onChange={(e) => setEndNote(e.target.value)}
                placeholder="마무리 코멘트 — 길게 적어도 됩니다. 오른쪽 아래 모서리를 드래그해 칸을 늘릴 수 있어요."
                rows={6}
                style={{ minHeight: 140, resize: "vertical", lineHeight: 1.6 }}
              />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn"
                style={{ flex: 1 }}
                onClick={() => !endBusy && setEndTask(null)}
              >
                취소
              </button>
              <button
                className="btn primary"
                style={{ flex: 2 }}
                onClick={submitEnd}
                disabled={endBusy}
              >
                {endBusy ? "처리 중…" : "종료 처리"}
              </button>
            </div>
          </div>
        </div>
      )}

      {detailId && (
        <TaskDetailModal
          taskId={detailId}
          readOnly={!isSelf}
          onClose={() => setDetailId(null)}
          onSaved={() => {
            setDetailId(null);
            void load();
          }}
          onDeleted={() => {
            setDetailId(null);
            void load();
          }}
        />
      )}

      {reviewTask && (
        <ReviewModal
          task={reviewTask}
          onClose={() => setReviewTask(null)}
          onDone={() => {
            setReviewTask(null);
            void load();
          }}
        />
      )}

      {docTask && (
        <TaskDocModal
          taskId={docTask.id}
          title={docTask.title}
          readOnly={!isSelf}
          onClose={() => setDocTask(null)}
          onSaved={() => void load()}
        />
      )}

      {endDayOpen && me && (
        <EndDayModal
          userId={me.id}
          dateKey={dateKeyISO}
          tasks={[...currentTasks, ...todayList]}
          onClose={() => setEndDayOpen(false)}
          onDone={() => { setEndDayOpen(false); void load(); }}
        />
      )}
    </>
  );
}

export default function ActivityPage() {
  return (
    <Suspense fallback={null}>
      <ActivityInner />
    </Suspense>
  );
}
