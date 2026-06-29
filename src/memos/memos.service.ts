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
  }

  async createMemo(data: { title: string; content: string; target_type: string; target_value?: string; created_by?: string; academic_year?: string }) {
    const rows = await this.dataSource.query(
      `INSERT INTO memos (title, content, target_type, target_value, created_by, academic_year)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [data.title, data.content, data.target_type, data.target_value || null, data.created_by || null, data.academic_year || null],
    );
    return rows[0];
  }

  async listMemos(academic_year?: string) {
    if (academic_year) {
      return this.dataSource.query(
        `SELECT m.*, COUNT(r.id)::int AS read_count
         FROM memos m
         LEFT JOIN memo_reads r ON r.memo_id = m.id
         WHERE m.is_active = true AND m.academic_year = $1
         GROUP BY m.id
         ORDER BY m.created_at DESC`,
        [academic_year],
      );
    }
    return this.dataSource.query(
      `SELECT m.*, COUNT(r.id)::int AS read_count
       FROM memos m
       LEFT JOIN memo_reads r ON r.memo_id = m.id
       WHERE m.is_active = true
       GROUP BY m.id
       ORDER BY m.created_at DESC`,
    );
  }

  async getTeacherMemos(teacher_id: string, academic_year?: string) {
    // Derive teacher's stage from assignments
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
         EXISTS(SELECT 1 FROM memo_reads r WHERE r.memo_id = m.id AND r.teacher_id = $1) AS is_read
       FROM memos m
       WHERE m.is_active = true ${yearClause}
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

  async markRead(memo_id: string, teacher_id: string, teacher_name?: string) {
    await this.dataSource.query(
      `INSERT INTO memo_reads (memo_id, teacher_id, teacher_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (memo_id, teacher_id) DO NOTHING`,
      [memo_id, teacher_id, teacher_name || null],
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
