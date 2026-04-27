import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Section } from './entities/section.entity';

@Injectable()
export class SectionsService {
  constructor(
    @InjectRepository(Section)
    private sectionRepo: Repository<Section>,
    private dataSource: DataSource,
  ) {}

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private normalize(s: string): string {
    return (s || '').trim().toUpperCase();
  }

  // ---------------------------------------------------------------------------
  // Query
  // ---------------------------------------------------------------------------

  async findAll(grade?: string, academic_year?: string) {
    const qb = this.sectionRepo.createQueryBuilder('s')
      .where('s.is_active = true')
      .orderBy('s.grade', 'ASC')
      .addOrderBy('s.display_order', 'ASC')
      .addOrderBy('s.name', 'ASC');
    if (grade) qb.andWhere('s.grade = :grade', { grade });
    if (academic_year) qb.andWhere('s.academic_year = :academic_year', { academic_year });
    return qb.getMany();
  }

  /** Returns { grade -> section_name[] } map — used by frontend dropdowns. */
  async getAllMap(academic_year?: string) {
    const rows = await this.findAll(undefined, academic_year);
    const map: Record<string, string[]> = {};
    for (const r of rows) {
      if (!map[r.grade]) map[r.grade] = [];
      map[r.grade].push(r.name);
    }
    return map;
  }

  async findOne(id: string) {
    return this.sectionRepo.findOne({ where: { id } });
  }

  /**
   * Validates that a (grade, section, academic_year) combo exists and is active.
   * Returns true without checking if the sections table has never been seeded
   * (total count = 0), so existing deployments aren't broken before the first seed.
   */
  async validate(grade: string, section: string, academic_year: string): Promise<boolean> {
    if (!grade || !section) return true;
    const totalCount = await this.sectionRepo.count();
    if (totalCount === 0) return true; // table not seeded yet — allow all
    const name = this.normalize(section);
    const count = await this.sectionRepo.count({
      where: { grade, name, academic_year, is_active: true },
    });
    return count > 0;
  }

  // ---------------------------------------------------------------------------
  // Create
  // ---------------------------------------------------------------------------

  async create(grade: string, name: string, academic_year: string) {
    const normalized = this.normalize(name);
    if (!grade || !normalized) throw new BadRequestException('grade and name are required');
    const existing = await this.sectionRepo.findOne({ where: { grade, name: normalized, academic_year } });
    if (existing) {
      if (existing.is_active) throw new ConflictException(`Section ${normalized} already exists in ${grade}`);
      // Re-activate a previously deactivated section
      await this.sectionRepo.update(existing.id, { is_active: true });
      return { ...existing, is_active: true };
    }
    const sec = this.sectionRepo.create({ grade, name: normalized, academic_year, is_active: true });
    return this.sectionRepo.save(sec);
  }

  // ---------------------------------------------------------------------------
  // Seed from students table (one-time migration)
  // ---------------------------------------------------------------------------

  async seed(academic_year: string) {
    const rows: { grade: string; section: string }[] = await this.dataSource.query(
      `SELECT DISTINCT current_class as grade, section FROM students WHERE is_active = true AND current_class IS NOT NULL AND section IS NOT NULL`,
    );
    let created = 0;
    let skipped = 0;
    for (const row of rows) {
      if (!row.grade || !row.section) continue;
      const name = this.normalize(row.section);
      const existing = await this.sectionRepo.findOne({ where: { grade: row.grade, name, academic_year } });
      if (!existing) {
        await this.sectionRepo.save(this.sectionRepo.create({ grade: row.grade, name, academic_year, is_active: true }));
        created++;
      } else {
        skipped++;
      }
    }
    return { created, skipped, total: rows.length };
  }

  // ---------------------------------------------------------------------------
  // Rename (cascades to ALL tables in a single transaction)
  // ---------------------------------------------------------------------------

