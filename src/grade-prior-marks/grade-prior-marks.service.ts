import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GradePriorMarks } from './entities/grade-prior-marks.entity';
import { TeacherMapping } from '../mappings/entities/teacher-mapping.entity/teacher-mapping.entity';

// Same grade sequence used elsewhere in the app (promotion, stage grouping) — needed
// here to step back one grade ("Grade 4" this year -> "Grade 3" last year).
const GRADE_ORDER = [
  'Nursery', 'Pre-KG', 'LKG', 'UKG',
  'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5',
  'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10',
];

function normSubject(s: string): string {
  return (s || '').trim().toLowerCase();
}

@Injectable()
export class GradePriorMarksService {
  constructor(
    @InjectRepository(GradePriorMarks)
    private repo: Repository<GradePriorMarks>,
    @InjectRepository(TeacherMapping)
    private mappingRepo: Repository<TeacherMapping>,
  ) {}

  private previousGrade(grade: string): string | null {
    const idx = GRADE_ORDER.indexOf(grade);
    if (idx <= 0) return null; // unknown grade, or already the first grade — no "previous"
    return GRADE_ORDER[idx - 1];
  }

  private previousAcademicYear(year: string): string {
    const startYr = parseInt((year || '').split('-')[0], 10);
    if (!startYr) return year;
    const prevStart = startYr - 1;
    return `${prevStart}-${String(prevStart + 1).slice(2)}`;
  }

  // Bulk upsert from a parsed Excel sheet. One (academic_year, grade, subject) combo
  // is updated in place if it already exists — nothing else in the table is touched.
  async upload(
    rows: { grade: string; subject: string; average_percentage: number }[],
    academic_year: string,
    uploaded_by?: string,
  ) {
    let saved = 0;
    for (const r of rows) {
      if (!r.grade || !r.subject || r.average_percentage === null || r.average_percentage === undefined || isNaN(r.average_percentage)) continue;
      const existing = await this.repo
        .createQueryBuilder('p')
        .where('p.academic_year = :year', { year: academic_year })
        .andWhere('p.grade = :grade', { grade: r.grade })
        .andWhere('LOWER(TRIM(p.subject)) = :subject', { subject: normSubject(r.subject) })
        .getOne();
      if (existing) {
        await this.repo.update(existing.id, { average_percentage: r.average_percentage, uploaded_by });
      } else {
        await this.repo.save(this.repo.create({
          academic_year, grade: r.grade, subject: r.subject.trim(),
          average_percentage: r.average_percentage, uploaded_by,
        }));
      }
      saved++;
    }
    return { success: true, saved };
  }

  async listForYear(academic_year: string) {
    return this.repo.find({ where: { academic_year }, order: { grade: 'ASC', subject: 'ASC' } });
  }

  // For a teacher's CURRENT-year grade+subject mappings, resolve each to
  // (previous grade, previous academic year) and return whatever's on file.
  // Combos with no previous grade (e.g. Pre-KG) or no matching upload are just omitted.
  async forTeacher(teacher_id: string, academic_year: string) {
    const mappings = await this.mappingRepo.find({ where: { teacher_id, academic_year, is_active: true } });
    const comboKey = (grade: string, subject: string) => `${grade}__${normSubject(subject)}`;
    const seen = new Set<string>();
    const combos: { grade: string; subject: string }[] = [];
    for (const m of mappings) {
      if (!m.grade || !m.subject) continue;
      const key = comboKey(m.grade, m.subject);
      if (seen.has(key)) continue;
      seen.add(key);
      combos.push({ grade: m.grade, subject: m.subject });
    }

    const prevYear = this.previousAcademicYear(academic_year);
    const results: {
      current_grade: string; subject: string;
      previous_grade: string; previous_academic_year: string;
      average_percentage: number;
    }[] = [];

    for (const c of combos) {
      const prevGrade = this.previousGrade(c.grade);
      if (!prevGrade) continue;
      const row = await this.repo
        .createQueryBuilder('p')
        .where('p.academic_year = :year', { year: prevYear })
        .andWhere('p.grade = :grade', { grade: prevGrade })
        .andWhere('LOWER(TRIM(p.subject)) = :subject', { subject: normSubject(c.subject) })
        .getOne();
      if (!row) continue;
      results.push({
        current_grade: c.grade,
        subject: c.subject,
        previous_grade: prevGrade,
        previous_academic_year: prevYear,
        average_percentage: Number(row.average_percentage),
      });
    }
    return results;
  }
}
