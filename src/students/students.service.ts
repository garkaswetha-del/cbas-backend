import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { Student } from './entities/student.entity/student.entity';
import { StudentEnrollment } from './entities/student-enrollment.entity';

@Injectable()
export class StudentsService implements OnModuleInit {
  constructor(
    @InjectRepository(Student)
    private studentRepo: Repository<Student>,
    @InjectRepository(StudentEnrollment)
    private enrollmentRepo: Repository<StudentEnrollment>,
  ) {}

  async onModuleInit() {
    // Existing column additions
    try { await this.studentRepo.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS caste VARCHAR`); } catch {}

    // Create student_enrollments table (the source of truth for per-year class/section)
    try {
      await this.studentRepo.query(`
        CREATE TABLE IF NOT EXISTS student_enrollments (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          student_id UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
          academic_year VARCHAR NOT NULL,
          class VARCHAR,
          section VARCHAR,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(student_id, academic_year)
        )
      `);
    } catch {}

    // Fix student_id column types to UUID and add FK constraints on loose tables
    // activity_assessments
    try { await this.studentRepo.query(`ALTER TABLE activity_assessments ALTER COLUMN student_id TYPE UUID USING student_id::UUID`); } catch {}
    try {
      await this.studentRepo.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_activity_assessments_student') THEN
            ALTER TABLE activity_assessments ADD CONSTRAINT fk_activity_assessments_student
              FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT;
          END IF;
        END $$
      `);
    } catch {}

