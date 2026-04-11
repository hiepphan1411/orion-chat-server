import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    return {
      ok: true,
      service: 'orion-chat-backend',
      timestamp: new Date().toISOString(),
    };
  }
}
