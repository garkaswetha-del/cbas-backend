import { Injectable, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';

const STAGE_GRADES: Record<string, string[]> = {
  Foundation:  ['Pre-KG','LKG','UKG','Nursery','Grade 1','Grade 2'],
  Preparatory: ['Grade 3','Grade 4','Grade 5'],
  Middle:      ['Grade 6','Grade 7','Grade 8'],
  Secondary:   ['Grade 9','Grade 10'],
};
const STAGE_ORDER = ['Foundation','Preparatory','Middle','Secondary'];

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
    await this.dataSource.query(`ALTER TABLE memos ADD COLUMN IF NOT EXISTS is_draft BOOLEAN DEFAULT false`);
    await this.dataSource.query(`ALTER TABLE memo_reads ADD COLUMN IF NOT EXISTS reply TEXT`);
  }

  async createMemo(data: {
    title: string; content: string; target_type: string;
    target_value?: string; created_by?: string; academic_year?: string; is_draft?: boolean;
  }) {
    const rows = await this.dataSource.query(
      `INSERT INTO memos (title, content, target_type, target_value, created_by, academic_year, is_draft)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [data.title, data.content, data.target_type, data.target_value || null,
       data.created_by || null, data.academic_year || null, data.is_draft === true],
    );
    return rows[0];
  }

  async updateDraft(id: string, data: {
    title?: string; content?: string; target_type?: string;
    target_value?: string | null; is_draft?: boolean;
  }) {
    await this.dataSource.query(
      `UPDATE memos SET title = $1, content = $2, target_type = $3, target_value = $4, is_draft = $5
       WHERE id = $6`,
      [data.title, data.content, data.target_type,
       data.target_value !== undefined ? data.target_value : null,
       data.is_draft !== false, id],
    );
    return { ok: true };
  }

  async listMemos(academic_year?: string) {
    if (academic_year) {
      return this.dataSource.query(
        `SELECT m.*, COUNT(r.id)::int AS read_count
         FROM memos m
         LEFT JOIN memo_reads r ON r.memo_id = m.id
         WHERE m.is_active = true AND (m.is_draft = false OR m.is_draft IS NULL) AND m.academic_year = $1
         GROUP BY m.id
         ORDER BY m.created_at DESC`,
        [academic_year],
      );
    }
    return this.dataSource.query(
      `SELECT m.*, COUNT(r.id)::int AS read_count
       FROM memos m
       LEFT JOIN memo_reads r ON r.memo_id = m.id
       WHERE m.is_active = true AND (m.is_draft = false OR m.is_draft IS NULL)
       GROUP BY m.id
       ORDER BY m.created_at DESC`,
    );
  }

  async listDrafts(academic_year?: string) {
    if (academic_year) {
      return this.dataSource.query(
        `SELECT * FROM memos WHERE is_active = true AND is_draft = true AND academic_year = $1 ORDER BY created_at DESC`,
        [academic_year],
      );
    }
    return this.dataSource.query(
      `SELECT * FROM memos WHERE is_active = true AND is_draft = true ORDER BY created_at DESC`,
    );
  }

  async getMemoStatus(memo_id: string, academic_year?: string) {
    const memos = await this.dataSource.query(`SELECT * FROM memos WHERE id = $1`, [memo_id]);
    if (!memos.length) return [];
    const memo = memos[0];
    const year = academic_year || memo.academic_year;

    let recipients: { teacher_id: string; teacher_name: string }[] = [];

    if (memo.target_type === 'all') {
      recipients = await this.dataSource.query(
        `SELECT id::text AS teacher_id, name AS teacher_name FROM users WHERE role = 'teacher' ORDER BY name`,
      );
    } else if (memo.target_type === 'stage') {
      const stage = memo.target_value;
      const stageGrades = STAGE_GRADES[stage] || [];
      if (stageGrades.length > 0 && year) {
        const assignments = await this.dataSource.query(
          `SELECT ta.teacher_id::text, u.name AS teacher_name, ta.assigned_classes
           FROM teacher_assignments ta
           JOIN users u ON u.id::text = ta.teacher_id::text
           WHERE ta.academic_year = $1
           ORDER BY u.name`,
          [year],
        );
        recipients = assignments.filter((a: any) => {
          const grades = String(a.assigned_classes || '').split(',').map((s: string) => s.trim()).filter(Boolean);
          return stageGrades.some(g => grades.includes(g));
        }).map((a: any) => ({ teacher_id: a.teacher_id, teacher_name: a.teacher_name }));
      }
    } else if (memo.target_type === 'teachers') {
      const ids = (memo.target_value || '').split(',').map((s: string) => s.trim()).filter(Boolean);
      if (ids.length > 0) {
        const placeholders = ids.map((_: any, i: number) => `$${i + 1}`).join(',');
        recipients = await this.dataSource.query(
          `SELECT id::text AS teacher_id, name AS teacher_name FROM users WHERE id::text IN (${placeholders}) ORDER BY name`,
          ids,
        );
      }
    }

    if (!recipients.length) return [];

    const reads = await this.dataSource.query(
      `SELECT teacher_id::text, read_at, reply FROM memo_reads WHERE memo_id = $1`,
      [memo_id],
    );
    const readMap = new Map(reads.map((r: any) => [r.teacher_id, { read_at: r.read_at, reply: r.reply }]));

    return recipients.map(r => ({
      teacher_id: r.teacher_id,
      teacher_name: r.teacher_name,
      sent_at: memo.created_at,
      is_read: readMap.has(r.teacher_id),
      read_at: (readMap.get(r.teacher_id) as any)?.read_at || null,
      reply: (readMap.get(r.teacher_id) as any)?.reply || null,
    }));
  }

  async getTeacherMemos(teacher_id: string, academic_year?: string) {
    let stage = '';
    if (academic_year) {
      const rows = await this.dataSource.query(
        `SELECT assigned_classes FROM teacher_assignments WHERE teacher_id = $1 AND academic_year = $2 LIMIT 1`,
        [teacher_id, academic_year],
      );
      if (rows.length > 0 && rows[0].assigned_classes) {
        const grades = String(rows[0].assigned_classes).split(',').map((s: string) => s.trim()).filter(Boolean);
        for (const s of STAGE_ORDER) {
          if (STAGE_GRADES[s].some(g => grades.includes(g))) { stage = s; break; }
        }
      }
    }

    const params: any[] = [teacher_id];
    let yearClause = '';
    if (academic_year) { params.push(academic_year); yearClause = `AND m.academic_year = $${params.length}`; }

    const memos = await this.dataSource.query(
      `SELECT m.*,
         r.read_at,
         r.reply,
         (r.id IS NOT NULL) AS is_read
       FROM memos m
       LEFT JOIN memo_reads r ON r.memo_id = m.id AND r.teacher_id::text = $1
       WHERE m.is_active = true AND (m.is_draft = false OR m.is_draft IS NULL) ${yearClause}
       ORDER BY m.created_at DESC`,
      params,
    );

    return memos.filter((m: any) => {
      if (m.target_type === 'all') return true;
      if (m.target_type === 'stage' && stage && m.target_value === stage) return true;
      if (m.target_type === 'teachers' && m.target_value) {
        return m.target_value.split(',').map((s: string) => s.trim()).includes(teacher_id);
      }
      return false;
    });
  }

  async markRead(memo_id: string, teacher_id: string, teacher_name?: string, reply?: string) {
    await this.dataSource.query(
      `INSERT INTO memo_reads (memo_id, teacher_id, teacher_name, reply)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (memo_id, teacher_id) DO UPDATE SET reply = EXCLUDED.reply, read_at = NOW()`,
      [memo_id, teacher_id, teacher_name || null, reply || null],
    );
    return { ok: true };
  }

  async getMemoReads(memo_id: string) {
    return this.dataSource.query(
      `SELECT * FROM memo_reads WHERE memo_id = $1 ORDER BY read_at DESC`,
      [memo_id],
    );
  }

  async deleteMemo(id: string) {
    await this.dataSource.query(`UPDATE memos SET is_active = false WHERE id = $1`, [id]);
    return { ok: true };
  }
}
