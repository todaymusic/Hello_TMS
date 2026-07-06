import { BadRequestException, Injectable } from '@nestjs/common';
import { google, type drive_v3 } from 'googleapis';
import mammoth from 'mammoth';

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

@Injectable()
export class DriveService {
  private client: drive_v3.Drive | null = null;

  /** 서비스계정 JSON(GOOGLE_SERVICE_ACCOUNT_JSON) 이 있을 때만 Drive 클라이언트 생성 */
  private getClient(): drive_v3.Drive {
    if (this.client) return this.client;
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!raw) {
      throw new BadRequestException(
        '드라이브 연동 미설정: Railway 환경변수 GOOGLE_SERVICE_ACCOUNT_JSON 을 추가하세요',
      );
    }
    let creds: { client_email: string; private_key: string };
    try {
      creds = JSON.parse(raw);
    } catch {
      throw new BadRequestException('GOOGLE_SERVICE_ACCOUNT_JSON 파싱 실패(JSON 형식 확인)');
    }
    const auth = new google.auth.JWT({
      email: creds.client_email,
      key: creds.private_key,
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });
    this.client = google.drive({ version: 'v3', auth });
    return this.client;
  }

  /** 폴더 내 파일 목록 (하위폴더까지 재귀 + 페이지네이션) */
  async listFolder(folderId: string) {
    const drive = this.getClient();
    const all: drive_v3.Schema$File[] = [];
    const stack = [folderId];
    const seen = new Set<string>();
    while (stack.length) {
      const fid = stack.pop()!;
      if (seen.has(fid)) continue;
      seen.add(fid);
      let pageToken: string | undefined;
      do {
        const res = await drive.files.list({
          q: `'${fid}' in parents and trashed = false`,
          fields: 'nextPageToken, files(id, name, mimeType, webViewLink, createdTime)',
          pageSize: 200,
          pageToken,
          orderBy: 'createdTime desc',
        });
        for (const f of res.data.files ?? []) {
          if (f.mimeType === 'application/vnd.google-apps.folder') {
            if (f.id) stack.push(f.id);
          } else {
            all.push(f);
          }
        }
        pageToken = res.data.nextPageToken ?? undefined;
      } while (pageToken);
    }
    return all;
  }

  /** 구글 문서/텍스트 파일 → 본문 텍스트 */
  async readText(file: drive_v3.Schema$File): Promise<string> {
    const drive = this.getClient();
    if (file.mimeType === 'application/vnd.google-apps.document') {
      const res = await drive.files.export(
        { fileId: file.id!, mimeType: 'text/plain' },
        { responseType: 'text' },
      );
      return String(res.data ?? '');
    }
    if (file.mimeType?.startsWith('text/')) {
      const res = await drive.files.get(
        { fileId: file.id!, alt: 'media' },
        { responseType: 'text' },
      );
      return String(res.data ?? '');
    }
    if (file.mimeType === DOCX_MIME) {
      const res = await drive.files.get(
        { fileId: file.id!, alt: 'media' },
        { responseType: 'arraybuffer' },
      );
      const buffer = Buffer.from(res.data as ArrayBuffer);
      const out = await mammoth.extractRawText({ buffer });
      return out.value ?? '';
    }
    return '';
  }

  static readonly DOCX_MIME = DOCX_MIME;

  get enabled() {
    return !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  }
}
