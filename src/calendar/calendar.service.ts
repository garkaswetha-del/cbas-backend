import { Injectable, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';

const SEED_TEMPLATES = [
  { title: 'Independence Day', event_type: 'holiday', category: 'Holiday', default_mmdd: '08-15', multi_day: false },
  { title: 'Gandhi Jayanti',   event_type: 'holiday', category: 'Holiday', default_mmdd: '10-02', multi_day: false },
  { title: 'Rajyotsava',       event_type: 'holiday', category: 'Holiday', default_mmdd: '11-01', multi_day: false },
  { title: 'Christmas',        event_type: 'holiday', category: 'Holiday', default_mmdd: '12-25', multi_day: false },
  { title: 'Republic Day',     event_type: 'holiday', category: 'Holiday', default_mmdd: '01-26', multi_day: false },
  { title: 'PA1',              event_type: 'exam',    category: 'Exam',    default_mmdd: null,    multi_day: false },
  { title: 'PA2',              event_type: 'exam',    category: 'Exam',    default_mmdd: null,    multi_day: false },
  { title: 'SA1',              event_type: 'exam',    category: 'Exam',    default_mmdd: null,    multi_day: true  },
  { title: 'PA3',              event_type: 'exam',    category: 'Exam',    default_mmdd: null,    multi_day: false },
  { title: 'SA2',              event_type: 'exam',    category: 'Exam',    default_mmdd: null,    multi_day: true  },
  { title: 'PTM',              event_type: 'ptm',     category: 'School',  default_mmdd: null,    multi_day: false },
  { title: 'Sports Day',       event_type: 'event',   category: 'School',  default_mmdd: null,    multi_day: false },
  { title: 'Annual Day',       event_type: 'event',   category: 'School',  default_mmdd: null,    multi_day: false },
];

@Injectable()
export class CalendarService implements OnModuleInit {
  constructor(private dataSource: DataSource) {}

  async onModuleInit() {
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS academic_calendar_events (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        academic_year VARCHAR(10) NOT NULL,
        title         VARCHAR(255) NOT NULL,
        event_type    VARCHAR(50)  NOT NULL,
        start_date    DATE         NOT NULL,
        end_date      DATE         NOT NULL,
        applies_to    VARCHAR(20)  NOT NULL DEFAULT 'all',
        grade         INTEGER,
        created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await this.dataSource.query(`CREATE INDEX IF NOT EXISTS idx_cal_events_year  ON academic_calendar_events(academic_year)`);
    await this.dataSource.query(`CREATE INDEX IF NOT EXISTS idx_cal_events_dates ON academic_calendar_events(start_date, end_date)`);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS calendar_templates (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title        VARCHAR(255) NOT NULL,
        event_type   VARCHAR(50)  NOT NULL,
        category     VARCHAR(100) NOT NULL DEFAULT 'General',
        default_mmdd VARCHAR(5),
        multi_day    BOOLEAN      NOT NULL DEFAULT false,
        display_order INTEGER     NOT NULL DEFAULT 0,
        created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Seed defaults only if table is empty
    const count = await this.dataSource.query(`SELECT COUNT(*) FROM calendar_templates`);
    if (parseInt(count[0].count) === 0) {
      for (let i = 0; i < SEED_TEMPLATES.length; i++) {
        const t = SEED_TEMPLATES[i];
        await this.dataSource.query(
          `INSERT INTO calendar_templates (title, event_type, category, default_mmdd, multi_day, display_order)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [t.title, t.event_type, t.category, t.default_mmdd ?? null, t.multi_day, i],
        );
      }
    }
  }

  // ── Calendar events ──

  async list(academic_year: string) {
    return this.dataSource.query(
      `SELECT * FROM academic_calendar_events WHERE academic_year = $1 ORDER BY start_date ASC, event_type ASC`,
      [academic_year],
    );
  }

  async create(data: {
    academic_year: string; title: string; event_type: string;
    start_date: string; end_date: string; applies_to?: string; grade?: number | null;
  }) {
    const rows = await this.dataSource.query(
      `INSERT INTO academic_calendar_events (academic_year, title, event_type, start_date, end_date, applies_to, grade)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [data.academic_year, data.title, data.event_type, data.start_date, data.end_date,
       data.applies_to || 'all', data.grade ?? null],
    );
    return rows[0];
  }

  async update(id: string, data: {
    title: string; event_type: string; start_date: string; end_date: string;
    applies_to: string; grade: number | null;
  }) {
    const rows = await this.dataSource.query(
      `UPDATE academic_calendar_events
       SET title=$1, event_type=$2, start_date=$3, end_date=$4, applies_to=$5, grade=$6, updated_at=NOW()
       WHERE id=$7 RETURNING *`,
      [data.title, data.event_type, data.start_date, data.end_date, data.applies_to, data.grade ?? null, id],
    );
    return rows[0];
  }

  async remove(id: string) {
    await this.dataSource.query(`DELETE FROM academic_calendar_events WHERE id=$1`, [id]);
    return { ok: true };
  }

  // ── Templates ──

  async listTemplates() {
    return this.dataSource.query(
      `SELECT * FROM calendar_templates ORDER BY category ASC, display_order ASC, title ASC`,
    );
  }

  async createTemplate(data: {
    title: string; event_type: string; category: string;
    default_mmdd?: string | null; multi_day?: boolean;
  }) {
    const rows = await this.dataSource.query(
      `INSERT INTO calendar_templates (title, event_type, category, default_mmdd, multi_day, display_order)
       VALUES ($1,$2,$3,$4,$5, (SELECT COALESCE(MAX(display_order),0)+1 FROM calendar_templates WHERE category=$3))
       RETURNING *`,
      [data.title.trim(), data.event_type, data.category.trim(),
       data.default_mmdd || null, data.multi_day ?? false],
    );
    return rows[0];
  }

  async updateTemplate(id: string, data: {
    title: string; event_type: string; category: string;
    default_mmdd?: string | null; multi_day?: boolean;
  }) {
    const rows = await this.dataSource.query(
      `UPDATE calendar_templates
       SET title=$1, event_type=$2, category=$3, default_mmdd=$4, multi_day=$5, updated_at=NOW()
       WHERE id=$6 RETURNING *`,
      [data.title.trim(), data.event_type, data.category.trim(),
       data.default_mmdd || null, data.multi_day ?? false, id],
    );
    return rows[0];
  }

  async removeTemplate(id: string) {
    await this.dataSource.query(`DELETE FROM calendar_templates WHERE id=$1`, [id]);
    return { ok: true };
  }
}