  async rename(id: string, newName: string) {
    const sec = await this.sectionRepo.findOne({ where: { id } });
    if (!sec) throw new BadRequestException('Section not found');
    const normalized = this.normalize(newName);
    if (!normalized) throw new BadRequestException('New name is required');
    if (normalized === sec.name) return { message: 'No change', section: sec, updated: {} };

    // Check for conflict
    const conflict = await this.sectionRepo.findOne({
      where: { grade: sec.grade, name: normalized, academic_year: sec.academic_year },
    });
    if (conflict && conflict.id !== id) throw new ConflictException(`Section ${normalized} already exists in ${sec.grade}`);

    const oldName = sec.name;
    const grade = sec.grade;

    const updated: Record<string, number> = {};

    await this.dataSource.transaction(async (em) => {
      // 1. Update section record itself
      await em.update(Section, { id }, { name: normalized });

      // Helper: run raw UPDATE and capture affected rows
      const run = async (sql: string, params: any[]): Promise<number> => {
        const result = await em.query(sql, params);
        return Array.isArray(result) ? result[1] ?? 0 : result.affected ?? 0;
      };

      // 2. students
      updated.students = await run(
        `UPDATE students SET section = $1 WHERE section = $2 AND current_class = $3`,
        [normalized, oldName, grade],
      );

      // 3. users.assigned_section (legacy single field)
      updated.users_assigned_section = await run(
        `UPDATE users SET assigned_section = $1 WHERE assigned_section = $2`,
        [normalized, oldName],
      );

      // 4. users.assigned_sections (simple-array — stored as comma-separated)
      const usersToFix: { id: string; assigned_sections: string }[] = await em.query(
        `SELECT id, assigned_sections FROM users WHERE assigned_sections LIKE $1`,
        [`%${oldName}%`],
      );
      let usersSectionsFixed = 0;
      for (const u of usersToFix) {
        const parts = (u.assigned_sections || '').split(',').map((s: string) => {
          const t = s.trim();
          return t.toUpperCase() === oldName ? normalized : t;
        });
        await em.query(`UPDATE users SET assigned_sections = $1 WHERE id = $2`, [parts.join(','), u.id]);
        usersSectionsFixed++;
      }
      updated.users_assigned_sections = usersSectionsFixed;

      // 5. users.class_teacher_of (free-text e.g. "Grade 5 ASTEROID")
      const ctUsers: { id: string; class_teacher_of: string }[] = await em.query(
        `SELECT id, class_teacher_of FROM users WHERE UPPER(class_teacher_of) LIKE $1`,
        [`%${oldName}%`],
      );
      let ctFixed = 0;
      for (const u of ctUsers) {
        const fixed = u.class_teacher_of.replace(new RegExp(`\\b${oldName}\\b`, 'gi'), normalized);
        await em.query(`UPDATE users SET class_teacher_of = $1 WHERE id = $2`, [fixed, u.id]);
        ctFixed++;
      }
      updated.users_class_teacher_of = ctFixed;

      // 6. teacher_mappings
      updated.teacher_mappings = await run(
        `UPDATE teacher_mappings SET section = $1 WHERE section = $2 AND grade = $3`,
        [normalized, oldName, grade],
      );

      // 7. teacher_appraisals
      updated.teacher_appraisals = await run(
        `UPDATE teacher_appraisals SET section = $1 WHERE UPPER(section) = $2 AND grade = $3`,
        [normalized, oldName, grade],
      );

      // 8. baseline_assessments
      updated.baseline_assessments = await run(
        `UPDATE baseline_assessments SET section = $1 WHERE UPPER(section) = $2 AND grade = $3`,
        [normalized, oldName, grade],
      );

      // 9. baseline_configs_v2 (raw SQL table)
      try {
        updated.baseline_configs_v2 = await run(
          `UPDATE baseline_configs_v2 SET section = $1 WHERE UPPER(section) = $2 AND grade = $3`,
          [normalized, oldName, grade],
        );
      } catch {
        updated.baseline_configs_v2 = 0;
      }

      // 10. exam_configs
      updated.exam_configs = await run(
        `UPDATE exam_configs SET section = $1 WHERE UPPER(section) = $2 AND grade = $3`,
        [normalized, oldName, grade],
      );

      // 11. exam_marks
      updated.exam_marks = await run(
        `UPDATE exam_marks SET section = $1 WHERE UPPER(section) = $2 AND grade = $3`,
        [normalized, oldName, grade],
      );

      // 12. activities (section stored as plain string, may contain comma-separated values)
      updated.activities = await run(
        `UPDATE activities SET section = $1 WHERE UPPER(section) = $2 AND grade = $3`,
        [normalized, oldName, grade],
      );

      // 13. activity_assessments
      updated.activity_assessments = await run(
        `UPDATE activity_assessments SET section = $1 WHERE UPPER(section) = $2 AND grade = $3`,
        [normalized, oldName, grade],
      );

      // 14. student_competency_scores
      updated.student_competency_scores = await run(
        `UPDATE student_competency_scores SET section = $1 WHERE UPPER(section) = $2 AND grade = $3`,
        [normalized, oldName, grade],
      );

      // 15. ai_homework_records
      updated.ai_homework_records = await run(
        `UPDATE ai_homework_records SET section = $1 WHERE UPPER(section) = $2 AND grade = $3`,
        [normalized, oldName, grade],
      );

      // 16. teacher_observations (section_observed added in Phase 8)
      try {
        updated.teacher_observations = await run(
          `UPDATE teacher_observations SET section_observed = $1 WHERE UPPER(section_observed) = $2 AND grade_observed = $3`,
          [normalized, oldName, grade],
        );
      } catch { updated.teacher_observations = 0; }
    });

    return {
      message: `Renamed ${oldName} → ${normalized} in ${grade}`,
      old_name: oldName,
      new_name: normalized,
      grade,
      updated,
    };
  }

  // ---------------------------------------------------------------------------
  // Deactivate / reactivate
  // ---------------------------------------------------------------------------

  async deactivate(id: string) {
    const sec = await this.sectionRepo.findOne({ where: { id } });
    if (!sec) throw new BadRequestException('Section not found');

    // Block if active students exist
    const count: { count: string }[] = await this.dataSource.query(
      `SELECT COUNT(*) as count FROM students WHERE current_class = $1 AND UPPER(section) = $2 AND is_active = true`,
      [sec.grade, sec.name],
    );
    const n = parseInt(count[0]?.count ?? '0', 10);
    if (n > 0) throw new BadRequestException(`Cannot deactivate — ${n} active students in ${sec.grade} ${sec.name}`);

    await this.sectionRepo.update(id, { is_active: false });
    return { message: `Section ${sec.name} deactivated`, id };
  }

