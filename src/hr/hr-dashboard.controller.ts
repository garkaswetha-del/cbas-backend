import { Controller, Get } from '@nestjs/common';
import { HrDashboardService } from './hr-dashboard.service';

@Controller('hr/dashboard')
export class HrDashboardController {
  constructor(private readonly service: HrDashboardService) {}

  @Get('summary')
  getSummary() {
    return this.service.getSummary();
  }
}
