import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaselineAssessment, EntityType, AssessmentRound, AssessmentStage } from '../assessments/entities/baseline-assessment.entity/baseline-assessment.entity';
import { Student } from '../students/entities/student.entity/student.entity';
import { User } from '../users/entities/user.entity/user.entity';
import { LearningLink } from '../assessments/entities/learning-link.entity/learning-link.entity';

@Injectable()
export class BaselineService {
  constructor(
    @InjectRepository(BaselineAssessment)
    private baselineRepo: Repository<BaselineAssessment>,
    @InjectRepository(Student)
    private studentRepo: Repository<Student>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(LearningLink)
    private learningLinkRepo: Repository<LearningLink>,
  ) {}

  getLevel(score: number): string {
    if (score >= 80) return 'Level 4 – Exceeding';
    if (score >= 60) return 'Level 3 – Meeting';
    if (score >= 40) return 'Level 2 – Approaching';
    return 'Level 1 – Beginning';
  }

  getGaps(data: any, subject: string): string[] {
    const gaps: string[] = [];
    if (subject === 'literacy') {
      if ((+data.listening_score || 0) < 60) gaps.push('Listening');
      if ((+data.speaking_score || 0) < 60) gaps.push('Speaking');
      if ((+data.reading_score || 0) < 60) gaps.push('Reading');
      if ((+data.writing_score || 0) < 60) gaps.push('Writing');
    } else {
      if ((+data.operations_score || 0) < 60) gaps.push('Operations');
      if ((+data.base10_score || 0) < 60) gaps.push('Base 10');
      if ((+data.measurement_score || 0) < 60) gaps.push('Measurement');
      if ((+data.geometry_score || 0) < 60) gaps.push('Geometry');
    }
    return gaps;
  }

  calculateTotals(data: any) {
    const lit = [+data.listening_score || 0, +data.speaking_score || 0,
      +data.reading_score || 0, +data.writing_score || 0];
    const num = [+data.operations_score || 0, +data.base10_score || 0,
      +data.measurement_score || 0, +data.geometry_score || 0];
    const litHasData = lit.some(s => s > 0);
    const numHasData = num.some(s => s > 0);
    const literacy_total = litHasData ? +(lit.reduce((a, b) => a + b, 0) / 4).toFixed(2) : undefined;
    const numeracy_total = numHasData ? +(num.reduce((a, b) => a + b, 0) / 4).toFixed(2) : undefined;
    const both = [literacy_total, numeracy_total].filter(t => t !== undefined) as number[];
    const overall_score = both.length > 0 ? +(both.reduce((a, b) => a + b, 0) / both.length).toFixed(2) : undefined;
    return { literacy_total, numeracy_total, overall_score };
  }

  buildAssessmentData(data: any, extra: any = {}) {
    const { literacy_total, numeracy_total, overall_score } = this.calculateTotals(data);
    const level = overall_score !== undefined ? this.getLevel(overall_score) : undefined;
    const litGaps = this.getGaps(data, 'literacy');
    const numGaps = this.getGaps(data, 'numeracy');
    return {
      ...extra,
      listening_score: data.listening_score || undefined,
      speaking_score: data.speaking_score || undefined,
      reading_score: data.reading_score || undefined,
      writing_score: data.writing_score || undefined,
      operations_score: data.operations_score || undefined,
      base10_score: data.base10_score || undefined,
      measurement_score: data.measurement_score || undefined,
      geometry_score: data.geometry_score || undefined,
      literacy_total,
      numeracy_total,
      overall_score,
      level,
      gaps: { literacy: litGaps, numeracy: numGaps } as object,
    };
  }

  async saveSectionBaseline(data: {
    grade: string;
    section: string;
    academic_year: string;
    round: AssessmentRound;
    assessment_date: string;
    assessments: any[];
  }) {
    const results = { success: 0, failed: 0 };
    for (const a of data.assessments) {
      try {
        const existing = await this.baselineRepo.findOne({
          where: {
            entity_id: a.student_id,
            entity_type: EntityType.STUDENT,
            academic_year: data.academic_year,
            round: data.round,
          }
        });
        const built = this.buildAssessmentData(a, {
          entity_type: EntityType.STUDENT,
          entity_id: a.student_id,
          entity_name: a.student_name,
          grade: data.grade,
          section: data.section,
          academic_year: data.academic_year,
          round: data.round,
          subject: 'literacy' as any,
          stage: (a.stage || AssessmentStage.FOUNDATION) as any,
          assessment_date: data.assessment_date,
        });
        if (existing) {
          await this.baselineRepo.update(existing.id, built as any);
        } else {
          await this.baselineRepo.save(this.baselineRepo.create(built as any));
        }
        results.success++;
      } catch { results.failed++; }
    }
    return results;
  }