  async reactivate(id: string) {
    await this.sectionRepo.update(id, { is_active: true });
    return { message: 'Section reactivated', id };
  }

  // ---------------------------------------------------------------------------
  // Delete (hard — only if no records anywhere)
  // ---------------------------------------------------------------------------

  async remove(id: string) {
    const sec = await this.sectionRepo.findOne({ where: { id } });
    if (!sec) throw new BadRequestException('Section not found');

    // Check across all modules
    const safeQuery = async (sql: string, params: any[]) => {
      try { return await this.dataSource.query(sql, params); }
      catch { return [{ c: '0' }]; }
    };
    const checks = await Promise.all([
      safeQuery(`SELECT COUNT(*) as c FROM students WHERE current_class=$1 AND UPPER(section)=$2`, [sec.grade, sec.name]),
      safeQuery(`SELECT COUNT(*) as c FROM baseline_assessments WHERE grade=$1 AND UPPER(section)=$2`, [sec.grade, sec.name]),
      safeQuery(`SELECT COUNT(*) as c FROM exam_configs WHERE grade=$1 AND UPPER(section)=$2`, [sec.grade, sec.name]),
      safeQuery(`SELECT COUNT(*) as c FROM exam_marks WHERE grade=$1 AND UPPER(section)=$2`, [sec.grade, sec.name]),
      safeQuery(`SELECT COUNT(*) as c FROM activities WHERE grade=$1 AND UPPER(section)=$2`, [sec.grade, sec.name]),
      safeQuery(`SELECT COUNT(*) as c FROM teacher_mappings WHERE grade=$1 AND section=$2`, [sec.grade, sec.name]),
      safeQuery(`SELECT COUNT(*) as c FROM teacher_appraisals WHERE grade=$1 AND UPPER(section)=$2`, [sec.grade, sec.name]),
      safeQuery(`SELECT COUNT(*) as c FROM ai_homework_records WHERE grade=$1 AND UPPER(section)=$2`, [sec.grade, sec.name]),
      safeQuery(`SELECT COUNT(*) as c FROM teacher_observations WHERE grade_observed=$1 AND UPPER(section_observed)=$2`, [sec.grade, sec.name]),
    ]);
    const total = checks.reduce((sum, r) => sum + parseInt(r[0]?.c ?? '0', 10), 0);
    if (total > 0) throw new BadRequestException(`Cannot delete — ${total} record(s) still reference ${sec.name}`);

    await this.sectionRepo.delete(id);
    return { message: `Section ${sec.name} deleted`, id };
  }

  // ---------------------------------------------------------------------------
  // Get student count per section (for admin UI)
  // ---------------------------------------------------------------------------

  async getStudentCounts(academic_year: string) {
    const sections = await this.findAll(undefined, academic_year);
    const result: any[] = [];
    for (const sec of sections) {
      const rows: { count: string }[] = await this.dataSource.query(
        `SELECT COUNT(*) as count FROM students WHERE current_class = $1 AND UPPER(section) = $2 AND is_active = true`,
        [sec.grade, sec.name],
      );
      result.push({ ...sec, student_count: parseInt(rows[0]?.count ?? '0', 10) });
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // Normalize all section strings in all tables to uppercase (one-time utility)
  // ---------------------------------------------------------------------------

  async normalizeAll() {
    const tables = [
      { table: 'students', col: 'section' },
      { table: 'teacher_mappings', col: 'section' },
      { table: 'teacher_appraisals', col: 'section' },
      { table: 'baseline_assessments', col: 'section' },
      { table: 'exam_configs', col: 'section' },
      { table: 'exam_marks', col: 'section' },
      { table: 'activities', col: 'section' },
      { table: 'activity_assessments', col: 'section' },
      { table: 'student_competency_scores', col: 'section' },
      { table: 'ai_homework_records', col: 'section' },
      { table: 'teacher_observations', col: 'section_observed' },
    ];
    const result: Record<string, number> = {};
    for (const { table, col } of tables) {
      try {
        const r = await this.dataSource.query(
          `UPDATE ${table} SET ${col} = UPPER(${col}) WHERE ${col} != UPPER(${col}) AND ${col} IS NOT NULL`,
        );
        result[table] = Array.isArray(r) ? r[1] ?? 0 : r.affected ?? 0;
      } catch {
        result[table] = -1;
      }
    }
    // users.assigned_section
    try {
      const r = await this.dataSource.query(
        `UPDATE users SET assigned_section = UPPER(assigned_section) WHERE assigned_section IS NOT NULL AND assigned_section != UPPER(assigned_section)`,
      );
      result['users_assigned_section'] = Array.isArray(r) ? r[1] ?? 0 : r.affected ?? 0;
    } catch { result['users_assigned_section'] = -1; }
    return result;
  }
}
