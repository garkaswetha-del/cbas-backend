import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GradeSubjectGoal } from './entities/grade-subject-goal.entity';
import { GradePriorMarks } from './entities/grade-prior-marks.entity';
import { TeacherMapping } from '../mappings/entities/teacher-mapping.entity/teacher-mapping.entity';
import { GradeSubjectsService } from '../grade-subjects/grade-subjects.service';

// Same grade sequence used across the app for stepping a grade forward/back.
const GRADE_ORDER = [
  'Nursery', 'Pre-KG', 'LKG', 'UKG',
  'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5',
  'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10',
];

function normSubject(s: string): string {
  return (s || '').trim().toLowerCase();
}

@Injectable()
export class GradeSubjectGoalsService {
  constructor(
    @InjectRepository(GradeSubjectGoal)
    private goalRepo: Repository<GradeSubjectGoal>,
    @InjectRepository(GradePriorMarks)
    private priorMarksRepo: Repository<GradePriorMarks>,
    @InjectRepository(TeacherMapping)
    private mappingRepo: Repository<TeacherMapping>,
    private gradeSubjectsService: GradeSubjectsService,
  ) {}

  private stepGrade(grade: string, delta: 1 | -1): string | null {
    const idx = GRADE_ORDER.indexOf(grade);
    if (idx < 0) return null;
    const next = idx + delta;
    if (next < 0 || next >= GRADE_ORDER.length) return null;
    return GRADE_ORDER[next];
  }

  private shiftAcademicYear(year: string, delta: 1 | -1): string {
    const startYr = parseInt((year || '').split('-')[0], 10);
    if (!startYr) return year;
    const shifted = startYr + delta;
    return `${shifted}-${String(shifted + 1).slice(2)}`;
  }

  // Upsert a single goal — whoever currently teaches that grade+subject sets it,
  // for either the current year or the next year's cohort target. Only ever touches
  // the one (academic_year, grade, subject) row being saved.
  async upsertGoal(academic_year: string, grade: string, subject: string, goal_percentage: number, set_by?: string) {
    const existing = await this.goalRepo
      .createQueryBuilder('g')
      .where('g.academic_year = :year', { year: academic_year })
      .andWhere('g.grade = :grade', { grade })
      .andWhere('LOWER(TRIM(g.subject)) = :subject', { subject: normSubject(subject) })
      .getOne();
    if (existing) {
      await this.goalRepo.update(existing.id, { goal_percentage, set_by });
      return this.goalRepo.findOne({ where: { id: existing.id } });
    }
    return this.goalRepo.save(this.goalRepo.create({
      academic_year, grade, subject: subject.trim(), goal_percentage, set_by,
    }));
  }

  private async findOne(repo: Repository<any>, year: string, grade: string, subject: string) {
    return repo
      .createQueryBuilder('t')
      .where('t.academic_year = :year', { year })
      .andWhere('t.grade = :grade', { grade })
      .andWhere('LOWER(TRIM(t.subject)) = :subject', { subject: normSubject(subject) })
      .getOne();
  }

  // For a teacher's current-year grade+subject mappings, return one combined row per
  // combo: last year's achieved % (reference only), this year's goal, and next year's
  // goal for the same cohort — whichever of these exist. Nothing here writes anything.
  async forTeacher(teacher_id: string, academic_year: string) {
    const mappings = await this.mappingRepo.find({ where: { teacher_id, academic_year, is_active: true } });
    const seen = new Set<string>();
    const combos: { grade: string; subject: string }[] = [];
    for (const m of mappings) {
      if (!m.grade || !m.subject) continue;
      const key = `${m.grade}__${normSubject(m.subject)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      combos.push({ grade: m.grade, subject: m.subject });
    }

    const results: {
      current_grade: string; subject: string;
      previous_grade: string | null; previous_academic_year: string;
      achieved_percentage: number | null; this_year_goal: number | null;
      next_grade: string | null; next_academic_year: string; next_year_goal: number | null;
    }[] = [];
    for (const c of combos) {
      const prevGrade = this.stepGrade(c.grade, -1);
      const prevYear = this.shiftAcademicYear(academic_year, -1);
      const nextGrade = this.stepGrade(c.grade, 1);
      const nextYear = this.shiftAcademicYear(academic_year, 1);

      const achievedRow = prevGrade ? await this.findOne(this.priorMarksRepo, prevYear, prevGrade, c.subject) : null;
      const thisGoalRow = await this.findOne(this.goalRepo, academic_year, c.grade, c.subject);
      const nextGoalRow = nextGrade ? await this.findOne(this.goalRepo, nextYear, nextGrade, c.subject) : null;

      results.push({
        current_grade: c.grade,
        subject: c.subject,
        previous_grade: prevGrade,
        previous_academic_year: prevYear,
        achieved_percentage: achievedRow ? Number((achievedRow as GradePriorMarks).average_percentage) : null,
        this_year_goal: thisGoalRow ? Number(thisGoalRow.goal_percentage) : null,
        next_grade: nextGrade,
        next_academic_year: nextYear,
        next_year_goal: nextGoalRow ? Number(nextGoalRow.goal_percentage) : null,
      });
    }
    return results;
  }

  // Cumulative, read-only rollup across every grade+subject configured in
  // Grade & Subject Mapping — not scoped to any one teacher. `grades`, when passed,
  // restricts the rows to just those grades (used for an AHM's stage view); omitted
  // for admin, who sees every grade.
  async summary(academic_year: string, grades?: string[]) {
    const allSubjects = await this.gradeSubjectsService.getAll(); // Record<grade, string[]>
    const relevantGrades = grades && grades.length
      ? grades.filter(g => allSubjects[g])
      : Object.keys(allSubjects);

    const results: {
      grade: string; subject: string;
      previous_grade: string | null; previous_academic_year: string;
      achieved_percentage: number | null;
      this_year_goal: number | null; set_by: string | null; updated_at: Date | null;
    }[] = [];

    for (const grade of relevantGrades) {
      const subjects = allSubjects[grade] || [];
      for (const subject of subjects) {
        const prevGrade = this.stepGrade(grade, -1);
        const prevYear = this.shiftAcademicYear(academic_year, -1);
        const achievedRow = prevGrade ? await this.findOne(this.priorMarksRepo, prevYear, prevGrade, subject) : null;
        const goalRow = await this.findOne(this.goalRepo, academic_year, grade, subject);
        results.push({
          grade,
          subject,
          previous_grade: prevGrade,
          previous_academic_year: prevYear,
          achieved_percentage: achievedRow ? Number((achievedRow as GradePriorMarks).average_percentage) : null,
          this_year_goal: goalRow ? Number((goalRow as GradeSubjectGoal).goal_percentage) : null,
          set_by: goalRow ? (goalRow as GradeSubjectGoal).set_by : null,
          updated_at: goalRow ? (goalRow as GradeSubjectGoal).updated_at : null,
        });
      }
    }
    return results;
  }
}
