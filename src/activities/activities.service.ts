import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Activity } from './entities/activity.entity/activity.entity';
import { ActivityAssessment } from './entities/activity-assessment.entity/activity-assessment.entity';
import { StudentCompetencyScore } from './entities/student-competency-score.entity/student-competency-score.entity';
import { CompetencyFramework } from '../competencies/entities/competency-framework.entity/competency-framework.entity';
import { Student } from '../students/entities/student.entity/student.entity';
import * as XLSX from 'xlsx';

const RATING_TO_SCORE: Record<string, number> = {
  beginning: 1, approaching: 2, meeting: 3, exceeding: 4,
};

const SCORE_TO_RATING = (score: number): string => {
  if (score >= 3.5) return 'Exceeding';
  if (score >= 2.5) return 'Meeting';
  if (score >= 1.5) return 'Approaching';
  if (score > 0) return 'Beginning';
  return '—';
};

const SCORE_TO_LEVEL = (score: number): string => {
  if (score >= 3.5) return 'Level 4 – Exceeding';
  if (score >= 2.5) return 'Level 3 – Meeting';
  if (score >= 1.5) return 'Level 2 – Approaching';
  return 'Level 1 – Beginning';
};

const AVG = (arr: number[]) =>
  arr.length ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2) : 0;

@Injectable()
export class ActivitiesService {
  constructor(
    @InjectRepository(Activity) private activityRepo: Repository<Activity>,
    @InjectRepository(ActivityAssessment) private assessmentRepo: Repository<ActivityAssessment>,
    @InjectRepository(StudentCompetencyScore) private scoreRepo: Repository<StudentCompetencyScore>,
    @InjectRepository(CompetencyFramework) private competencyRepo: Repository<CompetencyFramework>,
    @InjectRepository(Student) private studentRepo: Repository<Student>,
  ) {}

  // ── COMPETENCY MANAGEMENT ─────────────────────────────────────

