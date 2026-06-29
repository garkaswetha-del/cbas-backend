import { Injectable, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class MemosService implements OnModuleInit {
  constructor(private dataSource: DataSource) {}

  async onModuleInit() {
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS memos (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR NOT NULL,
        content TEXT NOT NULL,
        target_type VARCHAR NOT NULL DEFAULT 'all',
        target_value TEXT,
        created_by VARCHAR,
        academic_year VARCHAR,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS memo_reads (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        memo_id UUID NOT NULL,
        teacher_id UUID NOT NULL,
        teacher_name VARCHAR,
        read_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(memo_id, teacher_id)
      )
    `);
  }
}
