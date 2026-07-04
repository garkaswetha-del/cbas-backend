import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';

@Injectable()
export class AuditLogService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>,
  ) {}

  // Fire-and-forget — never blocks the caller
  log(entry: Partial<AuditLog>): void {
    this.repo.save(this.repo.create(entry)).catch(() => {});
  }

  async findAll(params: {
    limit?: number;
    offset?: number;
    action?: string;
    user_name?: string;
    date_from?: string;
    date_to?: string;
  }) {
    const qb = this.repo.createQueryBuilder('log').orderBy('log.timestamp', 'DESC');

    if (params.action)    qb.andWhere('log.action = :action',           { action: params.action });
    if (params.user_name) qb.andWhere('log.user_name ILIKE :user_name', { user_name: `%${params.user_name}%` });
    if (params.date_from) qb.andWhere('log.timestamp >= :date_from',    { date_from: params.date_from });
    if (params.date_to)   qb.andWhere('log.timestamp <= :date_to',      { date_to: params.date_to });

    const limit  = Math.min(params.limit ?? 50, 200);
    const offset = params.offset ?? 0;
    const [data, total] = await qb.limit(limit).offset(offset).getManyAndCount();
    return { data, total, limit, offset };
  }
}
