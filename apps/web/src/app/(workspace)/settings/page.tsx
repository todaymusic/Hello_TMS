"use client";

import { useEffect, useState } from "react";
import { api, STATUS_LABEL, type Leave, type LeaveType } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import AdminPanel from "./AdminPanel";
import AccountCreate from "./AccountCreate";

// 계정 생성만 가능한 관리자(연차 관리 등은 숨김) — 예: 신선중 대표
const ACCOUNT_ONLY_ADMINS = ["thedudir@gmail.com"];

const LEAVE_LABEL: Record<LeaveType, string> = {
  annual: "Annual 연차",
  half: "Half 반차",
  quarter: "Quarter 반반차",
  sick: "Sick 병가",
  etc: "Etc 기타",
};
const STATUS_KO = {
  requested: "Requested 신청됨",
  approved: "Approved 승인",
  rejected: "Rejected 반려",
} as const;

function fmt(d: string) {
  const dt = new Date(d);
  return `${dt.getFullYear()}.${String(dt.getMonth() + 1).padStart(2, "0")}.${String(dt.getDate()).padStart(2, "0")}`;
}

export default function SettingsPage() {
  const { user, logout, refresh } = useAuth();

  // 비밀번호 변경
  const [cur, setCur] = useState("");
  const [nw, setNw] = useState("");
  const [nw2, setNw2] = useState("");
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [pwBusy, setPwBusy] = useState(false);

  // 근무 시간
  const [wStart, setWStart] = useState("");
  const [wEnd, setWEnd] = useState("");
  const [wMsg, setWMsg] = useState<string | null>(null);
  const [wBusy, setWBusy] = useState(false);
  useEffect(() => {
    setWStart(user?.workStart ?? "");
    setWEnd(user?.workEnd ?? "");
  }, [user?.workStart, user?.workEnd]);
  async function saveWork() {
    if (!user) return;
    setWBusy(true);
    setWMsg(null);
    try {
      await api.patch(`/users/${user.id}`, {
        workStart: wStart || undefined,
        workEnd: wEnd || undefined,
      });
      await refresh();
      setWMsg("✅ Work hours saved 근무 시간 저장됨");
    } catch (e) {
      setWMsg(e instanceof Error ? e.message : "Save failed 저장 실패");
    } finally {
      setWBusy(false);
    }
  }

  // 휴가
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [lvType, setLvType] = useState<LeaveType>("annual");
  const [lvStart, setLvStart] = useState("");
  const [lvEnd, setLvEnd] = useState("");
  const [lvReason, setLvReason] = useState("");
  const [lvMsg, setLvMsg] = useState<string | null>(null);
  const [lvBusy, setLvBusy] = useState(false);

  async function loadLeaves() {
    if (!user) return;
    try {
      const l = await api.get<Leave[]>(`/leaves?userId=${user.id}`);
      setLeaves(l);
    } catch {
      /* noop */
    }
  }
  useEffect(() => {
    void loadLeaves();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function changePassword() {
    setPwMsg(null);
    if (nw.length < 4) {
      setPwMsg("New password must be at least 4 characters 새 비밀번호는 4자 이상이어야 합니다");
      return;
    }
    if (nw !== nw2) {
      setPwMsg("New password confirmation does not match 새 비밀번호 확인이 일치하지 않습니다");
      return;
    }
    setPwBusy(true);
    try {
      await api.post("/auth/change-password", {
        currentPassword: cur,
        newPassword: nw,
      });
      setPwMsg("✅ Password changed 비밀번호가 변경되었습니다");
      setCur("");
      setNw("");
      setNw2("");
    } catch (e) {
      setPwMsg(e instanceof Error ? e.message : "Change failed 변경 실패");
    } finally {
      setPwBusy(false);
    }
  }

  // 신청됨 휴가: 본인이 즉시 취소(삭제)
  async function cancelLeave(id: string) {
    setLvBusy(true);
    try {
      await api.del(`/leaves/${id}`);
      await loadLeaves();
      await refresh();
    } finally {
      setLvBusy(false);
    }
  }
  // 승인됨 휴가: 취소 요청(관리자 확인 대기)
  async function requestCancel(id: string) {
    setLvBusy(true);
    try {
      await api.patch(`/leaves/${id}/request-cancel`, {});
      await loadLeaves();
    } finally {
      setLvBusy(false);
    }
  }

  // 최근 3개월(종료일 기준)만 표시
  const cutoff = Date.now() - 1000 * 60 * 60 * 24 * 92;
  const visibleLeaves = leaves.filter(
    (lv) => new Date(lv.endDate).getTime() >= cutoff,
  );

  async function requestLeave() {
    setLvMsg(null);
    if (!user) return;
    if (!lvStart || !lvEnd) {
      setLvMsg("Enter start and end date 시작일과 종료일을 입력하세요");
      return;
    }
    setLvBusy(true);
    try {
      await api.post("/leaves", {
        userId: user.id,
        type: lvType,
        startDate: lvStart,
        endDate: lvEnd,
        reason: lvReason.trim() || undefined,
      });
      setLvMsg("✅ Leave requested 휴가를 신청했습니다");
      setLvStart("");
      setLvEnd("");
      setLvReason("");
      await loadLeaves();
    } catch (e) {
      setLvMsg(e instanceof Error ? e.message : "Request failed 신청 실패");
    } finally {
      setLvBusy(false);
    }
  }

  const accountOnly = !!user && ACCOUNT_ONLY_ADMINS.includes(user.email);

  // 계정 생성 전용 관리자(신선중 대표) — 계정 추가만 노출
  if (accountOnly) {
    return (
      <>
        <div className="topbar">
          <div>
            <h1>Settings 설정</h1>
            <div className="sub">Create account 계정 생성</div>
          </div>
        </div>
        <div className="content" style={{ display: "grid", gap: 16 }}>
          <div className="pill teal" style={{ width: "fit-content" }}>
            👑 Admin · Account only 계정 생성 전용
          </div>
          <AccountCreate />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Settings 설정</h1>
          <div className="sub">Account · Password · Leave 내 계정 · 비밀번호 · 휴가</div>
        </div>
      </div>
      <div className="content" style={{ display: "grid", gap: 16 }}>
        {user?.isAdmin && (
          <div style={{ display: "grid", gap: 12 }}>
            <div className="pill teal" style={{ width: "fit-content" }}>
              👑 Admin 관리자 모드
            </div>
            <AccountCreate />
            <AdminPanel />
          </div>
        )}

        {/* 내 휴가 (잔여 + 신청 + 목록) */}
        <div className="card" style={{ padding: 22, maxWidth: 600 }}>
          <div className="sec-title mb16" style={{ display: "flex", alignItems: "center" }}>
            <span className="em">🌴</span> My Leave 내 휴가
            <span className="pill teal" style={{ marginLeft: "auto", fontSize: 13 }}>
              Leave left 남은 연차 {user?.leaveBalance ?? 0}일
            </span>
          </div>

          <div className="assign-field" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label>Type 종류</label>
              <select className="inp" value={lvType} onChange={(e) => setLvType(e.target.value as LeaveType)}>
                <option value="annual">Annual 연차 (−1)</option>
                <option value="half">Half 반차 (−0.5)</option>
                <option value="quarter">Quarter 반반차 (−0.25)</option>
                <option value="sick">Sick 병가</option>
                <option value="etc">Etc 기타</option>
              </select>
            </div>
            <div>
              <label>Reason (optional) 사유 (선택)</label>
              <input className="inp" value={lvReason} onChange={(e) => setLvReason(e.target.value)} placeholder="Reason 사유" />
            </div>
            <div>
              <label>Start 시작일</label>
              <input className="inp" type="date" value={lvStart} onChange={(e) => setLvStart(e.target.value)} />
            </div>
            <div>
              <label>End 종료일</label>
              <input className="inp" type="date" value={lvEnd} onChange={(e) => setLvEnd(e.target.value)} />
            </div>
          </div>
          {lvMsg && (
            <div className="field-hint" style={{ color: lvMsg.startsWith("✅") ? "#16a34a" : "#dc2626" }}>
              {lvMsg}
            </div>
          )}
          <button className="btn primary" onClick={requestLeave} disabled={lvBusy}>
            {lvBusy ? "Requesting… 신청 중…" : "Request Leave 휴가 신청"}
          </button>
          <div className="hint" style={{ marginTop: 6 }}>
            On admin approval, the balance is auto-deducted by leave type. 관리자 승인 시 종류별로 잔여 연차에서 자동 차감됩니다.
          </div>

          <div style={{ marginTop: 16, display: "grid", gap: 8 }}>
            {visibleLeaves.length === 0 && (
              <div style={{ color: "var(--text-3)", fontSize: 13 }}>No leave in the last 3 months. 최근 3개월 내 휴가가 없습니다.</div>
            )}
            {visibleLeaves.map((lv) => (
              <div
                key={lv.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 12px",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 13,
                  flexWrap: "wrap",
                }}
              >
                <span className="pill gray">{LEAVE_LABEL[lv.type]}</span>
                <span>
                  {fmt(lv.startDate)} – {fmt(lv.endDate)}
                </span>
                {lv.reason && <span style={{ color: "var(--text-3)" }}>· {lv.reason}</span>}
                <span style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
                  <span
                    className="pill"
                    style={{
                      background:
                        lv.status === "approved" ? "#dcfce7" : lv.status === "rejected" ? "#fee2e2" : "#fef9c3",
                      color:
                        lv.status === "approved" ? "#15803d" : lv.status === "rejected" ? "#b91c1c" : "#a16207",
                    }}
                  >
                    {STATUS_KO[lv.status]}
                  </span>
                  {lv.status === "requested" && (
                    <button className="btn sm" onClick={() => cancelLeave(lv.id)} disabled={lvBusy}>
                      Cancel 취소
                    </button>
                  )}
                  {lv.status === "approved" &&
                    (lv.cancelRequested ? (
                      <span className="pill" style={{ background: "#fef9c3", color: "#a16207" }}>
                        Cancel requested 취소요청됨
                      </span>
                    ) : (
                      <button className="btn sm" onClick={() => requestCancel(lv.id)} disabled={lvBusy}>
                        Request Cancel 취소 요청
                      </button>
                    ))}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 내 계정 */}
        <div className="card" style={{ padding: 22, maxWidth: 600 }}>
          <div className="sec-title mb16">
            <span className="em">👤</span> My Account 내 계정
          </div>
          {user ? (
            <div style={{ display: "grid", gap: 8, fontSize: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div className="avatar" style={{ background: user.avatarColor, width: 40, height: 40 }}>
                  {user.name.slice(0, 1)}
                </div>
                <div>
                  <div style={{ fontWeight: 700 }}>
                    {user.name}{" "}
                    <span style={{ color: "var(--text-3)", fontWeight: 400, fontSize: 12 }}>
                      {user.dept ?? ""} {user.role ?? ""}
                    </span>
                  </div>
                  <div style={{ color: "var(--text-3)", fontSize: 12 }}>{user.email}</div>
                </div>
                <span className="pill gray" style={{ marginLeft: "auto" }}>
                  {STATUS_LABEL[user.status]}
                </span>
              </div>
              <button className="btn" style={{ marginTop: 6, color: "#dc2626", width: 120 }} onClick={logout}>
                🚪 Logout 로그아웃
              </button>
            </div>
          ) : (
            <div style={{ color: "var(--text-3)", fontSize: 13 }}>Loading… 불러오는 중…</div>
          )}
        </div>

        {/* 비밀번호 변경 */}
        <div className="card" style={{ padding: 22, maxWidth: 600 }}>
          <div className="sec-title mb16">
            <span className="em">🔒</span> Change Password 비밀번호 변경
          </div>
          <div className="assign-field">
            <label>Current Password 현재 비밀번호</label>
            <input className="inp" type="password" value={cur} onChange={(e) => setCur(e.target.value)} />
          </div>
          <div className="assign-field">
            <label>New Password 새 비밀번호</label>
            <input className="inp" type="password" value={nw} onChange={(e) => setNw(e.target.value)} />
          </div>
          <div className="assign-field">
            <label>Confirm New Password 새 비밀번호 확인</label>
            <input className="inp" type="password" value={nw2} onChange={(e) => setNw2(e.target.value)} />
          </div>
          {pwMsg && (
            <div className="field-hint" style={{ color: pwMsg.startsWith("✅") ? "#16a34a" : "#dc2626" }}>
              {pwMsg}
            </div>
          )}
          <button className="btn primary" onClick={changePassword} disabled={pwBusy}>
            {pwBusy ? "Changing… 변경 중…" : "Change Password 비밀번호 변경"}
          </button>
        </div>

        {/* 근무 시간 (퇴근 알림) */}
        <div className="card" style={{ padding: 22, maxWidth: 600 }}>
          <div className="sec-title mb16">
            <span className="em">🕘</span> Work Hours 근무 시간
          </div>
          <div className="hint" style={{ marginBottom: 10 }}>
            5 minutes before clock-out, a “please log your progress” reminder appears. 퇴근 시간 5분 전에 “진행률을 기입해주세요” 알림이 떠요.
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div className="assign-field" style={{ margin: 0 }}>
              <label>Clock In 출근</label>
              <input className="inp" type="time" value={wStart} onChange={(e) => setWStart(e.target.value)} />
            </div>
            <div className="assign-field" style={{ margin: 0 }}>
              <label>Clock Out 퇴근</label>
              <input className="inp" type="time" value={wEnd} onChange={(e) => setWEnd(e.target.value)} />
            </div>
            <button className="btn primary" onClick={saveWork} disabled={wBusy}>
              {wBusy ? "Saving… 저장 중…" : "Save 저장"}
            </button>
          </div>
          {wMsg && (
            <div className="field-hint" style={{ marginTop: 8, color: wMsg.startsWith("✅") ? "#16a34a" : "#dc2626" }}>
              {wMsg}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