  async getCompetencies(filters: { subject?: string; stage?: string; grade?: string; search?: string }) {
    const query = this.competencyRepo.createQueryBuilder('c').where('c.is_active = true');
    if (filters.subject) query.andWhere('c.subject = :subject', { subject: filters.subject });
    if (filters.stage) query.andWhere('c.stage = :stage', { stage: filters.stage });
    if (filters.grade) query.andWhere('c.grade = :grade', { grade: filters.grade });
    if (filters.search) query.andWhere('(c.competency_code ILIKE :s OR c.description ILIKE :s)', { s: `%${filters.search}%` });
    return query.orderBy('c.subject', 'ASC').addOrderBy('c.grade', 'ASC').addOrderBy('c.domain', 'ASC').getMany();
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
      subject: data.subject, stage: data.stage, grade: data.grade,
      domain: data.domain, competency_code: data.competency_code,
      description: data.description, is_active: true,
    });
    return this.competencyRepo.save(comp);
  }

  async updateCompetency(id: string, data: any) {
    await this.competencyRepo.update(id, {
      subject: data.subject, stage: data.stage, grade: data.grade,
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
    if (data.apply_to_all_sections && data.grade) {
      const students = await this.studentRepo
        .createQueryBuilder('s').select('DISTINCT s.section', 'section')
        .where('s.current_class = :grade', { grade: data.grade })
        .andWhere('s.is_active = true').getRawMany();
      const sections = students.map((s: any) => s.section).filter(Boolean).sort();
      for (const section of sections) {
        const activity = this.activityRepo.create({
          name: data.name, description: data.description, subject: data.subject,
          stage: data.stage, grade: data.grade, section,
          academic_year: data.academic_year || '2025-26',
          activity_type: data.activity_type, activity_date: data.activity_date,
          competency_mappings: data.competency_mappings || [], created_by: data.created_by,
        });
        const saved = await this.activityRepo.save(activity);
        created.push(saved);
      }
      return { created_count: created.length, activities: created };
    }
    const activity = this.activityRepo.create({
      name: data.name, description: data.description, subject: data.subject,
      stage: data.stage, grade: data.grade, section: data.section,
      academic_year: data.academic_year || '2025-26',
      activity_type: data.activity_type, activity_date: data.activity_date,
      competency_mappings: data.competency_mappings || [], created_by: data.created_by,
    });
    const saved = await this.activityRepo.save(activity);
    return { created_count: 1, activities: [saved] };
  }

  async getActivities(filters: {
    grade?: string; section?: string; subject?: string;
    academic_year?: string; stage?: string;
  }) {
    const query = this.activityRepo.createQueryBuilder('a').where('a.is_active = true');
    if (filters.grade) query.andWhere('a.grade = :grade', { grade: filters.grade });
    if (filters.section) query.andWhere('a.section = :section', { section: filters.section });
    if (filters.subject) query.andWhere('a.subject = :subject', { subject: filters.subject });
    if (filters.academic_year) query.andWhere('a.academic_year = :ay', { ay: filters.academic_year });
    if (filters.stage) query.andWhere('a.stage = :stage', { stage: filters.stage });
    return query.orderBy('a.activity_date', 'DESC').addOrderBy('a.created_at', 'DESC').getMany();
  }

  async getActivityById(id: string) {
    return this.activityRepo.findOne({ where: { id, is_active: true } });
  }

  async updateActivity(id: string, data: any) {
    await this.activityRepo.update(id, {
      name: data.name, description: data.description, subject: data.subject,
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
    const students = await this.studentRepo.find({
      where: { current_class: activity.grade, section: activity.section, is_active: true },
      order: { name: 'ASC' },
    });
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
    const results = { saved: 0, failed: 0 };
    for (const entry of entries) {
      try {
        const existing = await this.assessmentRepo.findOne({
          where: { activity_id, student_id: entry.student_id, academic_year },
        });
        const ratings = entry.competency_ratings || {};
        const ratingValues = Object.values(ratings).map((r: any) => RATING_TO_SCORE[r] || 0).filter(v => v > 0);
        const overallScore = ratingValues.length ? AVG(ratingValues) : 0;
        const overallRating = SCORE_TO_RATING(overallScore);
        if (existing) {
          await this.assessmentRepo.update(existing.id, {
            competency_ratings: ratings, overall_rating: overallRating, is_complete: true,
          });
        } else {
          await this.assessmentRepo.save(this.assessmentRepo.create({
            activity_id, student_id: entry.student_id, student_name: entry.student_name,
            grade: activity.grade, section: activity.section, academic_year,
            competency_ratings: ratings, overall_rating: overallRating, is_complete: true,
          }));
        }
        // Update StudentCompetencyScore for each competency
        for (const [competency_id, rating] of Object.entries(ratings)) {
          const score = RATING_TO_SCORE[rating as string] || 0;
          if (!score) continue;
          const competency = await this.competencyRepo.findOne({ where: { id: competency_id } });
          if (!competency) continue;
          const existing_score = await this.scoreRepo.findOne({
            where: { student_id: entry.student_id, competency_id, academic_year },
          });
          if (existing_score) {
            // Average across all activities
            const allAssessments = await this.assessmentRepo.find({
              where: { student_id: entry.student_id, academic_year },
            });
            const allScores: number[] = [];
            for (const a of allAssessments) {
              const r = (a.competency_ratings as any)?.[competency_id];
              if (r) allScores.push(RATING_TO_SCORE[r] || 0);
            }
            const avgScore = allScores.length ? AVG(allScores) : score;
            await this.scoreRepo.update(existing_score.id, {
              best_score: avgScore, best_rating: SCORE_TO_RATING(avgScore),
              attempt_count: allScores.length,
            });
          } else {
            await this.scoreRepo.save(this.scoreRepo.create({
              student_id: entry.student_id, student_name: entry.student_name,
              grade: activity.grade, section: activity.section, academic_year,
              competency_id, competency_code: competency.competency_code,
              subject: competency.subject, domain: competency.domain,
              best_score: score, best_rating: rating as string, attempt_count: 1,
            }));
          }
        }
        results.saved++;
      } catch (e) { results.failed++; }
    }
    return results;
  }

  async getCombinedMarks(grade: string, section: string, subject: string, academic_year: string) {
    // Get all activities for this grade/section/subject — newest first (for table display)
    const activities = await this.activityRepo.find({
      where: { grade, section, subject, academic_year, is_active: true },
      order: { activity_date: 'DESC', created_at: 'DESC' },
    });

    const students = await this.studentRepo.find({
      where: { current_class: grade, section, is_active: true },
      order: { name: 'ASC' },
    });

    const competencies = await this.competencyRepo.find({
      where: { grade, subject, is_active: true },
      order: { domain: 'ASC', competency_code: 'ASC' },
    });

    // Get all assessments for these activities
    const activityIds = activities.map(a => a.id);
    const assessments = activityIds.length
      ? await this.assessmentRepo
          .createQueryBuilder('aa')
          .where('aa.activity_id IN (:...ids)', { ids: activityIds })
          .andWhere('aa.academic_year = :ay', { ay: academic_year })
          .getMany()
      : [];

    // Build student rows with per-activity ratings and competency averages
    const studentRows = students.map(student => {
      const activityData: Record<string, any> = {};
      activities.forEach(act => {
        const assessment = assessments.find(a => a.activity_id === act.id && a.student_id === student.id);
        activityData[act.id] = assessment?.competency_ratings || null;
      });

      // Compute average score per competency across all activities
      const competencyAvgs: Record<string, { avg: number; rating: string; count: number }> = {};
      competencies.forEach(comp => {
        const scores: number[] = [];
        activities.forEach(act => {
          const ratings = activityData[act.id] as Record<string, string> | null;
          const r = ratings?.[comp.id];
          if (r && RATING_TO_SCORE[r]) scores.push(RATING_TO_SCORE[r]);
        });
        if (scores.length) {
          const avg = AVG(scores);
          competencyAvgs[comp.id] = { avg, rating: SCORE_TO_RATING(avg), count: scores.length };
        }
      });

      // Domain averages
      const domainMap: Record<string, number[]> = {};
      competencies.forEach(comp => {
        const data = competencyAvgs[comp.id];
        if (!data) return;
        const d = comp.domain || 'General';
        if (!domainMap[d]) domainMap[d] = [];
        domainMap[d].push(data.avg);
      });
      const domainAvgs: Record<string, number> = {};
      Object.entries(domainMap).forEach(([d, vals]) => { domainAvgs[d] = AVG(vals); });

      // Overall average
      const allVals = Object.values(competencyAvgs).map(c => c.avg);
      const overallAvg = allVals.length ? AVG(allVals) : 0;

      return {
        student_id: student.id,
        student_name: student.name,
        roll_number: student.admission_no,
        activity_data: activityData,
        competency_avgs: competencyAvgs,
        domain_avgs: domainAvgs,
        overall_avg: overallAvg,
        overall_rating: SCORE_TO_RATING(overallAvg),
        overall_level: SCORE_TO_LEVEL(overallAvg),
      };
    });

    return {
      activities, // newest first
      competencies,
      students: studentRows,
      domains: [...new Set(competencies.map(c => c.domain || 'General'))].sort(),
    };
  }

  async getCompetencyCoverage(grade: string, subject: string, academic_year: string) {
    const competencies = await this.competencyRepo.find({ where: { grade, subject, is_active: true } });
    const activities = await this.activityRepo.find({ where: { grade, subject, academic_year, is_active: true } });
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
    return this.getCompetencyCoverage(grade, subject, academic_year);
  }

  // ── SUBJECTS FOR GRADE ────────────────────────────────────────

  async getSubjectsForGrade(grade: string) {
    const result = await this.competencyRepo
      .createQueryBuilder('c').select('DISTINCT c.subject', 'subject')
      .where('c.grade = :grade', { grade }).andWhere('c.is_active = true').getRawMany();
    return result.map((r: any) => r.subject).sort();
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
      return { subject, avg, level: SCORE_TO_LEVEL(avg), competency_count: subScores.length };
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
      return { subject, domain, avg, level: SCORE_TO_LEVEL(avg), count: domScores.length };
    });

    // Individual competency scores
    const competencyScores = scores.map(s => ({
      competency_id: s.competency_id,
      competency_code: s.competency_code,
      domain: s.domain || 'General',
      subject: s.subject,
      avg: +s.best_score,
      rating: s.best_rating,
      level: SCORE_TO_LEVEL(+s.best_score),
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
        row[cid] = sc?.best_rating || null;
      });
      const a = studentScores.length ? AVG(studentScores.map(s => +s.best_score)) : 0;
      row.overall_avg = +a.toFixed(2);
      row.level = SCORE_TO_LEVEL(a);
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
        avg: +a.toFixed(2), level: SCORE_TO_LEVEL(a),
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
    const scores = await this.scoreRepo.find({ where: { grade, academic_year } });
    const students = await this.studentRepo.find({ where: { current_class: grade, is_active: true } });

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
      competency_id: id, competency_code: data.code, domain: data.domain, subject: data.subject,
      avg: AVG(data.scores), level: SCORE_TO_LEVEL(AVG(data.scores)),
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
      competency_id: id, competency_code: data.code, domain: data.domain, subject: data.subject,
      avg: AVG(data.scores), level: SCORE_TO_LEVEL(AVG(data.scores)), count: data.scores.length,
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

  // ── CONSECUTIVE DECLINE ───────────────────────────────────────

  async getConsecutiveDeclineStudents(academic_year: string) {
    const activities = await this.activityRepo.find({
      where: { academic_year, is_active: true },
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
          if (!assessment?.competency_ratings) continue;
          const ratings = assessment.competency_ratings as Record<string, string>;
          const vals = Object.values(ratings).map(r => RATING_TO_SCORE[r] || 0).filter(v => v > 0);
          if (!vals.length) continue;
          activityAvgs.push({
            name: act.name,
            avg: AVG(vals),
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