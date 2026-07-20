import { Injectable, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class SowService implements OnModuleInit {
  constructor(private dataSource: DataSource) {}

  async onModuleInit() {
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS sow_blocks (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        academic_year VARCHAR(10)   NOT NULL,
        teacher_id    VARCHAR       NOT NULL,
        grade         VARCHAR(50)   NOT NULL,
        section       VARCHAR(50)   NOT NULL,
        subject       VARCHAR(255)  NOT NULL,
        track         VARCHAR(10)   NOT NULL,
        block_number  INTEGER       NOT NULL,
        block_name    VARCHAR(500)  NOT NULL DEFAULT '',
        ahm_comment   TEXT,
        created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE (teacher_id, academic_year, grade, section, subject, block_number)
      )
    `);
    await this.dataSource.query(`CREATE INDEX IF NOT EXISTS idx_sow_blocks_teacher ON sow_blocks(teacher_id, academic_year)`);
    await this.dataSource.query(`CREATE INDEX IF NOT EXISTS idx_sow_blocks_grade   ON sow_blocks(grade, section, academic_year)`);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS sow_lps (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        block_id    UUID         NOT NULL REFERENCES sow_blocks(id) ON DELETE CASCADE,
        lp_number   INTEGER      NOT NULL,
        lp_name     VARCHAR(500) NOT NULL DEFAULT '',
        created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE (block_id, lp_number)
      )
    `);
    await this.dataSource.query(`CREATE INDEX IF NOT EXISTS idx_sow_lps_block ON sow_lps(block_id)`);

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

  // ── Get SOW (auto-initialise Exceed blocks on first load) ──────────────────

  async getSOW(teacher_id: string, academic_year: string, grade: string, section: string, subject: string) {
    const track = this.getTrack(grade);

    if (track === 'exceed') {
      await this.initExceedBlocks(teacher_id, academic_year, grade, section, subject);
    }

    const blocks = await this.dataSource.query(
      `SELECT * FROM sow_blocks
       WHERE teacher_id=$1 AND academic_year=$2 AND grade=$3 AND section=$4 AND subject=$5
       ORDER BY block_number ASC`,
      [teacher_id, academic_year, grade, section, subject],
    );

    const blockIds = blocks.map((b: any) => b.id);
    let lps: any[] = [];
    if (blockIds.length > 0) {
      lps = await this.dataSource.query(
        `SELECT * FROM sow_lps WHERE block_id = ANY($1) ORDER BY block_id, lp_number ASC`,
        [blockIds],
      );
    }

    const lpsByBlock = new Map<string, any[]>();
    for (const lp of lps) {
      if (!lpsByBlock.has(lp.block_id)) lpsByBlock.set(lp.block_id, []);
      lpsByBlock.get(lp.block_id)!.push(lp);
    }

    const blocksWithLps = blocks.map((b: any) => ({ ...b, lps: lpsByBlock.get(b.id) ?? [] }));

    const statusRows = await this.dataSource.query(
      `SELECT * FROM sow_status WHERE teacher_id=$1 AND academic_year=$2 AND grade=$3 AND section=$4 AND subject=$5`,
      [teacher_id, academic_year, grade, section, subject],
    );

    return { track, blocks: blocksWithLps, status: statusRows[0] ?? null };
  }

  private getTrack(grade: string): 'exceed' | 'ncert' {
    const num = parseInt(grade.replace(/\D/g, ''));
    return num >= 8 ? 'ncert' : 'exceed';
  }

  private async initExceedBlocks(teacher_id: string, academic_year: string, grade: string, section: string, subject: string) {
    const existing = await this.dataSource.query(
      `SELECT COUNT(*) FROM sow_blocks WHERE teacher_id=$1 AND academic_year=$2 AND grade=$3 AND section=$4 AND subject=$5`,
      [teacher_id, academic_year, grade, section, subject],
    );
    if (parseInt(existing[0].count) >= 24) return;

    for (let b = 1; b <= 24; b++) {
      const blockRows = await this.dataSource.query(
        `INSERT INTO sow_blocks (teacher_id, academic_year, grade, section, subject, track, block_number, block_name)
         VALUES ($1,$2,$3,$4,$5,'exceed',$6,'')
         ON CONFLICT (teacher_id, academic_year, grade, section, subject, block_number) DO NOTHING
         RETURNING id`,
        [teacher_id, academic_year, grade, section, subject, b],
      );
      if (blockRows.length > 0) {
        const blockId = blockRows[0].id;
        for (let lp = 1; lp <= 4; lp++) {
          await this.dataSource.query(
            `INSERT INTO sow_lps (block_id, lp_number, lp_name) VALUES ($1,$2,'')
             ON CONFLICT (block_id, lp_number) DO NOTHING`,
            [blockId, lp],
          );
        }
      }
    }
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  async saveBlock(id: string, block_name: string) {
    await this.dataSource.query(
      `UPDATE sow_blocks SET block_name=$1, updated_at=NOW() WHERE id=$2`,
      [block_name, id],
    );
    return { ok: true };
  }

  async saveLp(id: string, lp_name: string) {
    await this.dataSource.query(
      `UPDATE sow_lps SET lp_name=$1, updated_at=NOW() WHERE id=$2`,
      [lp_name, id],
    );
    return { ok: true };
  }

  // ── NCERT: add / delete blocks and LPs ────────────────────────────────────

  async addBlock(teacher_id: string, academic_year: string, grade: string, section: string, subject: string) {
    const res = await this.dataSource.query(
      `SELECT COALESCE(MAX(block_number), 0) + 1 AS next FROM sow_blocks
       WHERE teacher_id=$1 AND academic_year=$2 AND grade=$3 AND section=$4 AND subject=$5`,
      [teacher_id, academic_year, grade, section, subject],
    );
    const next = res[0].next;
    const rows = await this.dataSource.query(
      `INSERT INTO sow_blocks (teacher_id, academic_year, grade, section, subject, track, block_number, block_name)
       VALUES ($1,$2,$3,$4,$5,'ncert',$6,'') RETURNING *`,
      [teacher_id, academic_year, grade, section, subject, next],
    );
    const block = rows[0];
    const lp = await this.dataSource.query(
      `INSERT INTO sow_lps (block_id, lp_number, lp_name) VALUES ($1,1,'') RETURNING *`,
      [block.id],
    );
    return { ...block, lps: [lp[0]] };
  }

  async deleteBlock(id: string) {
    await this.dataSource.query(`DELETE FROM sow_blocks WHERE id=$1`, [id]);
    return { ok: true };
  }

  async addLp(block_id: string) {
    const res = await this.dataSource.query(
      `SELECT COALESCE(MAX(lp_number), 0) + 1 AS next FROM sow_lps WHERE block_id=$1`,
      [block_id],
    );
    const rows = await this.dataSource.query(
      `INSERT INTO sow_lps (block_id, lp_number, lp_name) VALUES ($1,$2,'') RETURNING *`,
      [block_id, res[0].next],
    );
    return rows[0];
  }

  async deleteLp(id: string) {
    await this.dataSource.query(`DELETE FROM sow_lps WHERE id=$1`, [id]);
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

  async reviewSOW(statusId: string, status: string, reviewed_by: string,
                  block_comments: { block_id: string; comment: string }[] = []) {
    await this.dataSource.query(
      `UPDATE sow_status SET status=$1, reviewed_by=$2, reviewed_at=NOW(), updated_at=NOW() WHERE id=$3`,
      [status, reviewed_by, statusId],
    );
    for (const bc of block_comments) {
      if (bc.comment !== undefined) {
        await this.dataSource.query(
          `UPDATE sow_blocks SET ahm_comment=$1, updated_at=NOW() WHERE id=$2`,
          [bc.comment || null, bc.block_id],
        );
      }
    }
    return { ok: true };
  }

  // ── Admin / AHM: all SOWs ─────────────────────────────────────────────────

  async getAllSOW(academic_year: string) {
    const rows = await this.dataSource.query(
      `SELECT
         b.teacher_id, b.grade, b.section, b.subject, b.track,
         COUNT(b.id)::int                       AS block_count,
         COUNT(CASE WHEN b.block_name <> '' THEN 1 END)::int AS filled_blocks,
         MAX(b.updated_at)                       AS last_updated,
         ss.id                                   AS status_id,
         ss.status,
         ss.submitted_at,
         ss.reviewed_at,
         ss.reviewed_by,
         u.name                                  AS teacher_name
       FROM sow_blocks b
       LEFT JOIN sow_status ss
         ON ss.teacher_id=b.teacher_id AND ss.academic_year=b.academic_year
            AND ss.grade=b.grade AND ss.section=b.section AND ss.subject=b.subject
       LEFT JOIN users u ON u.id::text = b.teacher_id
       WHERE b.academic_year=$1
       GROUP BY b.teacher_id, b.grade, b.section, b.subject, b.track,
                ss.id, ss.status, ss.submitted_at, ss.reviewed_at, ss.reviewed_by, u.name
       ORDER BY u.name ASC, b.grade ASC, b.subject ASC`,
      [academic_year],
    );
    return rows;
  }
}
