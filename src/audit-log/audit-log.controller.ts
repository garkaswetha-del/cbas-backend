import { Controller, Get, Query } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';

@Controller('audit-logs')
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  findAll(
    @Query('limit')     limit?: string,
    @Query('offset')    offset?: string,
    @Query('action')    action?: string,
    @Query('user_name') user_name?: string,
    @Query('date_from') date_from?: string,
    @Query('date_to')   date_to?: string,
  ) {
    return this.auditLogService.findAll({
      limit:     limit  ? +limit  : undefined,
      offset:    offset ? +offset : undefined,
      action,
      user_name,
      date_from,
      date_to,
    });
  }
}
