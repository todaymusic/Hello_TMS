import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { ChatService } from '../chat/chat.service';
import { DriveService } from './drive.service';
import { SttService } from './stt.service';

function driveLink(fileId?: string | null) {
  return fileId ? `https://drive.google.com/file/d/${fileId}/view` : null;
}

// 파일명에서 회의 날짜 추출: "2026/06/30 13:36" "2026_06_17 15_00" "2026-06-09" 등
function parseDriveDate(name?: string | null): string | null {
  if (!name) return null;
  const m = name.match(/(20\d\d)[/_-](\d{1,2})[/_-](\d{1,2})(?:[ T](\d{1,2})[:_](\d{2}))?/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  const dt = new Date(
    Number(y),
    Number(mo) - 1,
    Number(d),
    h ? Number(h) : 9,
    mi ? Number(mi) : 0,
  );
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}

@Injectable()
export class MeetingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly chat: ChatService,
    private readonly drive: DriveService,
    private readonly stt: SttService,
  ) {}

  /** 즉석 녹음 오디오 → STT → AI 제목/개요 → 회의 저장 */
  async recordAndCreate(buffer: Buffer, ext: string, authorId?: string) {
    const transcript = await this.stt.transcribe(buffer, ext);
    if (!transcript.trim()) {
      throw new BadRequestException('음성에서 텍스트를 추출하지 못했습니다');
    }
    return this.create({
      date: new Date().toISOString(),
      transcriptText: transcript,
      announce: true,
      authorId,
    });
  }

  /** 드라이브에서 온 회의 전체 하드삭제(재임포트용) */
  async resetDrive() {
    const r = await this.prisma.meeting.deleteMany({ where: { driveFileId: { not: null } } });
    return { deleted: r.count };
  }

  /** 진단: 폴더 파일 목록(이름·형식·날짜) */
  async driveFiles(folderId?: string) {
    const fid = folderId || process.env.MEETINGS_DRIVE_FOLDER_ID;
    if (!fid) throw new BadRequestException('폴더 ID 없음');
    const files = await this.drive.listFolder(fid);
    return files.map((f) => ({
      name: f.name,
      mimeType: f.mimeType,
      createdTime: f.createdTime,
    }));
  }

  /** 구글드라이브 폴더에서 회의(트랜스크립트) 자동 가져오기 */
  async syncFromDrive(folderId?: string, authorId?: string) {
    const fid = folderId || process.env.MEETINGS_DRIVE_FOLDER_ID;
    if (!fid) {
      throw new BadRequestException(
        '폴더 ID가 없습니다 (요청 folderId 또는 환경변수 MEETINGS_DRIVE_FOLDER_ID)',
      );
    }
    const files = await this.drive.listFolder(fid);
    const videos = files.filter((f) => f.mimeType?.startsWith('video/'));
    // 트랜스크립트 = 구글문서/텍스트 (Gemini 회의록 등)
    const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const docs = files.filter(
      (f) =>
        f.mimeType === 'application/vnd.google-apps.document' ||
        f.mimeType?.startsWith('text/') ||
        f.mimeType === DOCX,
    );

    const usedVideos = new Set<string>();
    const baseName = (n?: string | null) =>
      (n ?? '').replace(/\s*[-–]\s*(transcript|gemini|기록|메모|스크립트|노트|recording|녹화).*$/i, '').trim();

    let imported = 0;
    let skipped = 0;
    for (const tr of docs) {
      const exists = await this.prisma.meeting.findFirst({
        where: { driveFileId: tr.id! },
      });
      if (exists) {
        skipped++;
        continue;
      }
      const text = await this.drive.readText(tr);
      const base = baseName(tr.name);
      const trTime = tr.createdTime ? new Date(tr.createdTime).getTime() : 0;

      // 영상 매칭: ①같은 이름(전체 prefix) 우선 → ②생성시각 가장 가까운 것. 한 번 쓴 영상은 재사용 안 함.
      let video: (typeof videos)[number] | undefined;
      const byName = videos.find(
        (v) => !usedVideos.has(v.id!) && base.length > 4 && baseName(v.name) === base,
      );
      if (byName) {
        video = byName;
      } else {
        let bestDiff = Infinity;
        for (const v of videos) {
          if (usedVideos.has(v.id!)) continue;
          const vt = v.createdTime ? new Date(v.createdTime).getTime() : 0;
          const diff = Math.abs(vt - trTime);
          if (diff < bestDiff) {
            bestDiff = diff;
            video = v;
          }
        }
        // 6시간 이상 차이나면 매칭 안 함(다른 날 영상 오매칭 방지)
        if (video && bestDiff > 6 * 3600 * 1000) video = undefined;
      }
      if (video?.id) usedVideos.add(video.id);

      await this.create({
        date:
          parseDriveDate(tr.name) ??
          parseDriveDate(video?.name) ??
          tr.createdTime ??
          new Date().toISOString(),
        driveFileId: tr.id!,
        videoUrl: video?.webViewLink ?? undefined,
        transcriptUrl: tr.webViewLink ?? undefined,
        transcriptText: text || undefined,
        announce: false,
        authorId,
      });
      imported++;
    }

    // 트랜스크립트 없이 영상만 있는 회의(예: 옛 녹화)도 등록
    let videoOnly = 0;
    for (const v of videos) {
      if (usedVideos.has(v.id!)) continue;
      const exists = await this.prisma.meeting.findFirst({ where: { driveFileId: v.id! } });
      if (exists) {
        skipped++;
        continue;
      }
      // 제목: 괄호 안 회의명 우선, 없으면 " - " 앞부분
      const paren = v.name?.match(/\(([^)]+)\)/);
      const title =
        (paren ? paren[1] : (v.name ?? '').split(/\s*[-–]\s*/)[0])?.trim() || '회의';
      await this.create({
        title,
        date: parseDriveDate(v.name) ?? v.createdTime ?? new Date().toISOString(),
        driveFileId: v.id!,
        videoUrl: v.webViewLink ?? undefined,
        announce: false,
        authorId,
      });
      videoOnly++;
    }

    return {
      imported,
      videoOnly,
      skipped,
      docs: docs.length,
      videos: videos.length,
    };
  }

  findAll() {
    return this.prisma.meeting.findMany({
      where: { dismissed: false },
      orderBy: { date: 'desc' },
    });
  }

  async findOne(id: string) {
    const m = await this.prisma.meeting.findUnique({ where: { id } });
    if (!m) throw new NotFoundException(`Meeting ${id} not found`);
    return m;
  }

  async create(dto: {
    title?: string;
    date: string;
    driveFileId?: string;
    videoUrl?: string;
    transcriptUrl?: string;
    transcriptText?: string;
    announce?: boolean;
    authorId?: string;
  }) {
    let title = dto.title?.trim() || '';
    let summary: string | null = null;

    // 트랜스크립트가 있으면 AI로 제목(없을 때)·개요 생성
    if (dto.transcriptText?.trim()) {
      try {
        const r = await this.ai.meetingSummary(dto.transcriptText);
        summary = r.summary;
        if (!title) title = r.title;
      } catch {
        /* AI 실패해도 회의는 생성 */
      }
    }
    if (!title) title = '회의';

    const meeting = await this.prisma.meeting.create({
      data: {
        title,
        date: new Date(dto.date),
        driveFileId: dto.driveFileId,
        videoUrl: dto.videoUrl,
        transcriptUrl: dto.transcriptUrl,
        transcriptText: dto.transcriptText,
        summary,
      },
    });

    // 전체공지에 자동 공지(드라이브 링크 포함)
    if (dto.announce !== false && dto.authorId) {
      await this.announce(meeting.id, dto.authorId);
    }
    return meeting;
  }

  /** 트랜스크립트 재요약 */
  async resummarize(id: string) {
    const m = await this.findOne(id);
    if (!m.transcriptText) {
      return m;
    }
    const r = await this.ai.meetingSummary(m.transcriptText);
    return this.prisma.meeting.update({
      where: { id },
      data: { title: r.title, summary: r.summary },
    });
  }

  /** 전체공지 채널에 회의 공지 메시지 게시 */
  async announce(id: string, authorId: string) {
    const m = await this.findOne(id);
    const ch = await this.chat.ensureBroadcast();
    const link = m.videoUrl || m.transcriptUrl || driveLink(m.driveFileId);
    const content =
      `📹 [회의] ${m.title}\n` +
      (link ? `🔗 영상·트랜스크립트: ${link}` : '') +
      (m.summary ? `\n\n${m.summary.slice(0, 300)}` : '');
    await this.chat.send(ch.id, authorId, content);
    return { ok: true };
  }

  async remove(id: string) {
    const m = await this.findOne(id);
    // 드라이브에서 온 회의는 소프트삭제(dismissed)로 두어 재동기화 시 재등록 방지
    if (m.driveFileId) {
      return this.prisma.meeting.update({
        where: { id },
        data: { dismissed: true },
      });
    }
    return this.prisma.meeting.delete({ where: { id } });
  }
}