    // student_competency_scores
    try { await this.studentRepo.query(`ALTER TABLE student_competency_scores ALTER COLUMN student_id TYPE UUID USING student_id::UUID`); } catch {}
    try {
      await this.studentRepo.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_student_competency_scores_student') THEN
            ALTER TABLE student_competency_scores ADD CONSTRAINT fk_student_competency_scores_student
              FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT;
          END IF;
        END $$
      `);
    } catch {}

    // exam_marks (nullable student_id)
    try { await this.studentRepo.query(`ALTER TABLE exam_marks ALTER COLUMN student_id TYPE UUID USING student_id::UUID`); } catch {}
    try {
      await this.studentRepo.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_exam_marks_student') THEN
            ALTER TABLE exam_marks ADD CONSTRAINT fk_exam_marks_student
              FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT;
          END IF;
        END $$
      `);
    } catch {}

    // homework_records (nullable student_id, only for parent suggestions)
    try { await this.studentRepo.query(`ALTER TABLE homework_records ALTER COLUMN student_id TYPE UUID USING student_id::UUID`); } catch {}
    try {
      await this.studentRepo.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_homework_records_student') THEN
            ALTER TABLE homework_records ADD CONSTRAINT fk_homework_records_student
              FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT;
          END IF;
        END $$
      `);
    } catch {}
  }

  // Get all students with optional filters
  async findAll(filters?: {
    grade?: string;
    section?: string;
    search?: string;
    include_inactive?: boolean;
    academic_year?: string;
  }) {
    const em = this.studentRepo.manager;

    if (filters?.academic_year) {
      // Historical view: join enrollments for the requested year
      const conditions = ['e.academic_year = $1'];
      const params: any[] = [filters.academic_year];
      let idx = 2;
      if (!filters.include_inactive) conditions.push('s.is_active = true');
      if (filters.grade) { conditions.push(`LOWER(e.class) = LOWER($${idx++})`); params.push(filters.grade); }
      if (filters.section) { conditions.push(`LOWER(e.section) = LOWER($${idx++})`); params.push(filters.section); }
      if (filters.search) { conditions.push(`s.name ILIKE $${idx++}`); params.push(`%${filters.search}%`); }
      return em.query(`
        SELECT s.*, e.class AS current_class, e.section AS section
        FROM students s
        JOIN student_enrollments e ON e.student_id = s.id
        WHERE ${conditions.join(' AND ')}
        ORDER BY e.class ASC, e.section ASC, s.name ASC
      `, params);
    }

    // Current state (no year filter — uses student.current_class cache)
    const query = this.studentRepo.createQueryBuilder('student');
    if (!filters?.include_inactive) query.where('student.is_active = :active', { active: true });
    if (filters?.grade) query.andWhere('LOWER(student.current_class) = LOWER(:grade)', { grade: filters.grade });
    if (filters?.section) query.andWhere('LOWER(student.section) = LOWER(:section)', { section: filters.section });
    if (filters?.search) query.andWhere('student.name ILIKE :search', { search: `%${filters.search}%` });
    return query.orderBy('student.current_class', 'ASC')
      .addOrderBy('student.section', 'ASC')
      .addOrderBy('student.name', 'ASC')
      .getMany();
  }

  // Get single student
  async findOne(id: string) {
    const student = await this.studentRepo.findOne({ where: { id } });
    if (!student) throw new NotFoundException('Student not found');
    return student;
  }

  // Create single student
  async create(data: Partial<Student>) {
    const student = this.studentRepo.create(data);
    return this.studentRepo.save(student);
  }

  async getParentAnalytics(filters?: { grade?: string; section?: string }) {
    const em = this.studentRepo.manager;
    const conditions: string[] = ['s.is_active = true'];
    const params: any[] = [];
    let idx = 1;
    if (filters?.grade) { conditions.push(`LOWER(s.current_class) = LOWER($${idx++})`); params.push(filters.grade); }
    if (filters?.section) { conditions.push(`UPPER(s.section) = UPPER($${idx++})`); params.push(filters.section); }
    const where = conditions.join(' AND ');

    const profiles: any[] = await em.query(`
      SELECT
        COALESCE(NULLIF(TRIM(s.father_qualification),''),'Not Specified') AS father_qualification,
        COALESCE(NULLIF(TRIM(s.mother_qualification),''),'Not Specified') AS mother_qualification,
        COALESCE(NULLIF(TRIM(s.father_working_status),''),'Not Specified') AS father_working_status,
        COALESCE(NULLIF(TRIM(s.mother_working_status),''),'Not Specified') AS mother_working_status,
        COUNT(s.id) AS student_count,
        ROUND(CAST(AVG(b.avg_baseline) AS numeric), 1) AS avg_baseline,
        ROUND(CAST(AVG(e.avg_exam) AS numeric), 1) AS avg_exam,
        ROUND(CAST(AVG(a.avg_activity) AS numeric), 1) AS avg_activity
      FROM students s
      LEFT JOIN (
        SELECT entity_id, AVG(overall_score) AS avg_baseline
        FROM baseline_assessments WHERE entity_type::text = 'student' GROUP BY entity_id
      ) b ON b.entity_id = s.id::text
      LEFT JOIN (
        SELECT student_id, AVG(percentage) AS avg_exam
        FROM exam_marks WHERE is_active = true GROUP BY student_id
      ) e ON e.student_id = s.id::text
      LEFT JOIN (
        SELECT student_id, AVG(percentage) AS avg_activity
        FROM activity_assessments WHERE is_active = true GROUP BY student_id
      ) a ON a.student_id = s.id::text
      WHERE ${where}
      GROUP BY 1,2,3,4
      ORDER BY student_count DESC
    `, params);

    const [summary]: any[] = await em.query(`
      SELECT
        COUNT(*) FILTER (WHERE father_qualification = 'Graduate' AND mother_qualification = 'Graduate') AS both_graduate,
        COUNT(*) FILTER (WHERE father_qualification = 'Graduate' AND (mother_qualification != 'Graduate' OR mother_qualification IS NULL OR TRIM(mother_qualification) = '')) AS only_father_graduate,
        COUNT(*) FILTER (WHERE mother_qualification = 'Graduate' AND (father_qualification != 'Graduate' OR father_qualification IS NULL OR TRIM(father_qualification) = '')) AS only_mother_graduate,
        COUNT(*) FILTER (WHERE (father_qualification IS NULL OR TRIM(father_qualification) = '' OR father_qualification = 'Non-Graduate') AND (mother_qualification IS NULL OR TRIM(mother_qualification) = '' OR mother_qualification = 'Non-Graduate')) AS neither_graduate,
        COUNT(*) FILTER (WHERE father_working_status = 'Working' AND mother_working_status = 'Working') AS both_working,
        COUNT(*) FILTER (WHERE (father_qualification IS NULL OR TRIM(father_qualification) = '') OR (mother_qualification IS NULL OR TRIM(mother_qualification) = '')) AS missing_data,
        COUNT(*) AS total
      FROM students s WHERE ${where}
    `, params);

    return { profiles, summary };
  }

  async bulkUpdateParentData(records: Array<{
    admission_no?: string;
    name?: string;
    grade?: string;
    father_qualification?: string;
    mother_qualification?: string;
    father_working_status?: string;
    mother_working_status?: string;
  }>) {
    let updated = 0, skipped = 0;
    const errors: string[] = [];
    for (const r of records) {
      try {
        let student: Student | null = null;
        if (r.admission_no?.trim()) {
          student = await this.studentRepo.findOne({ where: { admission_no: r.admission_no.trim(), is_active: true } });
        }
        if (!student && r.name?.trim() && r.grade?.trim()) {
          student = await this.studentRepo.findOne({ where: { name: r.name.trim(), current_class: r.grade.trim(), is_active: true } });
        }
        if (!student) { skipped++; errors.push(`Not found: ${r.admission_no || r.name || 'unknown'}`); continue; }
        const patch: Partial<Student> = {};
        if (r.father_qualification) patch.father_qualification = r.father_qualification;
        if (r.mother_qualification) patch.mother_qualification = r.mother_qualification;
        if (r.father_working_status) patch.father_working_status = r.father_working_status;
        if (r.mother_working_status) patch.mother_working_status = r.mother_working_status;
        await this.studentRepo.update(student.id, patch);
        updated++;
      } catch (e: any) {
        skipped++; errors.push(`Error ${r.admission_no || r.name}: ${e.message}`);
      }
    }
    return { updated, skipped, errors };
  }

  // Bulk import students — upsert: create new, update all fields on existing
  // Lookup priority: admission_no → name+section → name+current_class+section
  // If academic_year is provided, also upserts a student_enrollments row for that year
  async bulkImport(students: Partial<Student>[], academic_year?: string) {
    const results = { created: 0, updated: 0, errors: [] as string[] };
    const em = this.studentRepo.manager;

    for (const s of students) {
      try {
        let existing: Student | null = null;

        // 1. Match by admission_no (most reliable)
        if (s.admission_no?.trim()) {
          existing = await this.studentRepo.findOne({
            where: { admission_no: s.admission_no.trim(), is_active: true }
          });
        }

        // 2. Fall back to name + section
        if (!existing && s.name?.trim() && s.section?.trim()) {
          existing = await this.studentRepo.findOne({
            where: { name: s.name.trim(), section: s.section.trim(), is_active: true }
          });
        }

        // 3. Final fallback: name + current_class + section
        if (!existing && s.name?.trim()) {
          existing = await this.studentRepo.findOne({
            where: { name: s.name.trim(), current_class: s.current_class, section: s.section }
          });
        }

        let studentId: string;
        if (!existing) {
          const created = await this.studentRepo.save(this.studentRepo.create(s));
          results.created++;
          studentId = created.id;
        } else {
          const patch: Partial<Student> = {};
          const fields: (keyof Student)[] = [
            'current_class', 'section',
            'admission_no', 'gender', 'phone', 'dob', 'admission_year',
            'father_name', 'mother_name', 'parent_phone', 'address',
            'father_qualification', 'mother_qualification',
            'father_working_status', 'mother_working_status', 'caste',
          ];
          for (const f of fields) { if (s[f]) (patch as any)[f] = s[f]; }
          if (Object.keys(patch).length > 0) await this.studentRepo.update(existing.id, patch);
          results.updated++;
          studentId = existing.id;
        }

        // Upsert enrollment row so year-based history is preserved
        if (academic_year && s.current_class) {
          await em.query(`
            INSERT INTO student_enrollments (id, student_id, academic_year, class, section, created_at)
            VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())
            ON CONFLICT (student_id, academic_year) DO UPDATE
              SET class = EXCLUDED.class, section = EXCLUDED.section
          `, [studentId, academic_year, s.current_class, s.section || null]);
        }
      } catch (e) {
        results.errors.push(`${s.name}: ${e.message}`);
      }
    }
    return results;
  }

  // Update student
  async update(id: string, data: Partial<Student>) {
    await this.studentRepo.update(id, data);
    return this.findOne(id);
  }

  // Bulk update by name match (for when new Excel arrives)
  async bulkUpdate(students: Partial<Student>[]) {
    const results = { success: 0, failed: 0 };
    for (const s of students) {
      try {
        const existing = await this.studentRepo.findOne({
          where: { name: s.name, current_class: s.current_class }
        });
        if (existing) {
          await this.studentRepo.update(existing.id, s);
          results.success++;
        } else {
          results.failed++;
        }
      } catch {
        results.failed++;
      }
    }
    return results;
  }

  // Delete student (TC) — legacy soft delete
  async delete(id: string) {
    await this.studentRepo.update(id, { is_active: false, tc_date: new Date().toISOString().split('T')[0] });
    return { message: 'Student removed (TC)' };
  }

  // Issue TC with date + reason
  async issueTC(id: string, tc_date: string, tc_reason?: string) {
    await this.studentRepo.update(id, {
      is_active: false,
      tc_date: tc_date || new Date().toISOString().split('T')[0],
      tc_reason: tc_reason || '',
    });
    return { message: 'TC issued successfully' };
  }

  // Get TC register (soft-deleted, non-graduated students)
  async getTCRegister() {
    return this.studentRepo.find({
      where: { is_active: false, is_graduated: false },
      order: { tc_date: 'DESC' },
    });
  }

  // Permanently delete — clears all dependent rows first (assessments, competency scores, enrollment)
  async deletePermanently(id: string) {
    const em = this.studentRepo.manager;
    // Clear dependent tables that have FK constraints to students
    await em.query(`DELETE FROM assessments WHERE student_id = $1`, [id]);
    await em.query(`DELETE FROM competency_scores WHERE student_id = $1`, [id]);
    await em.query(`DELETE FROM activity_assessments WHERE student_id::text = $1`, [id]);
    await em.query(`DELETE FROM student_competency_scores WHERE student_id::text = $1`, [id]);
    await em.query(`DELETE FROM exam_marks WHERE student_id::text = $1`, [id]);
    await em.query(`DELETE FROM homework_records WHERE student_id::text = $1`, [id]);
    await em.query(`DELETE FROM student_enrollments WHERE student_id = $1`, [id]);
    await this.studentRepo.delete(id);
    return { message: 'Student permanently deleted' };
  }

  // ── PROMOTION ────────────────────────────────────────────────
  // Grade order for promotion
  private readonly GRADE_ORDER = [
    'Pre-KG', 'LKG', 'UKG',
    'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5',
    'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10',
  ];

  private nextGrade(current: string): string | null {
    const idx = this.GRADE_ORDER.indexOf(current);
    if (idx === -1 || idx === this.GRADE_ORDER.length - 1) return null;
    return this.GRADE_ORDER[idx + 1];
  }

  // Preview: show what will happen when promoted
  async getPromotionPreview(grade: string, section: string) {
    const students = await this.studentRepo.find({
      where: { current_class: grade, section, is_active: true },
      order: { name: 'ASC' },
    });
    const next = this.nextGrade(grade);
    return {
      current_grade: grade,
      current_section: section,
      next_grade: next,
      student_count: students.length,
      students: students.map(s => ({
        id: s.id, name: s.name, admission_no: s.admission_no,
        current_class: s.current_class, current_section: s.section,
        promoted_to: next,
      })),
    };
  }

  // Execute promotion: move all students in a section to the next grade
  // new_section is required — class teacher assigns new section
  async promoteStudents(data: {
    grade: string;
    section: string;
    new_section: string;
    student_ids?: string[]; // if empty, promotes all in section
  }) {
    const next = this.nextGrade(data.grade);
    if (!next) return { error: `${data.grade} is the final grade. Cannot promote further.` };

    const query: any = { current_class: data.grade, section: data.section, is_active: true };
    const students = data.student_ids?.length
      ? await this.studentRepo.findByIds(data.student_ids)
      : await this.studentRepo.find({ where: query, order: { name: 'ASC' } });

    let promoted = 0;
    for (const student of students) {
      await this.studentRepo.update(student.id, {
        current_class: next,
        section: data.new_section,
      });
      promoted++;
    }

    return {
      success: true,
      promoted_count: promoted,
      from_grade: data.grade,
      from_section: data.section,
      to_grade: next,
      to_section: data.new_section,
      message: `${promoted} students promoted from ${data.grade} ${data.section} to ${next} ${data.new_section}`,
    };
  }

  // Execute batch promotion: each student can go to a different target section
  async promoteStudentsBatch(data: {
    from_grade: string;
    assignments: { student_id: string; to_section: string }[];
  }) {
    const next = this.nextGrade(data.from_grade);
    if (!next) return { error: `${data.from_grade} is the final grade. Cannot promote further.` };

    const sectionCounts: Record<string, number> = {};
    for (const { student_id, to_section } of data.assignments) {
      await this.studentRepo.update(student_id, { current_class: next, section: to_section });
      sectionCounts[to_section] = (sectionCounts[to_section] || 0) + 1;
    }
    return {
      success: true,
      promoted_count: data.assignments.length,
      from_grade: data.from_grade,
      to_grade: next,
      section_counts: sectionCounts,
      message: `${data.assignments.length} students promoted from ${data.from_grade} to ${next}`,
    };
  }

  // Get all sections for a grade (for promotion UI)
  async getSectionsForGrade(grade: string) {
    const students = await this.studentRepo.find({
      where: { current_class: grade, is_active: true },
    });
    const sections = [...new Set(students.map(s => s.section).filter(Boolean))].sort();
    return { grade, sections };
  }

  // Get all sections across all grades
  async getAllSections() {
    const students = await this.studentRepo.find({ where: { is_active: true } });
    const gradeMap: Record<string, Set<string>> = {};
    students.forEach(s => {
      if (!s.current_class || !s.section) return;
      if (!gradeMap[s.current_class]) gradeMap[s.current_class] = new Set();
      gradeMap[s.current_class].add(s.section);
    });
    const result: Record<string, string[]> = {};
    for (const [grade, sections] of Object.entries(gradeMap)) {
      result[grade] = [...sections].sort();
    }
    return result;
  }

  // Add a new section to a grade (by updating a placeholder or just returning)
  async addSection(grade: string, section: string) {
    // Check if section already exists
    const existing = await this.studentRepo.findOne({
      where: { current_class: grade, section }
    });
    if (existing) return { success: false, message: `Section ${section} already exists in ${grade}` };
    // Section is stored at student level — we just record it as valid
    // We return success so frontend can add it to its local list
    return { success: true, grade, section, message: `Section ${section} added to ${grade}` };
  }

  // Remove a section (only if no active students in it)
  async removeSection(grade: string, section: string) {
    const count = await this.studentRepo.count({
      where: { current_class: grade, section, is_active: true }
    });
    if (count > 0) return { success: false, message: `Cannot remove — ${count} active students in ${grade} ${section}` };
    return { success: true, message: `Section ${section} removed from ${grade}` };
  }

  // Graduate Grade 10 students
  async graduateStudents(data: {
    grade: string;
    section: string;
    student_ids?: string[];
    graduation_year: string;
  }) {
    const query: any = { current_class: data.grade, section: data.section, is_active: true };
    const students = data.student_ids?.length
      ? await this.studentRepo.findByIds(data.student_ids)
      : await this.studentRepo.find({ where: query });

    let graduated = 0;
    for (const student of students) {
      await this.studentRepo.update(student.id, {
        is_active: false,
        is_graduated: true,
        graduation_year: data.graduation_year,
      });
      graduated++;
    }
    return {
      success: true,
      graduated,
      grade: data.grade,
      section: data.section,
      graduation_year: data.graduation_year,
      message: `${graduated} students graduated from ${data.grade} ${data.section}`,
    };
  }

  // Get alumni
  async getAlumni(graduation_year?: string) {
    const where: any = { is_graduated: true };
    if (graduation_year) where.graduation_year = graduation_year;
    const alumni = await this.studentRepo.find({ where, order: { name: 'ASC' } });
    return { total: alumni.length, alumni };
  }

  // Get stats
  async getStats() {
    const total = await this.studentRepo.count({ where: { is_active: true } });
    const byGrade = await this.studentRepo
      .createQueryBuilder('student')
      .select('student.current_class', 'grade')
      .addSelect('COUNT(*)', 'count')
      .where('student.is_active = :active', { active: true })
      .groupBy('student.current_class')
      .orderBy('student.current_class', 'ASC')
      .getRawMany();
    const byGender = await this.studentRepo
      .createQueryBuilder('student')
      .select('student.gender', 'gender')
      .addSelect('COUNT(*)', 'count')
      .where('student.is_active = :active', { active: true })
      .andWhere('student.gender IS NOT NULL')
      .andWhere("student.gender != ''")
      .groupBy('student.gender')
      .getRawMany();
    const tcCount = await this.studentRepo.count({ where: { is_active: false, is_graduated: false } });
    return { total, byGrade, byGender, tcCount };
  }
}