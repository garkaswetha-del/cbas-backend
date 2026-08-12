import { Injectable, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';

const GRADES = [
  'Pre-KG', 'LKG', 'UKG',
  'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5',
  'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10',
];

@Injectable()
export class GradeSubjectsService implements OnModuleInit {
  constructor(private dataSource: DataSource) {}

  async onModuleInit() {
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS grade_subjects (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        grade       VARCHAR(50)  NOT NULL,
        subject     VARCHAR(255) NOT NULL,
        sort_order  INTEGER      NOT NULL DEFAULT 0,
        created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE (grade, subject)
      )
    `);
    await this.dataSource.query(
      `CREATE INDEX IF NOT EXISTS idx_grade_subjects_grade ON grade_subjects(grade)`,
    );
  }

  async getAll(): Promise<Record<string, string[]>> {
    const rows = await this.dataSource.query(
      `SELECT grade, subject FROM grade_subjects ORDER BY grade, sort_order ASC, subject ASC`,
    );
    const result: Record<string, string[]> = {};
    for (const grade of GRADES) result[grade] = [];
    for (const row of rows) {
      if (!result[row.grade]) result[row.grade] = [];
      result[row.grade].push(row.subject);
    }
    return result;
  }

  async add(grade: string, subject: string): Promise<void> {
    const orderRes = await this.dataSource.query(
      `SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM grade_subjects WHERE grade = $1`,
      [grade],
    );
    const next = orderRes[0]?.next ?? 1;
    await this.dataSource.query(
      `INSERT INTO grade_subjects (grade, subject, sort_order) VALUES ($1, $2, $3) ON CONFLICT (grade, subject) DO NOTHING`,
      [grade, subject.trim(), next],
    );
  }

  async remove(id: string): Promise<void> {
    await this.dataSource.query(`DELETE FROM grade_subjects WHERE id = $1`, [id]);
  }

  async getWithIds(): Promise<any[]> {
    return this.dataSource.query(
      `SELECT id, grade, subject, sort_order FROM grade_subjects ORDER BY grade, sort_order ASC, subject ASC`,
    );
  }
}