  async getSectionBaseline(grade: string, section: string, academic_year: string, round: string) {
    const students = await this.studentRepo.find({
      where: { current_class: grade, section, is_active: true },
      order: { name: 'ASC' }
    });
    const assessments = await this.baselineRepo.find({
      where: { grade, section, academic_year, round: round as AssessmentRound, entity_type: EntityType.STUDENT }
    });
    return students.map(s => {
      const assessment = assessments.find(a => a.entity_id === s.id);
      return { student_id: s.id, student_name: s.name, admission_no: s.admission_no, assessment: assessment || null };
    });
  }

  async getSchoolDashboard(academic_year: string, round: string) {
    const assessments = await this.baselineRepo.find({
      where: { academic_year, round: round as AssessmentRound, entity_type: EntityType.STUDENT }
    });
    const totalStudents = await this.studentRepo.count({ where: { is_active: true } });
    const assessed = assessments.length;
    const pending = totalStudents - assessed;
    const avg = (arr: number[]) => arr.length ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : 0;
    const litScores = assessments.filter(a => a.literacy_total).map(a => +a.literacy_total);
    const numScores = assessments.filter(a => a.numeracy_total).map(a => +a.numeracy_total);
    const overallScores = assessments.filter(a => a.overall_score).map(a => +a.overall_score);
    const levelDist = { L1: 0, L2: 0, L3: 0, L4: 0 };
    assessments.forEach(a => {
      if (!a.overall_score) return;
      const s = +a.overall_score;
      if (s >= 80) levelDist.L4++;
      else if (s >= 60) levelDist.L3++;
      else if (s >= 40) levelDist.L2++;
      else levelDist.L1++;
    });

    // Grade-wise averages — literacy, numeracy, overall
    const gradeMap: Record<string, { lit: number[], num: number[], overall: number[] }> = {};
    assessments.forEach(a => {
      if (!a.grade) return;
      if (!gradeMap[a.grade]) gradeMap[a.grade] = { lit: [], num: [], overall: [] };
      if (a.literacy_total) gradeMap[a.grade].lit.push(+a.literacy_total);
      if (a.numeracy_total) gradeMap[a.grade].num.push(+a.numeracy_total);
      if (a.overall_score) gradeMap[a.grade].overall.push(+a.overall_score);
    });

    const gradeWise = Object.entries(gradeMap)
      .sort((a, b) => {
        const na = parseInt(a[0].replace(/\D/g, '')) || 0;
        const nb = parseInt(b[0].replace(/\D/g, '')) || 0;
        return na - nb;
      })
      .map(([grade, data]) => ({
        grade,
        literacyAvg: avg(data.lit),
        numeracyAvg: avg(data.num),
        overallAvg: avg(data.overall),
        count: data.overall.length,
      }));

    return {
      totalStudents, assessed, pending,
      literacyAvg: avg(litScores),
      numeracyAvg: avg(numScores),
      overallAvg: avg(overallScores),
      levelDist,
      gradeWise,
    };
  }

  async getGradeDashboard(grade: string, academic_year: string, round: string) {
    const assessments = await this.baselineRepo.find({
      where: { grade, academic_year, round: round as AssessmentRound, entity_type: EntityType.STUDENT }
    });
    const avg = (arr: number[]) => arr.length ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : 0;
    const sectionMap: Record<string, any[]> = {};
    assessments.forEach(a => {
      if (!a.section) return;
      if (!sectionMap[a.section]) sectionMap[a.section] = [];
      sectionMap[a.section].push(a);
    });
    const sections = Object.entries(sectionMap).map(([section, list]) => ({
      section,
      count: list.length,
      literacyAvg: avg(list.filter(a => a.literacy_total).map(a => +a.literacy_total)),
      numeracyAvg: avg(list.filter(a => a.numeracy_total).map(a => +a.numeracy_total)),
      overallAvg: avg(list.filter(a => a.overall_score).map(a => +a.overall_score)),
      atRisk: list.filter(a => a.overall_score && +a.overall_score < 40).length,
    }));

    // Grade-level averages
    const litScores = assessments.filter(a => a.literacy_total).map(a => +a.literacy_total);
    const numScores = assessments.filter(a => a.numeracy_total).map(a => +a.numeracy_total);
    const overallScores = assessments.filter(a => a.overall_score).map(a => +a.overall_score);

    return {
      grade,
      sections,
      totalAssessed: assessments.length,
      literacyAvg: avg(litScores),
      numeracyAvg: avg(numScores),
      overallAvg: avg(overallScores),
    };
  }

