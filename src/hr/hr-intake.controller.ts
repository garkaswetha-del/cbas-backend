import { Controller, Post } from '@nestjs/common';
import { HrIntakeService } from './hr-intake.service';

@Controller('hr/intake')
export class HrIntakeController {
  constructor(private readonly service: HrIntakeService) {}

  // Manual trigger — lets admin (or us, while testing) check the HR inbox right
  // now instead of waiting for the next scheduled poll.
  @Post('poll-now')
  pollNow() {
    return this.service.pollNow();
  }
}
