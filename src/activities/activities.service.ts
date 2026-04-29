import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SectionsService } from '../sections/sections.service';
import { Activity } from './entities/activity.entity/activity.entity';
import { ActivityAssessment } from './entities/activity-assessment.entity/activity-assessment.entity';
import { StudentCompetencyScore } from './entities/student-competency-score.entity/student-competency-score.entity';
import { CompetencyFramework } from '../competencies/entities/competency-framework.entity/competency-framework.entity';
import { Student } from '../students/entities/student.entity/student.entity';
import * as XLSX from 'xlsx';

const AVG = (arr: number[]) => arr.length ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2) : 0;

import { normalizeSubject } from '../common/utils';

// 8-level grading based on percentage
const PCT_TO_LEVEL = (pct: number): string => {
  if (pct >= 95) return 'Mastery';
  if (pct >= 86) return 'Advanced';
  if (pct >= 76) return 'Proficient';
  if (pct >= 66) return 'Exceeding';
  if (pct >= 51) return 'Meeting';
  if (pct >= 36) return 'Approaching';
  if (pct >= 21) return 'Developing';
  return 'Beginning';
};

// Calculate total marks and percentage from competency_marks and rubrics
const calcMarksAndPct = (competency_marks: any, rubrics: any[]) => {
  let total_obtained = 0;
  let total_max = 0;
  for (const rubric of (rubrics || [])) {
    const comp_id = rubric.competency_id;
    const items = rubric.rubric_items || [];
    const studentComp = (competency_marks || {})[comp_id] || {};
    for (let i = 0; i < items.length; i++) {
      total_max += +(items[i].max_marks || 0);
      total_obtained += +(studentComp[String(i)] || 0);
    }
  }
  const pct = total_max > 0 ? +((total_obtained / total_max) * 100).toFixed(2) : 0;
  return { total_obtained, total_max, pct, level: PCT_TO_LEVEL(pct) };
};

@Injectable()
export class ActivitiesService {
  constructor(
    @InjectRepository(Activity) private activityRepo: Repository<Activity>,
    @InjectRepository(ActivityAssessment) private assessmentRepo: Repository<ActivityAssessment>,
    @InjectRepository(StudentCompetencyScore) private scoreRepo: Repository<StudentCompetencyScore>,
    @InjectRepository(CompetencyFramework) private competencyRepo: Repository<CompetencyFramework>,
    @InjectRepository(Student) private studentRepo: Repository<Student>,
    private sectionsService: SectionsService,
  ) {}

  // ── COMPETENCY MANAGEMENT ─────────────────────────────────────

  async getCompetencies(filters: { subject?: string; stage?: string; grade?: string; search?: string; include_inactive?: boolean }) {
    const query = this.competencyRepo.createQueryBuilder('c');
    if (!filters.include_inactive) query.where('c.is_active = true');
    if (filters.subject) query.andWhere('c.subject = :subject', { subject: filters.subject });
    if (filters.stage) query.andWhere('c.stage = :stage', { stage: filters.stage });
    if (filters.grade) query.andWhere('c.grade = :grade', { grade: filters.grade });
    if (filters.search) query.andWhere('(c.competency_code ILIKE :s OR c.description ILIKE :s)', { s: `%${filters.search}%` });
    return query.orderBy('c.is_active', 'DESC').addOrderBy('c.subject', 'ASC').addOrderBy('c.grade', 'ASC').addOrderBy('c.domain', 'ASC').getMany();
  }

  async reactivateCompetency(id: string) {
    await this.competencyRepo.update(id, { is_active: true });
    return this.competencyRepo.findOne({ where: { id } });
  }

  async getCompetencyById(id: string) {
    return this.competencyRepo.findOne({ where: { id } });
  }

  async getCompetencyStats() {
    const total = await this.competencyRepo.count({ where: { is_active: true } });
    const bySubject = await this.competencyRepo
      .createQueryBuilder('c').select('c.subject', 'subject')
      .addSelect('COUNT(*)', 'count').where('c.is_active = true')
      .groupBy('c.subject').getRawMany();
    const byStage = await this.competencyRepo
      .createQueryBuilder('c').select('c.stage', 'stage')
      .addSelect('COUNT(*)', 'count').where('c.is_active = true')
      .groupBy('c.stage').getRawMany();
    const subjects = await this.competencyRepo
      .createQueryBuilder('c').select('DISTINCT c.subject', 'subject')
      .where('c.is_active = true').getRawMany();
    return { total, bySubject, byStage, subjects: subjects.map((s: any) => s.subject) };
  }

  async createCompetency(data: any) {
    const comp = this.competencyRepo.create({
      subject: normalizeSubject(data.subject), stage: data.stage, grade: data.grade,
      domain: data.domain, competency_code: data.competency_code,
      description: data.description, is_active: true,
    });
    return this.competencyRepo.save(comp);
  }

  async updateCompetency(id: string, data: any) {
    await this.competencyRepo.update(id, {
      subject: normalizeSubject(data.subject), stage: data.stage, grade: data.grade,
      domain: data.domain, competency_code: data.competency_code,
      description: data.description,
    });
    return this.competencyRepo.findOne({ where: { id } });
  }

  async deleteCompetency(id: string) {
    await this.competencyRepo.update(id, { is_active: false });
    return { message: 'Competency deactivated' };
  }