  async getStudentBaseline(student_id: string, academic_year: string) {
    const assessments = await this.baselineRepo.find({
      where: { entity_id: student_id, entity_type: EntityType.STUDENT, academic_year },
      order: { created_at: 'ASC' }
    });
    const student = await this.studentRepo.findOne({ where: { id: student_id } });
    return { student, assessments };
  }

  async saveTeacherBaseline(data: any) {
    const existing = await this.baselineRepo.findOne({
      where: {
        entity_id: data.teacher_id,
        entity_type: EntityType.TEACHER,
        academic_year: data.academic_year,
        round: data.round,
      }
    });
    const built = this.buildAssessmentData(data, {
      entity_type: EntityType.TEACHER,
      entity_id: data.teacher_id,
      entity_name: data.teacher_name,
      academic_year: data.academic_year,
      round: data.round,
      subject: data.subject as any,
      stage: data.stage as any,
      assessment_date: data.assessment_date,
    });
    if (existing) {
      await this.baselineRepo.update(existing.id, built as any);
      return this.baselineRepo.findOne({ where: { id: existing.id } });
    }
    return this.baselineRepo.save(this.baselineRepo.create(built as any));
  }

  async getTeacherBaseline(teacher_id: string, academic_year: string) {
    const assessments = await this.baselineRepo.find({
      where: { entity_id: teacher_id, entity_type: EntityType.TEACHER, academic_year }
    });
    const teacher = await this.userRepo.findOne({ where: { id: teacher_id } });
    return { teacher, assessments };
  }

  async getTeacherDashboard(academic_year: string, round: string) {
    const teachers = await this.userRepo.find({ where: { role: 'teacher' as any, is_active: true } });
    const assessments = await this.baselineRepo.find({
      where: { academic_year, round: round as AssessmentRound, entity_type: EntityType.TEACHER }
    });
    const avg = (arr: number[]) => arr.length ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : 0;

    const teacherList = teachers.map(t => {
      const assessment = assessments.find(a => a.entity_id === t.id);
      return { teacher_id: t.id, teacher_name: t.name, assessment: assessment || null };
    });

    const assessed = assessments.length;
    const pending = teachers.length - assessed;

    const levelDist = { L1: 0, L2: 0, L3: 0, L4: 0 };
    assessments.forEach(a => {
      if (!a.overall_score) return;
      const s = +a.overall_score;
      if (s >= 80) levelDist.L4++;
      else if (s >= 60) levelDist.L3++;
      else if (s >= 40) levelDist.L2++;
      else levelDist.L1++;
    });

    const domainAvgs = {
      Listening: avg(assessments.filter(a => a.listening_score).map(a => +a.listening_score)),
      Speaking: avg(assessments.filter(a => a.speaking_score).map(a => +a.speaking_score)),
      Reading: avg(assessments.filter(a => a.reading_score).map(a => +a.reading_score)),
      Writing: avg(assessments.filter(a => a.writing_score).map(a => +a.writing_score)),
      Operations: avg(assessments.filter(a => a.operations_score).map(a => +a.operations_score)),
      'Base 10': avg(assessments.filter(a => a.base10_score).map(a => +a.base10_score)),
      Measurement: avg(assessments.filter(a => a.measurement_score).map(a => +a.measurement_score)),
      Geometry: avg(assessments.filter(a => a.geometry_score).map(a => +a.geometry_score)),
    };
    const domainData = Object.entries(domainAvgs).map(([domain, score]) => ({ domain, score }));

    const stageMap: Record<string, number[]> = {};
    const stageAssessed: Record<string, number> = {};
    assessments.forEach(a => {
      const stage = a.stage || 'unknown';
      if (!stageMap[stage]) stageMap[stage] = [];
      if (a.overall_score) stageMap[stage].push(+a.overall_score);
      stageAssessed[stage] = (stageAssessed[stage] || 0) + 1;
    });
    const stageData = ['foundation', 'preparatory', 'middle', 'secondary'].map(stage => ({
      stage: stage.charAt(0).toUpperCase() + stage.slice(1),
      avg: avg(stageMap[stage] || []),
      assessed: stageAssessed[stage] || 0,
    }));

    const litScores = assessments.filter(a => a.literacy_total).map(a => +a.literacy_total);
    const numScores = assessments.filter(a => a.numeracy_total).map(a => +a.numeracy_total);
    const overallScores = assessments.filter(a => a.overall_score).map(a => +a.overall_score);

    // Bar chart data for literacy, numeracy, overall per teacher
    const teacherBarData = teachers.map(t => {
      const a = assessments.find(x => x.entity_id === t.id);
      return {
        name: t.name.split(' ')[0],
        fullName: t.name,
        literacy: a?.literacy_total ? +(+a.literacy_total).toFixed(1) : 0,
        numeracy: a?.numeracy_total ? +(+a.numeracy_total).toFixed(1) : 0,
        overall: a?.overall_score ? +(+a.overall_score).toFixed(1) : 0,
      };
    }).filter(t => t.overall > 0);

    return {
      teacherList,
      totalTeachers: teachers.length,
      assessed, pending,
      literacyAvg: avg(litScores),
      numeracyAvg: avg(numScores),
      overallAvg: avg(overallScores),
      levelDist,
      domainData,
      stageData,
      teacherBarData,
    };
  }

