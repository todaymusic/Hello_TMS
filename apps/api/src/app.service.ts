import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  health() {
    return {
      service: 'tms-api',
      status: 'ok',
      time: new Date().toISOString(),
    };
  }
}