  async importCompetenciesFromExcel(buffer: Buffer, subject: string) {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const results = { inserted: 0, skipped: 0, errors: [] as string[] };
    const sheetName = wb.SheetNames.find(s => s.toLowerCase().includes('competenc')) || wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: null });
    for (const row of rows) {
      try {
        const code = String(row['competency_code'] || row['code'] || '').trim();
        const rowSubject = String(row['subject'] || subject || '').trim().toLowerCase().replace(/\s+/g, '_');
        const stage = String(row['stage'] || '').trim().toLowerCase();
        const grade = String(row['grade'] || '').trim();
        const domain = String(row['domain'] || '').trim();
        const description = String(row['description'] || '').trim();
        if (!grade || !description || description === 'null') { results.skipped++; continue; }
        const finalCode = code || `${rowSubject.substring(0, 4).toUpperCase()}-${grade.replace(/\s/g, '')}-${domain.substring(0, 6).replace(/\s/g, '').toUpperCase()}`;
        const finalSubject = rowSubject || subject;
        const exists = await this.competencyRepo.findOne({ where: { competency_code: finalCode, subject: finalSubject, grade, domain } });
        if (exists) { results.skipped++; continue; }
        await this.competencyRepo.save(this.competencyRepo.create({
          subject: finalSubject, stage: stage || this.getStageForGrade(grade),
          grade, domain, competency_code: finalCode,
          description: description.substring(0, 1000), is_active: true,
        }));
        results.inserted++;
      } catch (e) { results.errors.push(String(e)); }
    }
    return results;
  }

  private getStageForGrade(grade: string): string {
    const g = grade.toLowerCase().replace(/\s/g, '').replace(/-/g, '');
    if (['pkg', 'prkg', 'prekg', 'lkg', 'ukg', 'grade1', 'grade2'].includes(g)) return 'foundation';
    if (['grade3', 'grade4', 'grade5'].includes(g)) return 'preparatory';
    if (['grade6', 'grade7', 'grade8'].includes(g)) return 'middle';
    if (['grade9', 'grade10'].includes(g)) return 'secondary';
    return 'general';
  }

  // ── ACTIVITY MANAGEMENT ───────────────────────────────────────

  async createActivity(data: any) {
    const created: Activity[] = [];
    const rubrics = data.rubrics || [];
    const total_max_marks = rubrics.reduce((sum: number, r: any) =>
      sum + (r.rubric_items || []).reduce((s: number, item: any) => s + +(item.max_marks || 0), 0), 0);

    const sections: string[] = data.sections && data.sections.length
      ? data.sections
      : data.section ? [data.section] : [];

    // Validate each section before saving
    for (const sec of sections) {
      const valid = await this.sectionsService.validate(data.grade, sec, data.academic_year || '2025-26');
      if (!valid) throw new BadRequestException(`Section '${sec}' does not exist for ${data.grade} in ${data.academic_year || '2025-26'}`);
    }

    const skipped: string[] = [];
    for (const section of sections) {
      // Duplicate check: same name + grade + section + subject + academic_year
      const duplicate = await this.activityRepo.findOne({
        where: {
          name: data.name, grade: data.grade, section,
          subject: normalizeSubject(data.subject),
          academic_year: data.academic_year || '2025-26',
          is_active: true,
        },
      });
      if (duplicate) { skipped.push(section); continue; }

      const activity = this.activityRepo.create({
        name: data.name, description: data.description, subject: normalizeSubject(data.subject),
        stage: data.stage, grade: data.grade, section,
        academic_year: data.academic_year || '2025-26',
        activity_type: data.activity_type, activity_date: data.activity_date,
        competency_mappings: data.competency_mappings || [],
        rubrics, total_max_marks,
        created_by: data.created_by,
      });
      const saved = await this.activityRepo.save(activity);
      created.push(saved);
    }
    return { created_count: created.length, skipped_sections: skipped, activities: created };
  }

  async getActivities(filters: {
    grade?: string; section?: string; subject?: string;
    academic_year?: string; stage?: string;
  }) {
    const query = this.activityRepo.createQueryBuilder('a').where('a.is_active = true');
    if (filters.grade) query.andWhere('a.grade = :grade', { grade: filters.grade });
    if (filters.section) query.andWhere('LOWER(a.section) = LOWER(:section)', { section: filters.section });
    if (filters.subject) query.andWhere('a.subject = :subject', { subject: normalizeSubject(filters.subject) });
    if (filters.academic_year) query.andWhere('a.academic_year = :ay', { ay: filters.academic_year });
    if (filters.stage) query.andWhere('a.stage = :stage', { stage: filters.stage });
    return query.orderBy('a.activity_date', 'DESC').addOrderBy('a.created_at', 'DESC').getMany();
  }

  async getActivityById(id: string) {
    return this.activityRepo.findOne({ where: { id, is_active: true } });
  }

  async updateActivity(id: string, data: any) {
    await this.activityRepo.update(id, {
      name: data.name, description: data.description, subject: normalizeSubject(data.subject),
      stage: data.stage, grade: data.grade, section: data.section,
      activity_type: data.activity_type, activity_date: data.activity_date,
      competency_mappings: data.competency_mappings,
    });
    return this.activityRepo.findOne({ where: { id } });
  }

  async deleteActivity(id: string) {
    await this.activityRepo.update(id, { is_active: false });
    return { message: 'Activity deleted' };
  }

  // ── MARKS ENTRY ───────────────────────────────────────────────

  async getMarksForActivity(activity_id: string, academic_year: string) {
    const activity = await this.activityRepo.findOne({ where: { id: activity_id } });
    if (!activity) return null;
    const students = await this.studentRepo
      .createQueryBuilder('student')
      .where('LOWER(student.current_class) = LOWER(:grade)', { grade: activity.grade })
      .andWhere('LOWER(student.section) = LOWER(:section)', { section: activity.section })
      .andWhere('student.is_active = :active', { active: true })
      .orderBy('student.name', 'ASC')
      .getMany();
    const assessments = await this.assessmentRepo.find({ where: { activity_id, academic_year } });
    const competencies = await this.competencyRepo.find({
      where: { is_active: true },
      order: { domain: 'ASC', competency_code: 'ASC' },
    });
    const activityCompetencies = (activity.competency_mappings as string[])
      .map(id => competencies.find(c => c.id === id))
      .filter(Boolean);
    return {
      activity,
      rubrics: (activity.rubrics as any[]) || [],
      total_max_marks: activity.total_max_marks,
      competencies: activityCompetencies,
      students: students.map(s => {
        const assessment = assessments.find(a => a.student_id === s.id);
        return { student: s, assessment: assessment || null };
      }),
    };
  }

  async saveMarks(activity_id: string, academic_year: string, entries: any[]) {
    const activity = await this.activityRepo.findOne({ where: { id: activity_id } });
    if (!activity) throw new Error('Activity not found');
    const rubrics = (activity.rubrics as any[]) || [];
    const results = { saved: 0, failed: 0 };

    for (const entry of entries) {
      try {
        const competency_marks = entry.competency_marks || {};
        const { total_obtained, pct, level } = calcMarksAndPct(competency_marks, rubrics);

        const existing = await this.assessmentRepo.findOne({
          where: { activity_id, student_id: entry.student_id, academic_year },
        });

        if (existing) {
          await this.assessmentRepo.update(existing.id, {
            competency_marks, total_marks_obtained: total_obtained,
            percentage: pct, level, is_active: true,
          } as any);
        } else {
          await this.assessmentRepo.save(this.assessmentRepo.create({
            activity_id, student_id: entry.student_id, student_name: entry.student_name,
            grade: activity.grade, section: activity.section, academic_year,
            competency_marks, total_marks_obtained: total_obtained,
            percentage: pct, level, assessed_by: entry.assessed_by,
          } as any));
        }

        // Update StudentCompetencyScore per competency using % contribution
        for (const rubric of rubrics) {
          const comp_id = rubric.competency_id;
          const items = rubric.rubric_items || [];
          const studentComp = competency_marks[comp_id] || {};
          let comp_obtained = 0;
          let comp_max = 0;
          for (let i = 0; i < items.length; i++) {
            comp_max += +(items[i].max_marks || 0);
            comp_obtained += +(studentComp[String(i)] || 0);
          }
          const comp_pct = comp_max > 0 ? +((comp_obtained / comp_max) * 100).toFixed(2) : 0;
          const comp_level = PCT_TO_LEVEL(comp_pct);

          const competency = await this.competencyRepo.findOne({ where: { id: comp_id } });
          if (!competency) continue;

          const existing_score = await this.scoreRepo.findOne({
            where: { student_id: entry.student_id, competency_id: comp_id, academic_year },
          });

          if (existing_score) {
            const allAssessments = await this.assessmentRepo.find({
              where: { student_id: entry.student_id, academic_year },
            });
            const allPcts: number[] = [];
            for (const a of allAssessments) {
              const { pct: ap } = calcMarksAndPct(
                (a as any).competency_marks,
                (await this.activityRepo.findOne({ where: { id: a.activity_id } }))?.rubrics as any[] || []
              );
              if (ap > 0) allPcts.push(ap);
            }
            const avgPct = allPcts.length ? AVG(allPcts) : comp_pct;
            await this.scoreRepo.update(existing_score.id, {
              best_score: Math.min(4.0, +(avgPct / 25).toFixed(2)),
              best_rating: comp_level,
              attempt_count: existing_score.attempt_count + 1,
            });
          } else {
            await this.scoreRepo.save(this.scoreRepo.create({
              student_id: entry.student_id, student_name: entry.student_name,
              grade: activity.grade, section: activity.section, academic_year,
              competency_id: comp_id, competency_code: competency.competency_code,
              subject: normalizeSubject(competency.subject), domain: competency.domain,
              best_score: Math.min(4.0, +(comp_pct / 25).toFixed(2)),
              best_rating: comp_level, attempt_count: 1,
            }));
          }
        }
        results.saved++;
      } catch (e) { console.error('saveMarks failed for student:', entry?.student_id, e); results.failed++; }
    }
    return results;
  }


  async getCombinedMarks(grade: string, section: string, subject: string, academic_year: string) {
    const subjectNorm = normalizeSubject(subject);
    const activities = await this.activityRepo.find({
      where: { grade, section, is_active: true, academic_year },
    });
    const filtered = activities.filter(a =>
      a.subject === subject || a.subject === subjectNorm ||
      (a.extra_subjects || []).some((s: string) => s === subject || s === subjectNorm)
    );

    const students = await this.studentRepo
      .createQueryBuilder('s')
      .where('LOWER(s.current_class) = LOWER(:grade)', { grade })
      .andWhere('LOWER(s.section) = LOWER(:section)', { section })
      .andWhere('s.is_active = true')
      .orderBy('s.name', 'ASC')
      .getMany();

    const activityIds = filtered.map(a => a.id);
    const assessments = activityIds.length
      ? await this.assessmentRepo
          .createQueryBuilder('aa')
          .where('aa.activity_id IN (:...ids)', { ids: activityIds })
          .andWhere('aa.academic_year = :ay', { ay: academic_year })
          .getMany()
      : [];

    // Build student rows
    const studentRows = students.map(student => {
      const activityData: Record<string, any> = {};
      filtered.forEach(act => {
        const assessment = assessments.find(a => a.activity_id === act.id && a.student_id === student.id);
        activityData[act.id] = {
          competency_marks: (assessment as any)?.competency_marks || null,
          percentage: (assessment as any)?.percentage || null,
          level: (assessment as any)?.level || null,
          total_marks_obtained: (assessment as any)?.total_marks_obtained || null,
        };
      });

      // Per-competency percentage averages across activities
      const competencyPcts: Record<string, { avg_pct: number; level: string; count: number }> = {};
      const allCompIds = new Set<string>();
      filtered.forEach(act => { (act.rubrics as any[] || []).forEach((r: any) => allCompIds.add(r.competency_id)); });

      allCompIds.forEach(comp_id => {
        const pcts: number[] = [];
        filtered.forEach(act => {
          const rubrics = (act.rubrics as any[]) || [];
          const compRubric = rubrics.find((r: any) => r.competency_id === comp_id);
          if (!compRubric) return;
          const cm = activityData[act.id]?.competency_marks;
          if (!cm) return;
          const studentComp = cm[comp_id] || {};
          let obtained = 0; let max = 0;
          (compRubric.rubric_items || []).forEach((item: any, i: number) => {
            max += +(item.max_marks || 0);
            obtained += +(studentComp[String(i)] || 0);
          });
          if (max > 0) pcts.push(+(obtained / max * 100).toFixed(2));
        });
        if (pcts.length) {
          const avg_pct = AVG(pcts);
          competencyPcts[comp_id] = { avg_pct, level: PCT_TO_LEVEL(avg_pct), count: pcts.length };
        }
      });

      // Overall average pct
      const allPcts = filtered
        .map(act => activityData[act.id]?.percentage)
        .filter((p: any) => p !== null && p !== undefined)
        .map((p: any) => +p);
      const overall_pct = allPcts.length ? AVG(allPcts) : 0;

      return {
        student_id: student.id, student_name: student.name,
        activity_data: activityData, competencyPcts,
        overall_pct, level: PCT_TO_LEVEL(overall_pct),
      };
    });

    return {
      activities: filtered,
      students: studentRows,
      grade, section, subject, academic_year,
    };
  }


  async getCompetencyCoverage(grade: string, subject: string, academic_year: string) {
    subject = normalizeSubject(subject);
    const competencies = await this.competencyRepo
      .createQueryBuilder('c').where('LOWER(c.grade) = LOWER(:grade)', { grade })
      .andWhere('c.subject = :subject', { subject }).andWhere('c.is_active = true').getMany();
    const activities = await this.activityRepo
      .createQueryBuilder('a').where('LOWER(a.grade) = LOWER(:grade)', { grade })
      .andWhere('a.subject = :subject', { subject }).andWhere('a.academic_year = :ay', { ay: academic_year })
      .andWhere('a.is_active = true').getMany();
    const coveredIds = new Set<string>();
    activities.forEach(a => { (a.competency_mappings as string[]).forEach(id => coveredIds.add(id)); });
    const covered = competencies.filter(c => coveredIds.has(c.id));
    const uncovered = competencies.filter(c => !coveredIds.has(c.id));
    return {
      total: competencies.length,
      covered: covered.length,
      uncovered: uncovered.length,
      coverage_percent: competencies.length ? +((covered.length / competencies.length) * 100).toFixed(1) : 0,
      covered_competencies: covered,
      uncovered_competencies: uncovered,
    };
  }

  async getCompetencyCoverageDetail(grade: string, subject: string, academic_year: string) {
    subject = normalizeSubject(subject);
    return this.getCompetencyCoverage(grade, subject, academic_year);
  }

  // ── SUBJECTS FOR GRADE ────────────────────────────────────────

  async getSubjectWiseReport(grade: string, section: string, academic_year: string) {
    // All activities for this grade+section
    const activities = await this.activityRepo
      .createQueryBuilder('a').where('LOWER(a.grade) = LOWER(:grade)', { grade })
      .andWhere('LOWER(a.section) = LOWER(:section)', { section })
      .andWhere('a.academic_year = :ay', { ay: academic_year })
      .andWhere('a.is_active = true')
      .orderBy('a.subject', 'ASC').addOrderBy('a.activity_date', 'DESC').getMany();

    // All competencies for this grade
    const allComps = await this.competencyRepo
      .createQueryBuilder('c').where('LOWER(c.grade) = LOWER(:grade)', { grade })
      .andWhere('c.is_active = true').getMany();

    // Group by subject
    const bySubject: Record<string, any> = {};
    activities.forEach(a => {
      const sub = a.subject || 'General';
      if (!bySubject[sub]) {
        const subComps = allComps.filter(c => c.subject === sub);
        bySubject[sub] = {
          subject: sub,
          activities: [],
          total_competencies: subComps.length,
          covered_competency_ids: new Set<string>(),
        };
      }
      const rubrics = (a.rubrics as any[]) || [];
      rubrics.forEach((r: any) => bySubject[sub].covered_competency_ids.add(r.competency_id));
      bySubject[sub].activities.push({
        id: a.id, name: a.name, activity_type: a.activity_type,
        activity_date: a.activity_date, total_max_marks: a.total_max_marks,
        rubrics: rubrics.map((r: any) => ({
          competency_id: r.competency_id,
          competency_code: r.competency_code,
          competency_name: r.competency_name,
          rubric_items: r.rubric_items,
          max_marks: (r.rubric_items || []).reduce((s: number, i: any) => s + +(i.max_marks || 0), 0),
        })),
      });
    });

    const report = Object.values(bySubject).map((sub: any) => ({
      subject: sub.subject,
      total_competencies: sub.total_competencies,
      covered_competencies: sub.covered_competency_ids.size,
      coverage_percent: sub.total_competencies
        ? +((sub.covered_competency_ids.size / sub.total_competencies) * 100).toFixed(1) : 0,
      activities: sub.activities,
    }));

    return { grade, section, academic_year, report };
  }

  async getSubjectsForGrade(grade: string) {
    // Fetch from activities table — reflects actual subjects used, not just competency registry
    const result = await this.activityRepo
      .createQueryBuilder('a').select('DISTINCT a.subject', 'subject')
      .where('a.grade = :grade', { grade }).andWhere('a.is_active = true').getRawMany();
    return result.map((r: any) => r.subject).filter(Boolean).sort();
  }

  // ── DASHBOARDS ───────────────────────────────────────────────

  async getStudentDashboard(student_id: string, academic_year: string) {
    const student = await this.studentRepo.findOne({ where: { id: student_id } });
    const scores = await this.scoreRepo.find({ where: { student_id, academic_year } });

    const bySubject: Record<string, any[]> = {};
    scores.forEach(s => {
      if (!bySubject[s.subject]) bySubject[s.subject] = [];
      bySubject[s.subject].push(s);
    });
    const subjectSummary = Object.entries(bySubject).map(([subject, subScores]) => {
      const avg = AVG(subScores.map(s => +s.best_score));
      return { subject, avg, level: PCT_TO_LEVEL(avg * 25), competency_count: subScores.length };
    });

    const byDomain: Record<string, any[]> = {};
    scores.forEach(s => {
      const key = `${s.subject}__${s.domain || 'General'}`;
      if (!byDomain[key]) byDomain[key] = [];
      byDomain[key].push(s);
    });
    const domainSummary = Object.entries(byDomain).map(([key, domScores]) => {
      const [subject, domain] = key.split('__');
      const avg = AVG(domScores.map(s => +s.best_score));
      return { subject, domain, avg, level: PCT_TO_LEVEL(avg * 25), count: domScores.length };
    });

    // Individual competency scores
    const competencyScores = scores.map(s => ({
      competency_id: s.competency_id,
      competency_code: s.competency_code,
      domain: s.domain || 'General',
      subject: s.subject,
      avg: +s.best_score,
      rating: (s as any).best_rating,
      level: PCT_TO_LEVEL(+s.best_score * 25),
      assessment_count: s.attempt_count,
    })).sort((a, b) => b.avg - a.avg);

    return { student, scores, subjectSummary, domainSummary, competencyScores };
  }

  async getSectionDashboard(grade: string, section: string, academic_year: string) {
    const students = await this.studentRepo.find({
      where: { current_class: grade, section, is_active: true },
      order: { name: 'ASC' },
    });
    const scores = await this.scoreRepo.find({ where: { grade, section, academic_year } });

    const competencyIds = [...new Set(scores.map(s => s.competency_id))];

    // Heatmap
    const heatmap = students.map(st => {
      const studentScores = scores.filter(s => s.student_id === st.id);
      const row: any = { student_id: st.id, student_name: st.name };
      competencyIds.forEach(cid => {
        const sc = studentScores.find(s => s.competency_id === cid);
        row[cid] = (sc as any)?.best_rating || null;
      });
      const a = studentScores.length ? AVG(studentScores.map(s => +s.best_score)) : 0;
      row.overall_avg = +a.toFixed(2);
      row.level = PCT_TO_LEVEL(a * 25);
      return row;
    });

    // Competency averages
    const competencyAvgs = competencyIds.map(cid => {
      const cidScores = scores.filter(s => s.competency_id === cid);
      const a = AVG(cidScores.map(s => +s.best_score));
      const sample = cidScores[0];
      return {
        competency_id: cid, competency_code: sample?.competency_code,
        domain: sample?.domain || 'General', subject: sample?.subject,
        avg: +a.toFixed(2), level: PCT_TO_LEVEL(a * 25),
      };
    });

    // Domain averages
    const domainMap: Record<string, number[]> = {};
    scores.forEach(s => {
      const key = s.domain || 'General';
      if (!domainMap[key]) domainMap[key] = [];
      domainMap[key].push(+s.best_score);
    });
    const domains = Object.entries(domainMap).map(([domain, sc]) => ({
      domain, avg: AVG(sc), count: sc.length,
    })).sort((a, b) => b.avg - a.avg);

    // Student domain breakdown
    const studentDomainBreakdown = students.map(st => {
      const studentScores = scores.filter(s => s.student_id === st.id);
      const domMap: Record<string, number[]> = {};
      studentScores.forEach(s => {
        const d = s.domain || 'General';
        if (!domMap[d]) domMap[d] = [];
        domMap[d].push(+s.best_score);
      });
      const domainAvgs: Record<string, number> = {};
      Object.entries(domMap).forEach(([d, sc]) => { domainAvgs[d] = AVG(sc); });
      return {
        student_id: st.id, student_name: st.name,
        overall_avg: studentScores.length ? AVG(studentScores.map(s => +s.best_score)) : 0,
        domain_avgs: domainAvgs,
      };
    }).sort((a, b) => b.overall_avg - a.overall_avg);

    const weakest = [...competencyAvgs].sort((a, b) => a.avg - b.avg).slice(0, 5);

    return {
      grade, section,
      total_students: students.length,
      students: heatmap,
      competencyAvgs,
      domains,
      studentDomainBreakdown,
      weakest,
      overall_avg: scores.length ? AVG(scores.map(s => +s.best_score)) : 0,
    };
  }

  async getGradeDashboard(grade: string, academic_year: string) {
    const scores = await this.scoreRepo
      .createQueryBuilder('s').where('LOWER(s.grade) = LOWER(:grade)', { grade })
      .andWhere('s.academic_year = :ay', { ay: academic_year }).getMany();
    const students = await this.studentRepo
      .createQueryBuilder('s').where('LOWER(s.current_class) = LOWER(:grade)', { grade })
      .andWhere('s.is_active = true').getMany();

    // Section averages
    const sectionMap: Record<string, any[]> = {};
    scores.forEach(s => {
      if (!s.section) return;
      if (!sectionMap[s.section]) sectionMap[s.section] = [];
      sectionMap[s.section].push(s);
    });
    const sections = Object.entries(sectionMap).map(([section, sc]) => ({
      section, avg: AVG(sc.map(s => +s.best_score)), count: sc.length,
    }));

    // Subject averages
    const subjectMap: Record<string, number[]> = {};
    scores.forEach(s => {
      if (!subjectMap[s.subject]) subjectMap[s.subject] = [];
      subjectMap[s.subject].push(+s.best_score);
    });
    const subjects = Object.entries(subjectMap).map(([subject, sc]) => ({
      subject, avg: AVG(sc),
    }));

    // Domain averages
    const domainMap: Record<string, number[]> = {};
    scores.forEach(s => {
      const key = s.domain || 'General';
      if (!domainMap[key]) domainMap[key] = [];
      domainMap[key].push(+s.best_score);
    });
    const domains = Object.entries(domainMap).map(([domain, sc]) => ({
      domain, avg: AVG(sc), count: sc.length,
    })).sort((a, b) => b.avg - a.avg);

    // Individual competency averages
    const competencyMap: Record<string, { scores: number[]; code: string; domain: string; subject: string }> = {};
    scores.forEach(s => {
      if (!competencyMap[s.competency_id]) {
        competencyMap[s.competency_id] = { scores: [], code: s.competency_code, domain: s.domain || 'General', subject: s.subject };
      }
      competencyMap[s.competency_id].scores.push(+s.best_score);
    });
    const competencies = Object.entries(competencyMap).map(([id, data]) => ({
      competency_id: id, competency_code: data.code, domain: data.domain, subject: normalizeSubject(data.subject),
      avg: AVG(data.scores), level: PCT_TO_LEVEL(AVG(data.scores) * 25),
    })).sort((a, b) => b.avg - a.avg);

    // Student averages for ranking
    const studentAggMap: Record<string, number[]> = {};
    scores.forEach(s => {
      if (!studentAggMap[s.student_id]) studentAggMap[s.student_id] = [];
      studentAggMap[s.student_id].push(+s.best_score);
    });
    const studentRankings = Object.entries(studentAggMap)
      .map(([sid, sc]) => {
        const st = students.find(s => s.id === sid);
        return { student_id: sid, name: st?.name, section: st?.section, avg: AVG(sc) };
      })
      .sort((a, b) => b.avg - a.avg);

    return {
      grade, sections, subjects, domains, competencies,
      total_students: students.length,
      total_assessed: Object.keys(studentAggMap).length,
      overall_avg: AVG(scores.map(s => +s.best_score)),
      studentRankings,
    };
  }

  async getSchoolDashboard(academic_year: string) {
    const scores = await this.scoreRepo.find({ where: { academic_year } });
    const students = await this.studentRepo.find({ where: { is_active: true } });

    // Grade averages
    const gradeMap: Record<string, number[]> = {};
    scores.forEach(s => {
      if (!s.grade) return;
      if (!gradeMap[s.grade]) gradeMap[s.grade] = [];
      gradeMap[s.grade].push(+s.best_score);
    });
    const grades = Object.entries(gradeMap)
      .sort((a, b) => {
        const na = parseInt(a[0].replace(/\D/g, '')) || 0;
        const nb = parseInt(b[0].replace(/\D/g, '')) || 0;
        return na - nb;
      })
      .map(([grade, sc]) => ({ grade, avg: AVG(sc) }));

    // Subject averages
    const subjectMap: Record<string, number[]> = {};
    scores.forEach(s => {
      if (!subjectMap[s.subject]) subjectMap[s.subject] = [];
      subjectMap[s.subject].push(+s.best_score);
    });
    const subjects = Object.entries(subjectMap).map(([subject, sc]) => ({
      subject, avg: AVG(sc),
    }));

    // Domain averages
    const domainMap: Record<string, number[]> = {};
    scores.forEach(s => {
      const key = s.domain || 'General';
      if (!domainMap[key]) domainMap[key] = [];
      domainMap[key].push(+s.best_score);
    });
    const domains = Object.entries(domainMap).map(([domain, sc]) => ({
      domain, avg: AVG(sc), count: sc.length,
    })).sort((a, b) => b.avg - a.avg);

    // Individual competency averages
    const competencyMap: Record<string, { scores: number[]; code: string; domain: string; subject: string }> = {};
    scores.forEach(s => {
      if (!competencyMap[s.competency_id]) {
        competencyMap[s.competency_id] = { scores: [], code: s.competency_code, domain: s.domain || 'General', subject: s.subject };
      }
      competencyMap[s.competency_id].scores.push(+s.best_score);
    });
    const competencies = Object.entries(competencyMap).map(([id, data]) => ({
      competency_id: id, competency_code: data.code, domain: data.domain, subject: normalizeSubject(data.subject),
      avg: AVG(data.scores), level: PCT_TO_LEVEL(AVG(data.scores) * 25), count: data.scores.length,
    })).sort((a, b) => b.avg - a.avg);

    // Level distribution
    const levelDist = { L1: 0, L2: 0, L3: 0, L4: 0 };
    const studentMap: Record<string, number[]> = {};
    scores.forEach(s => {
      if (!studentMap[s.student_id]) studentMap[s.student_id] = [];
      studentMap[s.student_id].push(+s.best_score);
    });
    Object.values(studentMap).forEach(sc => {
      const a = AVG(sc);
      if (a >= 3.5) levelDist.L4++;
      else if (a >= 2.5) levelDist.L3++;
      else if (a >= 1.5) levelDist.L2++;
      else levelDist.L1++;
    });

    return {
      total_students: students.length,
      assessed: Object.keys(studentMap).length,
      overall_avg: AVG(scores.map(s => +s.best_score)),
      grades, subjects, domains, competencies, levelDist,
    };
  }

  // ── LONGITUDINAL ACROSS ALL GRADES (Pre-KG → Grade 10) ───────
  // Tracks a student's competency journey across all academic years
  async getStudentLongitudinal(student_id: string) {
    const student = await this.studentRepo.findOne({ where: { id: student_id } });
    // Get ALL scores for this student across ALL academic years
    const allScores = await this.scoreRepo.find({
      where: { student_id },
      order: { last_updated: 'ASC' },
    });

    // Group by academic_year → subject → avg
    const byYear: Record<string, Record<string, number[]>> = {};
    allScores.forEach(s => {
      if (!byYear[s.academic_year]) byYear[s.academic_year] = {};
      if (!byYear[s.academic_year][s.subject]) byYear[s.academic_year][s.subject] = [];
      byYear[s.academic_year][s.subject].push(+s.best_score);
    });

    // Get all academic years and subjects
    const academicYears = Object.keys(byYear).sort();
    const subjects = [...new Set(allScores.map(s => s.subject))].sort();

    // Build timeline: each year → subject avg + overall avg
    const timeline = academicYears.map(year => {
      const yearScores = allScores.filter(s => s.academic_year === year);
      const point: any = { academic_year: year, grade: yearScores[0]?.grade || '' };
      subjects.forEach(sub => {
        const subScores = byYear[year]?.[sub] || [];
        point[sub] = subScores.length ? AVG(subScores) : null;
      });
      const allYearVals = yearScores.map(s => +s.best_score);
      point.overall = allYearVals.length ? AVG(allYearVals) : null;
      return point;
    });

    // Grade-wise overall avg (one point per grade)
    const byGrade: Record<string, number[]> = {};
    allScores.forEach(s => {
      if (!s.grade) return;
      if (!byGrade[s.grade]) byGrade[s.grade] = [];
      byGrade[s.grade].push(+s.best_score);
    });
    const gradeTimeline = Object.entries(byGrade)
      .sort((a, b) => {
        const na = parseInt(a[0].replace(/\D/g, '')) || 0;
        const nb = parseInt(b[0].replace(/\D/g, '')) || 0;
        return na - nb;
      })
      .map(([grade, scores]) => ({ grade, avg: AVG(scores), level: PCT_TO_LEVEL(AVG(scores) * 25) }));

    return { student, timeline, gradeTimeline, subjects, academicYears };
  }

  // ── COMPETENCY COVERAGE PER STUDENT ──────────────────────────
  async getStudentCoverage(student_id: string, academic_year: string) {
    const student = await this.studentRepo.findOne({ where: { id: student_id } });
    const scores = await this.scoreRepo.find({ where: { student_id, academic_year } });

    // Get all competencies for this student's grade
    const grade = student?.current_class;
    const allCompetencies = grade
      ? await this.competencyRepo.find({ where: { grade, is_active: true } })
      : [];

    const coveredIds = new Set(scores.map(s => s.competency_id));
    const covered = allCompetencies.filter(c => coveredIds.has(c.id));
    const uncovered = allCompetencies.filter(c => !coveredIds.has(c.id));

    // By subject
    const subjects = [...new Set(allCompetencies.map(c => c.subject))].sort();
    const bySubject = subjects.map(sub => {
      const total = allCompetencies.filter(c => c.subject === sub);
      const cov = covered.filter(c => c.subject === sub);
      const score = scores.filter(s => cov.some(c => c.id === s.competency_id));
      return {
        subject: sub,
        total: total.length,
        covered: cov.length,
        uncovered: total.length - cov.length,
        coverage_percent: total.length ? +((cov.length / total.length) * 100).toFixed(1) : 0,
        avg_score: score.length ? AVG(score.map(s => +s.best_score)) : 0,
      };
    });

    return {
      student,
      total: allCompetencies.length,
      covered: covered.length,
      uncovered: uncovered.length,
      coverage_percent: allCompetencies.length ? +((covered.length / allCompetencies.length) * 100).toFixed(1) : 0,
      covered_competencies: covered.map(c => {
        const s = scores.find(sc => sc.competency_id === c.id);
        return { ...c, best_score: s?.best_score, level: (s as any)?.best_rating, attempt_count: s?.attempt_count };
      }),
      uncovered_competencies: uncovered,
      bySubject,
    };
  }

  // ── SECTION COVERAGE ─────────────────────────────────────────
  async getSectionCoverage(grade: string, section: string, academic_year: string) {
    const students = await this.studentRepo
      .createQueryBuilder('s').where('LOWER(s.current_class) = LOWER(:grade)', { grade })
      .andWhere('LOWER(s.section) = LOWER(:section)', { section }).andWhere('s.is_active = true').getMany();
    const allCompetencies = await this.competencyRepo
      .createQueryBuilder('c').where('LOWER(c.grade) = LOWER(:grade)', { grade }).andWhere('c.is_active = true').getMany();
    const activities = await this.activityRepo
      .createQueryBuilder('a').where('LOWER(a.grade) = LOWER(:grade)', { grade })
      .andWhere('LOWER(a.section) = LOWER(:section)', { section })
      .andWhere('a.academic_year = :academic_year', { academic_year }).andWhere('a.is_active = true').getMany();

    // Which competencies have been assessed at least once via an activity
    const activityCoveredIds = new Set<string>();
    activities.forEach(a => { (a.competency_mappings as string[] || []).forEach(id => activityCoveredIds.add(id)); });

    const subjects = [...new Set(allCompetencies.map(c => c.subject))].sort();

    const bySubject = subjects.map(sub => {
      const total = allCompetencies.filter(c => c.subject === sub);
      const covered = total.filter(c => activityCoveredIds.has(c.id));
      return {
        subject: sub,
        total: total.length,
        covered: covered.length,
        uncovered: total.length - covered.length,
        coverage_percent: total.length ? +((covered.length / total.length) * 100).toFixed(1) : 0,
        covered_competencies: covered,
        uncovered_competencies: total.filter(c => !activityCoveredIds.has(c.id)),
      };
    });

    // Per-student coverage
    const scores = await this.scoreRepo.find({ where: { grade, section, academic_year } });
    const studentCoverage = students.map(st => {
      const studentScores = scores.filter(s => s.student_id === st.id);
      const coveredCount = new Set(studentScores.map(s => s.competency_id)).size;
      return {
        student_id: st.id,
        student_name: st.name,
        covered: coveredCount,
        total: allCompetencies.length,
        coverage_percent: allCompetencies.length ? +((coveredCount / allCompetencies.length) * 100).toFixed(1) : 0,
        avg_score: studentScores.length ? AVG(studentScores.map(s => +s.best_score)) : 0,
      };
    }).sort((a, b) => b.coverage_percent - a.coverage_percent);

    return {
      grade, section,
      total_competencies: allCompetencies.length,
      activity_covered: activityCoveredIds.size,
      activity_coverage_percent: allCompetencies.length ? +((activityCoveredIds.size / allCompetencies.length) * 100).toFixed(1) : 0,
      bySubject,
      studentCoverage,
    };
  }

  // ── CONSECUTIVE DECLINE ───────────────────────────────────────

  async getConsecutiveDeclineStudents(academic_year: string, grade?: string, section?: string) {
    const where: any = { academic_year, is_active: true };
    if (grade) where.grade = grade;
    if (section) where.section = section;
    const activities = await this.activityRepo.find({
      where,
      order: { activity_date: 'ASC', created_at: 'ASC' },
    });
    if (activities.length < 3) return [];

    const assessments = await this.assessmentRepo.find({ where: { academic_year } });

    // Group activities by grade+section
    const groupMap: Record<string, Activity[]> = {};
    activities.forEach(a => {
      const key = `${a.grade}__${a.section}`;
      if (!groupMap[key]) groupMap[key] = [];
      groupMap[key].push(a);
    });

    const declining: any[] = [];

    for (const [groupKey, groupActivities] of Object.entries(groupMap)) {
      if (groupActivities.length < 3) continue;
      const [grade, section] = groupKey.split('__');

      // Get unique students in this group
      const groupAssessments = assessments.filter(a =>
        groupActivities.some(act => act.id === a.activity_id)
      );
      const studentIds = [...new Set(groupAssessments.map(a => a.student_id))];

      for (const studentId of studentIds) {
        const activityAvgs: { name: string; avg: number; date: string }[] = [];

        for (const act of groupActivities) {
          const assessment = groupAssessments.find(a => a.activity_id === act.id && a.student_id === studentId);
          if (!(assessment as any)?.percentage) continue;
          activityAvgs.push({
            name: act.name,
            avg: +((assessment as any).percentage || 0),
            date: act.activity_date || '',
          });
        }

        if (activityAvgs.length < 3) continue;

        // Check for 3 consecutive declines
        for (let i = activityAvgs.length - 3; i >= 0; i--) {
          const a1 = activityAvgs[i].avg;
          const a2 = activityAvgs[i + 1].avg;
          const a3 = activityAvgs[i + 2].avg;
          if (a1 > a2 && a2 > a3) {
            const student = await this.studentRepo.findOne({ where: { id: studentId } });
            declining.push({
              student_id: studentId,
              student_name: student?.name || studentId,
              grade, section,
              scores: activityAvgs,
              decline_from: +a1.toFixed(2),
              decline_to: +a3.toFixed(2),
              drop: +(a1 - a3).toFixed(2),
            });
            break;
          }
        }
      }
    }

    return declining.sort((a, b) => b.drop - a.drop);
  }
}