// TMS API 클라이언트 — 배포된 NestJS API(apps/api) 호출.
// 서버컴포넌트/클라이언트 양쪽에서 쓰도록 NEXT_PUBLIC_API_URL 사용.

const BASE =
  process.env.NEXT_PUBLIC_API_URL ??
  // hellotms는 기존 TMS 백엔드/DB를 그대로 공유(축소된 프론트만 별도).
  // → 같은 데이터·같은 계정. 별도 백엔드로 분리하려면 NEXT_PUBLIC_API_URL로 덮어쓸 것.
  'https://tms-production-6ba9.up.railway.app/api';

export const API_BASE = BASE;

type Json = Record<string, unknown>;

function authToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem('tms_token');
}

async function request<T>(
  path: string,
  options?: { method?: string; body?: Json; cache?: RequestCache },
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options?.body) headers['Content-Type'] = 'application/json';
  const token = authToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method: options?.method ?? 'GET',
    headers,
    body: options?.body ? JSON.stringify(options.body) : undefined,
    // 데이터가 자주 바뀌므로 캐시하지 않음(필요 시 호출부에서 조정)
    cache: options?.cache ?? 'no-store',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${options?.method ?? 'GET'} ${path} → ${res.status} ${text}`);
  }
  // 204 No Content 대비
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string, cache?: RequestCache) => request<T>(path, { cache }),
  post: <T>(path: string, body: Json) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body: Json) =>
    request<T>(path, { method: 'PATCH', body }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

// ───────── 타입 (API 응답 형태) ─────────
export type UserStatus = 'on' | 'away' | 'dnd' | 'off';
export type Category = 'long' | 'shorts' | 'project';
export type Priority = 'urgent' | 'high' | 'medium' | 'low';
export type TaskStatus =
  | 'todo'
  | 'doing'
  | 'paused'
  | 'review'
  | 'done'
  | 'completed_pending'
  | 'rejected';
export type ProjectStatus = 'active' | 'archived';

export type UserBrief = {
  id: string;
  name: string;
  avatarColor: string;
  dept?: string | null;
};

export type Member = {
  id: string;
  userId: string;
  role?: string;
  user: UserBrief;
};

export type ProjectListItem = {
  id: string;
  name: string;
  overview: string | null;
  status: ProjectStatus;
  progress: number;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  owners: Member[];
  participants: Member[];
  _count: { tasks: number; messages: number };
};

export type Task = {
  id: string;
  title: string;
  category: Category;
  subCategory: string | null;
  priority: Priority;
  status: TaskStatus;
  reportRequired: boolean;
  videoRequired: boolean;
  reportLink: string | null;
  videoLink: string | null;
  statusMemo: string | null;
  reworkCount?: number;
  reworkReason?: string | null;
  pauseReason?: string | null;
  estimateMinutes?: number | null;
  grade?: string | null;
  aiReview?: string | null;
  dueDate: string | null;
  plannedDate?: string | null;
  dayOrder?: number | null;
  acceptedAt?: string | null;
  rejectedAt?: string | null;
  rejectReason?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  createdAt?: string;
  progress: number;
  aiDescriptionDoc?: string | null;
  assigner: UserBrief | null;
  assignee: UserBrief | null;
  project: { id: string; name: string } | null;
};

// 업무 상세(GET /tasks/:id) — 전체 필드
export type TaskDetail = Task & {
  description: string | null;
  descriptionPrompt: string | null;
  aiDescriptionDoc: string | null;
  startedAt: string | null;
  endedAt: string | null;
};

// ───────── 채팅 ─────────
export type ChatUser = { id: string; name: string; avatarColor: string; dept?: string | null };
export type ChatChannel = {
  id: string;
  name: string | null;
  type: "dm" | "group" | "broadcast";
  pinned?: boolean;
  members: ChatUser[];
  lastMessage: { content: string; createdAt: string; userName: string } | null;
  lastAt: string;
  unread: number;
};
export type ChatMessage = {
  id: string;
  content: string;
  pinned: boolean;
  mentions?: string[] | null;
  replyTo?: { id: string; content: string; user: ChatUser } | null;
  createdAt: string;
  user: ChatUser;
};

export type ScheduleBlock = {
  id: string;
  taskId: string | null;
  label: string | null;
  startMin: number;
  endMin: number;
  task: { id: string; title: string; priority: Priority; status: TaskStatus } | null;
};

export type Meeting = {
  id: string;
  title: string;
  date: string;
  driveFileId: string | null;
  videoUrl: string | null;
  transcriptUrl: string | null;
  transcriptText: string | null;
  summary: string | null;
  createdAt: string;
};
export function driveLink(fileId: string | null | undefined) {
  return fileId ? `https://drive.google.com/file/d/${fileId}/view` : null;
}

export type ProjectLink = { label: string; url: string };

export type TaskInProject = {
  id: string;
  title: string;
  category: Category;
  subCategory: string | null;
  priority: Priority;
  status: TaskStatus;
  dueDate: string | null;
  progress: number;
  assignee: UserBrief | null;
};

export type ProjectDetail = {
  id: string;
  name: string;
  overview: string | null;
  description: string | null;
  status: ProjectStatus;
  progress: number;
  startDate: string | null;
  endDate: string | null;
  links: ProjectLink[] | null;
  aiSummary: unknown | null;
  owners: Member[];
  participants: Member[];
  tasks: TaskInProject[];
};

export type Message = {
  id: string;
  content: string;
  mentions: string[] | null;
  reactions: Record<string, string[]> | null;
  createdAt: string;
  user: UserBrief;
};

export type LeaveType = "annual" | "half" | "quarter" | "sick" | "etc";
export type LeaveStatus = "requested" | "approved" | "rejected";

export type Leave = {
  id: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  reason: string | null;
  status: LeaveStatus;
  cancelRequested?: boolean;
  createdAt: string;
};

export type User = {
  id: string;
  email: string;
  name: string;
  dept: string | null;
  role: string | null;
  avatarColor: string;
  status: UserStatus;
  statusMessage: string | null;
  lastSeenAt?: string | null;
  clockedOut?: boolean;
  isAdmin?: boolean;
  leaveBalance?: number;
  workStart?: string | null;
  workEnd?: string | null;
};

// SPEC: 진행률 경과별 색상 코딩 (0⚪ / ~25🔴 / ~50🟠 / ~75🟡 / ~99🔵 / 100🟢)
export function progressColor(pct: number): string {
  if (pct <= 0) return '#9ca3af';
  if (pct <= 25) return '#dc2626';
  if (pct <= 50) return '#ea580c';
  if (pct <= 75) return '#eab308';
  if (pct <= 99) return '#2563eb';
  return '#16a34a';
}

export const STATUS_LABEL: Record<UserStatus, string> = {
  on: 'Working 업무중',
  away: 'Away 자리비움',
  dnd: 'DND 방해금지',
  off: 'Offline 오프라인',
};