  // ── CONSECUTIVE DECLINE ALERTS ─────────────────────────────

  async getConsecutiveDeclineStudents(academic_year?: string) {
    // Get all student assessments ordered by created_at
    const query = this.baselineRepo.createQueryBuilder('b')
      .where('b.entity_type = :type', { type: EntityType.STUDENT })
      .orderBy('b.entity_id', 'ASC')
      .addOrderBy('b.created_at', 'ASC');
    if (academic_year) query.andWhere('b.academic_year = :ay', { ay: academic_year });
    const all = await query.getMany();

    // Group by student
    const studentMap: Record<string, any[]> = {};
    all.forEach(a => {
      if (!studentMap[a.entity_id]) studentMap[a.entity_id] = [];
      studentMap[a.entity_id].push(a);
    });

    const declining: any[] = [];
    Object.entries(studentMap).forEach(([id, assessments]) => {
      if (assessments.length < 3) return;
      // Check last 3 consecutive
      for (let i = assessments.length - 3; i >= 0; i--) {
        const a1 = +assessments[i].overall_score || 0;
        const a2 = +assessments[i + 1].overall_score || 0;
        const a3 = +assessments[i + 2].overall_score || 0;
        if (a1 > 0 && a2 > 0 && a3 > 0 && a1 > a2 && a2 > a3) {
          declining.push({
            entity_id: id,
            entity_name: assessments[0].entity_name,
            grade: assessments[0].grade,
            section: assessments[0].section,
            scores: assessments.map(a => ({
              round: a.round,
              academic_year: a.academic_year,
              overall: +(+a.overall_score).toFixed(1),
              literacy: a.literacy_total ? +(+a.literacy_total).toFixed(1) : null,
              numeracy: a.numeracy_total ? +(+a.numeracy_total).toFixed(1) : null,
              date: a.assessment_date,
            })),
            decline_from: +a1.toFixed(1),
            decline_to: +a3.toFixed(1),
            drop: +(a1 - a3).toFixed(1),
          });
          break;
        }
      }
    });

    return declining.sort((a, b) => b.drop - a.drop);
  }

  async getConsecutiveDeclineTeachers(academic_year?: string) {
    const query = this.baselineRepo.createQueryBuilder('b')
      .where('b.entity_type = :type', { type: EntityType.TEACHER })
      .orderBy('b.entity_id', 'ASC')
      .addOrderBy('b.created_at', 'ASC');
    if (academic_year) query.andWhere('b.academic_year = :ay', { ay: academic_year });
    const all = await query.getMany();

    const teacherMap: Record<string, any[]> = {};
    all.forEach(a => {
      if (!teacherMap[a.entity_id]) teacherMap[a.entity_id] = [];
      teacherMap[a.entity_id].push(a);
    });

    const declining: any[] = [];
    Object.entries(teacherMap).forEach(([id, assessments]) => {
      if (assessments.length < 3) return;
      for (let i = assessments.length - 3; i >= 0; i--) {
        const a1 = +assessments[i].overall_score || 0;
        const a2 = +assessments[i + 1].overall_score || 0;
        const a3 = +assessments[i + 2].overall_score || 0;
        if (a1 > 0 && a2 > 0 && a3 > 0 && a1 > a2 && a2 > a3) {
          declining.push({
            entity_id: id,
            entity_name: assessments[0].entity_name,
            scores: assessments.map(a => ({
              round: a.round,
              academic_year: a.academic_year,
              overall: +(+a.overall_score).toFixed(1),
              literacy: a.literacy_total ? +(+a.literacy_total).toFixed(1) : null,
              numeracy: a.numeracy_total ? +(+a.numeracy_total).toFixed(1) : null,
            })),
            decline_from: +a1.toFixed(1),
            decline_to: +a3.toFixed(1),
            drop: +(a1 - a3).toFixed(1),
          });
          break;
        }
      }
    });

    return declining.sort((a, b) => b.drop - a.drop);
  }
}