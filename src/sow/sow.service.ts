import { Injectable, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class SowService implements OnModuleInit {
  constructor(private dataSource: DataSource) {}

  async onModuleInit() {
    // ── Curriculum library (admin-managed, grade+subject level) ───────────────
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS curriculum_blocks (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        academic_year VARCHAR(10)   NOT NULL,
        grade         VARCHAR(50)   NOT NULL,
        subject       VARCHAR(255)  NOT NULL,
        track         VARCHAR(10)   NOT NULL,
        item_type     VARCHAR(20)   NOT NULL DEFAULT 'block',
        block_number  INTEGER       NOT NULL,
        block_name    VARCHAR(500)  NOT NULL DEFAULT '',
        created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE (academic_year, grade, subject, block_number)
      )
    `);
    await this.dataSource.query(`ALTER TABLE curriculum_blocks ADD COLUMN IF NOT EXISTS item_type VARCHAR(20) NOT NULL DEFAULT 'block'`);
    await this.dataSource.query(`CREATE INDEX IF NOT EXISTS idx_curr_blocks_grade ON curriculum_blocks(academic_year, grade, subject)`);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS curriculum_lps (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        block_id   UUID         NOT NULL REFERENCES curriculum_blocks(id) ON DELETE CASCADE,
        item_type  VARCHAR(20)  NOT NULL DEFAULT 'lp',
        lp_number  INTEGER      NOT NULL,
        lp_name    VARCHAR(500) NOT NULL DEFAULT '',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE (block_id, lp_number)
      )
    `);
    await this.dataSource.query(`ALTER TABLE curriculum_lps ADD COLUMN IF NOT EXISTS item_type VARCHAR(20) NOT NULL DEFAULT 'lp'`);
    await this.dataSource.query(`CREATE INDEX IF NOT EXISTS idx_curr_lps_block ON curriculum_lps(block_id)`);

    // ── Teacher day-by-day schedule ────────────────────────────────────────────
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS sow_schedule (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        academic_year VARCHAR(10)   NOT NULL,
        teacher_id    VARCHAR       NOT NULL,
        grade         VARCHAR(50)   NOT NULL,
        section       VARCHAR(50)   NOT NULL,
        subject       VARCHAR(255)  NOT NULL,
        entry_date    DATE          NOT NULL,
        entry_type    VARCHAR(50)   NOT NULL DEFAULT 'lp',
        block_number  INTEGER,
        lp_number     INTEGER,
        notes         TEXT,
        done          BOOLEAN       NOT NULL DEFAULT false,
        created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE (teacher_id, academic_year, grade, section, subject, entry_date)
      )
    `);
    await this.dataSource.query(`CREATE INDEX IF NOT EXISTS idx_sow_sch_teacher ON sow_schedule(teacher_id, academic_year)`);
    await this.dataSource.query(`CREATE INDEX IF NOT EXISTS idx_sow_sch_date    ON sow_schedule(entry_date)`);

    // ── Submission/approval status ─────────────────────────────────────────────
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS sow_status (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        academic_year VARCHAR(10)  NOT NULL,
        teacher_id    VARCHAR      NOT NULL,
        grade         VARCHAR(50)  NOT NULL,
        section       VARCHAR(50)  NOT NULL,
        subject       VARCHAR(255) NOT NULL,
        status        VARCHAR(20)  NOT NULL DEFAULT 'draft',
        reviewed_by   VARCHAR,
        reviewed_at   TIMESTAMP WITH TIME ZONE,
        submitted_at  TIMESTAMP WITH TIME ZONE,
        created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE (teacher_id, academic_year, grade, section, subject)
      )
    `);
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private getTrack(grade: string): 'exceed' | 'ncert' {
    const n = parseInt(grade.replace(/\D/g, ''));
    return n >= 8 ? 'ncert' : 'exceed';
  }

  // ── Curriculum: auto-init Exceed 24×4 skeleton ────────────────────────────

  private async initExceedCurriculum(academic_year: string, grade: string, subject: string) {
    const existing = await this.dataSource.query(
      `SELECT COUNT(*) FROM curriculum_blocks WHERE academic_year=$1 AND grade=$2 AND subject=$3`,
      [academic_year, grade, subject],
    );
    if (parseInt(existing[0].count) >= 24) return;
    for (let b = 1; b <= 24; b++) {
      const rows = await this.dataSource.query(
        `INSERT INTO curriculum_blocks (academic_year, grade, subject, track, item_type, block_number)
         VALUES ($1,$2,$3,'exceed','block',$4)
         ON CONFLICT (academic_year, grade, subject, block_number) DO NOTHING RETURNING id`,
        [academic_year, grade, subject, b],
      );
      if (rows.length > 0) {
        for (let lp = 1; lp <= 4; lp++) {
          await this.dataSource.query(
            `INSERT INTO curriculum_lps (block_id, item_type, lp_number) VALUES ($1,'lp',$2)
             ON CONFLICT (block_id, lp_number) DO NOTHING`,
            [rows[0].id, lp],
          );
        }
      }
    }
  }

  // ── Curriculum: get ───────────────────────────────────────────────────────

  async getCurriculum(academic_year: string, grade: string, subject: string) {
    const track = this.getTrack(grade);
    if (track === 'exceed') await this.initExceedCurriculum(academic_year, grade, subject);

    const blocks = await this.dataSource.query(
      `SELECT * FROM curriculum_blocks WHERE academic_year=$1 AND grade=$2 AND subject=$3 ORDER BY block_number`,
      [academic_year, grade, subject],
    );
    const blockIds = blocks.map((b: any) => b.id);
    let lps: any[] = [];
    if (blockIds.length > 0) {
      lps = await this.dataSource.query(
        `SELECT * FROM curriculum_lps WHERE block_id = ANY($1) ORDER BY block_id, lp_number`,
        [blockIds],
      );
    }
    const lpsByBlock = new Map<string, any[]>();
    for (const lp of lps) {
      if (!lpsByBlock.has(lp.block_id)) lpsByBlock.set(lp.block_id, []);
      lpsByBlock.get(lp.block_id)!.push(lp);
    }
    return { track, blocks: blocks.map((b: any) => ({ ...b, lps: lpsByBlock.get(b.id) ?? [] })) };
  }

  // ── Curriculum: save names ─────────────────────────────────────────────────

  async saveCurriculumBlock(id: string, block_name: string) {
    await this.dataSource.query(`UPDATE curriculum_blocks SET block_name=$1, updated_at=NOW() WHERE id=$2`, [block_name, id]);
    return { ok: true };
  }

  async saveCurriculumLp(id: string, lp_name: string) {
    await this.dataSource.query(`UPDATE curriculum_lps SET lp_name=$1, updated_at=NOW() WHERE id=$2`, [lp_name, id]);
    return { ok: true };
  }

  // ── Curriculum: add / delete for NCERT ────────────────────────────────────

  async addCurriculumBlock(academic_year: string, grade: string, subject: string, item_type = 'chapter') {
    const res = await this.dataSource.query(
      `SELECT COALESCE(MAX(block_number),0)+1 AS next FROM curriculum_blocks WHERE academic_year=$1 AND grade=$2 AND subject=$3`,
      [academic_year, grade, subject],
    );
    const rows = await this.dataSource.query(
      `INSERT INTO curriculum_blocks (academic_year, grade, subject, track, item_type, block_number)
       VALUES ($1,$2,$3,'ncert',$4,$5) RETURNING *`,
      [academic_year, grade, subject, item_type, res[0].next],
    );
    return { ...rows[0], lps: [] };
  }

  async deleteCurriculumBlock(id: string) {
    await this.dataSource.query(`DELETE FROM curriculum_blocks WHERE id=$1`, [id]);
    return { ok: true };
  }

  async addCurriculumLp(block_id: string, item_type = 'lp') {
    const res = await this.dataSource.query(
      `SELECT COALESCE(MAX(lp_number),0)+1 AS next FROM curriculum_lps WHERE block_id=$1`, [block_id],
    );
    const rows = await this.dataSource.query(
      `INSERT INTO curriculum_lps (block_id, item_type, lp_number) VALUES ($1,$2,$3) RETURNING *`,
      [block_id, item_type, res[0].next],
    );
    return rows[0];
  }

  async deleteCurriculumLp(id: string) {
    await this.dataSource.query(`DELETE FROM curriculum_lps WHERE id=$1`, [id]);
    return { ok: true };
  }

  // ── Curriculum: CSV bulk import ────────────────────────────────────────────

  async importCurriculum(
    academic_year: string,
    rows: Array<{ grade: string; subject: string; type: string; number: number; name: string; parent: string }>,
  ) {
    const topLevel = rows.filter(r => !r.parent || r.parent === '');
    const subLevel = rows.filter(r => r.parent && r.parent !== '');

    // Map: "grade:subject:number" → block_id
    const blockIdMap = new Map<string, string>();

    for (const row of topLevel) {
      const track = this.getTrack(row.grade);
      const result = await this.dataSource.query(
        `INSERT INTO curriculum_blocks (academic_year, grade, subject, track, item_type, block_number, block_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (academic_year, grade, subject, block_number)
         DO UPDATE SET block_name=$7, item_type=$5, updated_at=NOW()
         RETURNING id`,
        [academic_year, row.grade, row.subject, track, row.type.toLowerCase(), Number(row.number), row.name],
      );
      blockIdMap.set(`${row.grade}:${row.subject}:${row.number}`, result[0].id);
    }

    let count = topLevel.length;
    for (const row of subLevel) {
      const parentKey = `${row.grade}:${row.subject}:${row.parent}`;
      const blockId = blockIdMap.get(parentKey);
      if (!blockId) continue;
      await this.dataSource.query(
        `INSERT INTO curriculum_lps (block_id, item_type, lp_number, lp_name)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (block_id, lp_number)
         DO UPDATE SET lp_name=$4, item_type=$2, updated_at=NOW()`,
        [blockId, row.type.toLowerCase(), Number(row.number), row.name],
      );
      count++;
    }
    return { ok: true, count };
  }

  // ── Schedule ───────────────────────────────────────────────────────────────

  async getSchedule(teacher_id: string, academic_year: string, grade: string, section: string, subject: string, month: string) {
    return this.dataSource.query(
      `SELECT * FROM sow_schedule
       WHERE teacher_id=$1 AND academic_year=$2 AND grade=$3 AND section=$4 AND subject=$5
         AND to_char(entry_date,'YYYY-MM')=$6
       ORDER BY entry_date`,
      [teacher_id, academic_year, grade, section, subject, month],
    );
  }

  async saveScheduleEntry(data: {
    teacher_id: string; academic_year: string; grade: string; section: string; subject: string;
    entry_date: string; entry_type: string; block_number?: number; lp_number?: number; notes?: string; done?: boolean;
  }) {
    const rows = await this.dataSource.query(
      `INSERT INTO sow_schedule
         (teacher_id, academic_year, grade, section, subject, entry_date, entry_type, block_number, lp_number, notes, done)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (teacher_id, academic_year, grade, section, subject, entry_date)
       DO UPDATE SET entry_type=$7, block_number=$8, lp_number=$9, notes=$10, done=$11, updated_at=NOW()
       RETURNING *`,
      [data.teacher_id, data.academic_year, data.grade, data.section, data.subject,
       data.entry_date, data.entry_type, data.block_number ?? null, data.lp_number ?? null,
       data.notes ?? null, data.done ?? false],
    );
    return rows[0];
  }

  async deleteScheduleEntry(id: string) {
    await this.dataSource.query(`DELETE FROM sow_schedule WHERE id=$1`, [id]);
    return { ok: true };
  }

  async toggleDone(id: string, done: boolean) {
    await this.dataSource.query(`UPDATE sow_schedule SET done=$1, updated_at=NOW() WHERE id=$2`, [done, id]);
    return { ok: true };
  }

  // ── Submit & Review ────────────────────────────────────────────────────────

  async submitSOW(teacher_id: string, academic_year: string, grade: string, section: string, subject: string) {
    await this.dataSource.query(
      `INSERT INTO sow_status (teacher_id, academic_year, grade, section, subject, status, submitted_at)
       VALUES ($1,$2,$3,$4,$5,'submitted',NOW())
       ON CONFLICT (teacher_id, academic_year, grade, section, subject)
       DO UPDATE SET status='submitted', submitted_at=NOW(), updated_at=NOW()`,
      [teacher_id, academic_year, grade, section, subject],
    );
    return { ok: true };
  }

  async reviewSOW(statusId: string, status: string, reviewed_by: string) {
    await this.dataSource.query(
      `UPDATE sow_status SET status=$1, reviewed_by=$2, reviewed_at=NOW(), updated_at=NOW() WHERE id=$3`,
      [status, reviewed_by, statusId],
    );
    return { ok: true };
  }

  async getStatus(teacher_id: string, academic_year: string, grade: string, section: string, subject: string) {
    const rows = await this.dataSource.query(
      `SELECT * FROM sow_status WHERE teacher_id=$1 AND academic_year=$2 AND grade=$3 AND section=$4 AND subject=$5`,
      [teacher_id, academic_year, grade, section, subject],
    );
    return rows[0] ?? null;
  }

  // ── Admin overview ─────────────────────────────────────────────────────────

  async getAllSOW(academic_year: string) {
    return this.dataSource.query(
      `SELECT
         sch.teacher_id, sch.grade, sch.section, sch.subject,
         COUNT(sch.id)::int                             AS total_entries,
         COUNT(CASE WHEN sch.done THEN 1 END)::int      AS done_entries,
         MAX(sch.updated_at)                            AS last_updated,
         ss.id AS status_id, ss.status, ss.submitted_at, ss.reviewed_at, ss.reviewed_by,
         u.name AS teacher_name
       FROM sow_schedule sch
       LEFT JOIN sow_status ss
         ON ss.teacher_id=sch.teacher_id AND ss.academic_year=sch.academic_year
            AND ss.grade=sch.grade AND ss.section=sch.section AND ss.subject=sch.subject
       LEFT JOIN users u ON u.id::text = sch.teacher_id
       WHERE sch.academic_year=$1
       GROUP BY sch.teacher_id, sch.grade, sch.section, sch.subject,
                ss.id, ss.status, ss.submitted_at, ss.reviewed_at, ss.reviewed_by, u.name
       ORDER BY u.name, sch.grade, sch.subject`,
      [academic_year],
    );
  }

  async getTeacherSchedule(teacher_id: string, academic_year: string, grade: string, section: string, subject: string) {
    const [schedule, curriculum, statusRow] = await Promise.all([
      this.dataSource.query(
        `SELECT * FROM sow_schedule WHERE teacher_id=$1 AND academic_year=$2 AND grade=$3 AND section=$4 AND subject=$5 ORDER BY entry_date`,
        [teacher_id, academic_year, grade, section, subject],
      ),
      this.getCurriculum(academic_year, grade, subject),
      this.getStatus(teacher_id, academic_year, grade, section, subject),
    ]);
    return { schedule, curriculum, status: statusRow };
  }
}
