import { Injectable, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class CalendarService implements OnModuleInit {
  constructor(private dataSource: DataSource) {}

  async onModuleInit() {
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS academic_calendar_events (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        academic_year VARCHAR(10) NOT NULL,
        title        VARCHAR(255) NOT NULL,
        event_type   VARCHAR(50)  NOT NULL,
        start_date   DATE         NOT NULL,
        end_date     DATE         NOT NULL,
        applies_to   VARCHAR(20)  NOT NULL DEFAULT 'all',
        grade        INTEGER,
        created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_cal_events_year  ON academic_calendar_events(academic_year)
    `);
    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_cal_events_dates ON academic_calendar_events(start_date, end_date)
    `);
  }

  async list(academic_year: string) {
    return this.dataSource.query(
      `SELECT * FROM academic_calendar_events
       WHERE academic_year = $1
       ORDER BY start_date ASC, event_type ASC`,
      [academic_year],
    );
  }

  async create(data: {
    academic_year: string;
    title: string;
    event_type: string;
    start_date: string;
    end_date: string;
    applies_to?: string;
    grade?: number | null;
  }) {
    const rows = await this.dataSource.query(
      `INSERT INTO academic_calendar_events
         (academic_year, title, event_type, start_date, end_date, applies_to, grade)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [
        data.academic_year,
        data.title,
        data.event_type,
        data.start_date,
        data.end_date,
        data.applies_to || 'all',
        data.grade ?? null,
      ],
    );
    return rows[0];
  }

  async update(
    id: string,
    data: {
      title: string;
      event_type: string;
      start_date: string;
      end_date: string;
      applies_to: string;
      grade: number | null;
    },
  ) {
    const rows = await this.dataSource.query(
      `UPDATE academic_calendar_events
       SET title       = $1,
           event_type  = $2,
           start_date  = $3,
           end_date    = $4,
           applies_to  = $5,
           grade       = $6,
           updated_at  = NOW()
       WHERE id = $7
       RETURNING *`,
      [data.title, data.event_type, data.start_date, data.end_date, data.applies_to, data.grade ?? null, id],
    );
    return rows[0];
  }

  async remove(id: string) {
    await this.dataSource.query(`DELETE FROM academic_calendar_events WHERE id = $1`, [id]);
    return { ok: true };
  }
}
