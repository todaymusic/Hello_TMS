import { BadRequestException, Injectable } from '@nestjs/common';
import speech from '@google-cloud/speech';
import { Storage } from '@google-cloud/storage';

@Injectable()
export class SttService {
  get enabled() {
    return !!(
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.env.GCS_BUCKET
    );
  }

  private creds() {
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!raw) throw new BadRequestException('GOOGLE_SERVICE_ACCOUNT_JSON 미설정');
    return JSON.parse(raw) as {
      project_id: string;
      client_email: string;
      private_key: string;
    };
  }

  /** 오디오 버퍼 → GCS 업로드 → STT v2 batchRecognize(화자분리) → 트랜스크립트 텍스트 */
  async transcribe(buffer: Buffer, ext: string): Promise<string> {
    const bucket = process.env.GCS_BUCKET;
    if (!bucket) throw new BadRequestException('GCS_BUCKET 미설정 (녹음 회의 저장용 버킷)');
    const location = process.env.STT_LOCATION || 'us-central1';
    const creds = this.creds();
    const credentials = { client_email: creds.client_email, private_key: creds.private_key };

    // 1) GCS 업로드
    const storage = new Storage({ projectId: creds.project_id, credentials });
    const objectName = `recordings/${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`;
    await storage.bucket(bucket).file(objectName).save(buffer, { resumable: false });
    const gcsUri = `gs://${bucket}/${objectName}`;

    // 2) STT v2 batchRecognize
    const client = new speech.v2.SpeechClient({
      projectId: creds.project_id,
      credentials,
      apiEndpoint: `${location}-speech.googleapis.com`,
    });
    try {
      const recognizer = `projects/${creds.project_id}/locations/${location}/recognizers/_`;
      const [operation] = await client.batchRecognize({
        recognizer,
        config: {
          autoDecodingConfig: {},
          languageCodes: ['ko-KR'],
          model: 'long',
          features: {
            enableAutomaticPunctuation: true,
            diarizationConfig: { minSpeakerCount: 1, maxSpeakerCount: 6 },
          },
        },
        files: [{ uri: gcsUri }],
        recognitionOutputConfig: { inlineResponseConfig: {} },
      });
      const [response] = await operation.promise();
      const fileResult = response.results?.[gcsUri];
      const results = fileResult?.transcript?.results ?? [];

      // 화자분리 단어가 있으면 "화자 N: ..." 로 묶기, 없으면 단순 연결
      const words: { word: string; speaker?: number | string | null }[] = [];
      for (const r of results) {
        for (const w of r.alternatives?.[0]?.words ?? []) {
          words.push({ word: w.word ?? '', speaker: w.speakerLabel });
        }
      }
      let transcript: string;
      if (words.length && words.some((w) => w.speaker)) {
        const lines: string[] = [];
        let cur = '';
        let curSpk: string | number | null | undefined;
        for (const w of words) {
          if (w.speaker !== curSpk) {
            if (cur) lines.push(`화자 ${curSpk}: ${cur.trim()}`);
            curSpk = w.speaker;
            cur = '';
          }
          cur += w.word + ' ';
        }
        if (cur) lines.push(`화자 ${curSpk}: ${cur.trim()}`);
        transcript = lines.join('\n');
      } else {
        transcript = results
          .map((r) => r.alternatives?.[0]?.transcript ?? '')
          .join(' ')
          .trim();
      }
      return transcript;
    } finally {
      // 업로드한 오디오 정리
      try {
        await storage.bucket(bucket).file(objectName).delete();
      } catch {
        /* noop */
      }
    }
  }
}
