import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { BaselineAssessment, EntityType, AssessmentRound, AssessmentStage, AssessmentSubject } from '../assessments/entities/baseline-assessment.entity/baseline-assessment.entity';
import { BaselineConfig } from '../assessments/entities/baseline-assessment.entity/baseline-config.entity';
import { Student } from '../students/entities/student.entity/student.entity';
import { User } from '../users/entities/user.entity/user.entity';

@Injectable()
export class BaselineService {
  constructor(
    @InjectRepository(BaselineAssessment)
    private baselineRepo: Repository<BaselineAssessment>,
    @InjectRepository(BaselineConfig)
    private configRepo: Repository<BaselineConfig>,
    @InjectRepository(Student)
    private studentRepo: Repository<Student>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
  ) {}

  // ── Config (thresholds + lock, per year/round/grade/section) ────

  async getConfig(academic_year: string, round: string, grade?: string, section?: string): Promise<BaselineConfig> {
    const g = grade || null;
    const s = section || null;
    const existing = await this.configRepo.findOne({
      where: { academic_year, round, grade: g === null ? IsNull() : g, section: s === null ? IsNull() : s },
    });
    if (existing) return existing;
    return this.configRepo.create({ academic_year, round, grade: g, section: s, gap_threshold: 60, promotion_threshold: 80, is_locked: false });
  }

  async upsertConfig(body: {
    academic_year: string;
    round: string;
    grade?: string | null;
    section?: string | null;
    gap_threshold?: number;
    promotion_threshold?: number;
    is_locked?: boolean;
  }): Promise<BaselineConfig> {
    const g = body.grade ?? null;
    const s = body.section ?? null;
    let record = await this.configRepo.findOne({
      where: { academic_year: body.academic_year, round: body.round, grade: g === null ? IsNull() : g, section: s === null ? IsNull() : s },
    });
    if (!record) {
      record = this.configRepo.create({ academic_year: body.academic_year, round: body.round, grade: g, section: s, gap_threshold: 60, promotion_threshold: 80, is_locked: false });
    }
    if (body.gap_threshold !== undefined) record.gap_threshold = body.gap_threshold;
    if (body.promotion_threshold !== undefined) record.promotion_threshold = body.promotion_threshold;
    if (body.is_locked !== undefined) record.is_locked = body.is_locked;
    return this.configRepo.save(record);
  }

  // ── Core calculation helpers ────────────────────────────────────

  /** Convert raw scores → percentages using max_marks */
  calcPct(scores: Record<string, number>, maxMarks: Record<string, number>): Record<string, number> {
    const pct: Record<string, number> = {};
    for (const [domain, raw] of Object.entries(scores)) {
      if (raw < 0) continue;
      const max = maxMarks[domain];
      if (max && max > 0) {
        pct[domain] = +Math.min(100, (raw / max) * 100).toFixed(2);
      } else {
        // No max mark defined — treat raw as percentage directly, cap at 100
        pct[domain] = +Math.min(100, raw).toFixed(2);
      }
    }
    return pct;
  }

  /** Average of all values in a pct object */
  avgPct(pct: Record<string, number>): number | undefined {
    const vals = Object.values(pct).filter(v => v !== null && v !== undefined && !isNaN(v));
    if (!vals.length) return undefined;
    return +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2);
  }

  /** Calculate totals from raw scores + max marks */
  calculateTotals(
    literacyScores: Record<string, number>,
    numeracyScores: Record<string, number>,
    maxMarks: Record<string, number>,
  ): {
    literacy_pct: Record<string, number>;
    numeracy_pct: Record<string, number>;
    literacy_total: number | undefined;
    numeracy_total: number | undefined;
    overall_score: number | undefined;
  } {
    const literacy_pct = literacyScores && Object.keys(literacyScores).length
      ? this.calcPct(literacyScores, maxMarks) : {};
    const numeracy_pct = numeracyScores && Object.keys(numeracyScores).length
      ? this.calcPct(numeracyScores, maxMarks) : {};

    const literacy_total = Object.keys(literacy_pct).length ? this.avgPct(literacy_pct) : undefined;
    const numeracy_total = Object.keys(numeracy_pct).length ? this.avgPct(numeracy_pct) : undefined;

    const both = [literacy_total, numeracy_total].filter(t => t !== undefined) as number[];
    const overall_score = both.length > 0
      ? +(both.reduce((a, b) => a + b, 0) / both.length).toFixed(2)
      : undefined;

    return { literacy_pct, numeracy_pct, literacy_total, numeracy_total, overall_score };
  }

  /** Assign level from overall % */
  getLevel(score: number): string {
    if (score >= 80) return 'Level 4 – Exceeding';
    if (score >= 60) return 'Level 3 – Meeting';
    if (score >= 40) return 'Level 2 – Approaching';
    return 'Level 1 – Beginning';
  }

  /** Identify gaps — domains below 60% */
  getGaps(literacyPct: Record<string, number>, numeracyPct: Record<string, number>): object {
    const litGaps = Object.entries(literacyPct).filter(([, v]) => v < 60).map(([k]) => k);
    const numGaps = Object.entries(numeracyPct).filter(([, v]) => v < 60).map(([k]) => k);
    return { literacy: litGaps, numeracy: numGaps };
  }

  /** Check promotion */
  getPromotion(overallScore: number, stage: string): { promoted: boolean; promoted_to_stage: string | null } {
    const promoted = overallScore >= 80;
    const STAGE_ORDER = ['foundation', 'preparatory', 'middle', 'secondary'];
    const idx = STAGE_ORDER.indexOf(stage);
    const promoted_to_stage = promoted && idx >= 0 && idx < 3 ? STAGE_ORDER[idx + 1] : null;
    return { promoted, promoted_to_stage };
  }


  // ── Save section baseline (admin entry) ────────────────────────
  async saveSectionBaseline(data: {
    grade: string;
    section: string;
    academic_year: string;
    round: string;
    assessment_date: string;
    assessments: Array<{
      student_id: string;
      student_name: string;
      stage?: string;
      literacy_scores: Record<string, number>;
      numeracy_scores: Record<string, number>;
      max_marks: Record<string, number>;
    }>;
  }) {
    const results = { success: 0, failed: 0 };
    const round = data.round as AssessmentRound;
    const stage = (data.assessments[0]?.stage || 'foundation') as AssessmentStage;

    for (const a of data.assessments) {
      try {
        const existing = await this.baselineRepo.findOne({
          where: { entity_id: a.student_id, entity_type: EntityType.STUDENT, academic_year: data.academic_year, round },
        });

        // Preserve existing max_marks if none provided in this save
        const incomingMax = a.max_marks || {};
        const hasMaxMarks = Object.values(incomingMax).some(v => v > 0);
        const effectiveMax = hasMaxMarks ? incomingMax : ((existing?.max_marks as any) || {});

        const { literacy_pct, numeracy_pct, literacy_total, numeracy_total, overall_score } =
          this.calculateTotals(a.literacy_scores || {}, a.numeracy_scores || {}, effectiveMax);

        const level = overall_score !== undefined ? this.getLevel(overall_score) : undefined;
        const gaps = this.getGaps(literacy_pct, numeracy_pct);
        const { promoted, promoted_to_stage } = overall_score !== undefined
          ? this.getPromotion(overall_score, a.stage || 'foundation')
          : { promoted: false, promoted_to_stage: null };

        const record: any = {
          entity_type: EntityType.STUDENT,
          entity_id: a.student_id,
          entity_name: a.student_name,
          grade: data.grade,
          section: data.section,
          academic_year: data.academic_year,
          round,
          subject: AssessmentSubject.LITERACY,
          stage: (a.stage || stage) as AssessmentStage,
          assessment_date: data.assessment_date,
          literacy_scores: a.literacy_scores || {},
          numeracy_scores: a.numeracy_scores || {},
          max_marks: effectiveMax,
          literacy_pct,
          numeracy_pct,
          literacy_total,
          numeracy_total,
          overall_score,
          level,
          gaps,
          promoted,
          promoted_to_stage,
        };

        if (existing) {
          await this.baselineRepo.update(existing.id, record);
        } else {
          await this.baselineRepo.save(this.baselineRepo.create(record));
        }
        results.success++;
      } catch (e) {
        results.failed++;
      }
    }
    return results;
  }

  // ── Get section baseline for display ───────────────────────────
  async getSectionBaseline(grade: string, section: string, academic_year: string, round: string) {
    const students = await this.studentRepo
      .createQueryBuilder('student')
      .where('LOWER(student.current_class) = LOWER(:grade)', { grade })
      .andWhere('LOWER(student.section) = LOWER(:section)', { section })
      .andWhere('student.is_active = :active', { active: true })
      .orderBy('student.name', 'ASC')
      .getMany();

    const assessments = await this.baselineRepo.find({
      where: { grade, section, academic_year, round: round as AssessmentRound, entity_type: EntityType.STUDENT },
    });

    return students.map(s => {
      const assessment = assessments.find(a => a.entity_id === s.id);
      return { student_id: s.id, student_name: s.name, admission_no: s.admission_no, assessment: assessment || null };
    });
  }

  // ── School dashboard ───────────────────────────────────────────
  async getSchoolDashboard(academic_year: string, round: string) {
    const assessments = await this.baselineRepo.find({
      where: { academic_year, round: round as AssessmentRound, entity_type: EntityType.STUDENT },
    });

    const totalStudents = await this.studentRepo.count({ where: { is_active: true } });
    const assessed = assessments.length;
    const avg = (arr: number[]) => arr.length ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : 0;

    const litScores = assessments.filter(a => a.literacy_total != null).map(a => +a.literacy_total);
    const numScores = assessments.filter(a => a.numeracy_total != null).map(a => +a.numeracy_total);
    const overallScores = assessments.filter(a => a.overall_score != null).map(a => +a.overall_score);

    const levelDist = { L1: 0, L2: 0, L3: 0, L4: 0 };
    assessments.forEach(a => {
      if (!a.overall_score) return;
      const s = +a.overall_score;
      if (s >= 80) levelDist.L4++;
      else if (s >= 60) levelDist.L3++;
      else if (s >= 40) levelDist.L2++;
      else levelDist.L1++;
    });

    // Grade-wise averages
    const gradeMap: Record<string, { lit: number[], num: number[], overall: number[] }> = {};
    assessments.forEach(a => {
      if (!a.grade) return;
      if (!gradeMap[a.grade]) gradeMap[a.grade] = { lit: [], num: [], overall: [] };
      if (a.literacy_total != null) gradeMap[a.grade].lit.push(+a.literacy_total);
      if (a.numeracy_total != null) gradeMap[a.grade].num.push(+a.numeracy_total);
      if (a.overall_score != null) gradeMap[a.grade].overall.push(+a.overall_score);
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
        atRisk: data.overall.filter(s => s < 40).length,
      }));

    // Domain gaps across school
    const allLitGaps: Record<string, number> = {};
    const allNumGaps: Record<string, number> = {};
    assessments.forEach(a => {
      const gaps = a.gaps as any;
      (gaps?.literacy || []).forEach((d: string) => { allLitGaps[d] = (allLitGaps[d] || 0) + 1; });
      (gaps?.numeracy || []).forEach((d: string) => { allNumGaps[d] = (allNumGaps[d] || 0) + 1; });
    });

    return {
      totalStudents,
      assessed,
      pending: totalStudents - assessed,
      literacyAvg: avg(litScores),
      numeracyAvg: avg(numScores),
      overallAvg: avg(overallScores),
      levelDist,
      gradeWise,
      topLiteracyGaps: Object.entries(allLitGaps).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([domain, count]) => ({ domain, count })),
      topNumeracyGaps: Object.entries(allNumGaps).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([domain, count]) => ({ domain, count })),
    };
  }

  // ── Grade dashboard ────────────────────────────────────────────
  async getGradeDashboard(grade: string, academic_year: string, round: string) {
    const assessments = await this.baselineRepo.find({
      where: { grade, academic_year, round: round as AssessmentRound, entity_type: EntityType.STUDENT },
    });

    const avg = (arr: number[]) => arr.length ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : 0;

    // Section breakdown
    const sectionMap: Record<string, { lit: number[], num: number[], overall: number[] }> = {};
    assessments.forEach(a => {
      const sec = a.section || 'Unknown';
      if (!sectionMap[sec]) sectionMap[sec] = { lit: [], num: [], overall: [] };
      if (a.literacy_total != null) sectionMap[sec].lit.push(+a.literacy_total);
      if (a.numeracy_total != null) sectionMap[sec].num.push(+a.numeracy_total);
      if (a.overall_score != null) sectionMap[sec].overall.push(+a.overall_score);
    });

    const sections = Object.entries(sectionMap).map(([section, data]) => ({
      section,
      count: data.overall.length,
      literacyAvg: avg(data.lit),
      numeracyAvg: avg(data.num),
      overallAvg: avg(data.overall),
      atRisk: data.overall.filter(s => s < 40).length,
    })).sort((a, b) => b.overallAvg - a.overallAvg);

    const litScores = assessments.filter(a => a.literacy_total != null).map(a => +a.literacy_total);
    const numScores = assessments.filter(a => a.numeracy_total != null).map(a => +a.numeracy_total);
    const overallScores = assessments.filter(a => a.overall_score != null).map(a => +a.overall_score);

    // Domain breakdown — aggregate pct per domain across grade
    const litDomains: Record<string, number[]> = {};
    const numDomains: Record<string, number[]> = {};
    assessments.forEach(a => {
      if (a.literacy_pct) Object.entries(a.literacy_pct).forEach(([d, v]) => {
        if (!litDomains[d]) litDomains[d] = [];
        litDomains[d].push(+v);
      });
      if (a.numeracy_pct) Object.entries(a.numeracy_pct).forEach(([d, v]) => {
        if (!numDomains[d]) numDomains[d] = [];
        numDomains[d].push(+v);
      });
    });

    return {
      grade,
      totalAssessed: assessments.length,
      literacyAvg: avg(litScores),
      numeracyAvg: avg(numScores),
      overallAvg: avg(overallScores),
      sections,
      literacyDomains: Object.entries(litDomains).map(([domain, vals]) => ({ domain, avg: avg(vals) })),
      numeracyDomains: Object.entries(numDomains).map(([domain, vals]) => ({ domain, avg: avg(vals) })),
    };
  }

  // ── Student baseline ───────────────────────────────────────────
  async getStudentBaseline(student_id: string, academic_year: string) {
    const assessments = await this.baselineRepo.find({
      where: { entity_id: student_id, entity_type: EntityType.STUDENT, academic_year },
      order: { round: 'ASC' },
    });
    const student = await this.studentRepo.findOne({ where: { id: student_id } });
    return { student, assessments };
  }

  // ── Teacher baseline save ──────────────────────────────────────
  async saveTeacherBaseline(data: any) {
    const { literacy_pct, numeracy_pct, literacy_total, numeracy_total, overall_score } =
      this.calculateTotals(data.literacy_scores || {}, data.numeracy_scores || {}, data.max_marks || {});

    const level = overall_score !== undefined ? this.getLevel(overall_score) : undefined;
    const gaps = this.getGaps(literacy_pct, numeracy_pct);

    // Subject-wise promotion — each subject promoted independently at 80%
    const litTotal = literacy_total !== undefined ? +literacy_total : null;
    const numTotal = numeracy_total !== undefined ? +numeracy_total : null;
    const lit_stage = data.lit_stage || data.stage || 'foundation';
    const num_stage = data.num_stage || data.stage || 'foundation';
    const STAGE_ORDER = ['foundation', 'preparatory', 'middle', 'secondary'];

    // Use caller-supplied promotion flags if provided, else calculate from %
    const lit_promoted = data.lit_promoted !== undefined
      ? data.lit_promoted
      : (litTotal !== null && litTotal >= 80);
    const num_promoted = data.num_promoted !== undefined
      ? data.num_promoted
      : (numTotal !== null && numTotal >= 80);

    const litStageIdx = STAGE_ORDER.indexOf(lit_stage);
    const numStageIdx = STAGE_ORDER.indexOf(num_stage);
    const lit_promoted_to = lit_promoted && litStageIdx < 3 ? STAGE_ORDER[litStageIdx + 1] : null;
    const num_promoted_to = num_promoted && numStageIdx < 3 ? STAGE_ORDER[numStageIdx + 1] : null;

    // Overall promoted = both subjects promoted
    const promoted = lit_promoted && num_promoted;
    const promoted_to_stage = promoted ? lit_promoted_to : null;

    // Store subject-wise promotion info in gaps field extension
    const promotionInfo = { lit_promoted, num_promoted, lit_promoted_to, num_promoted_to, lit_stage, num_stage };

    const existing = await this.baselineRepo.findOne({
      where: {
        entity_id: data.teacher_id,
        entity_type: EntityType.TEACHER,
        academic_year: data.academic_year,
        round: data.round as AssessmentRound,
      },
    });

    const record: any = {
      entity_type: EntityType.TEACHER,
      entity_id: data.teacher_id,
      entity_name: data.teacher_name,
      academic_year: data.academic_year,
      round: data.round as AssessmentRound,
      subject: AssessmentSubject.LITERACY,
      stage: data.stage as AssessmentStage,
      assessment_date: data.assessment_date,
      literacy_scores: data.literacy_scores || {},
      numeracy_scores: data.numeracy_scores || {},
      max_marks: data.max_marks || {},
      literacy_pct,
      numeracy_pct,
      literacy_total,
      numeracy_total,
      overall_score,
      level,
      gaps: { ...(gaps as any), ...promotionInfo },
      promoted,
      promoted_to_stage,
    };

    if (existing) {
      await this.baselineRepo.update(existing.id, record);
    } else {
      await this.baselineRepo.save(this.baselineRepo.create(record));
    }
    return record;
  }

  // ── Teacher baseline get ───────────────────────────────────────
  async getTeacherBaseline(teacher_id: string, academic_year: string) {
    const assessments = await this.baselineRepo.find({
      where: { entity_id: teacher_id, entity_type: EntityType.TEACHER, academic_year },
      order: { round: 'ASC' },
    });
    const teacher = await this.userRepo.findOne({ where: { id: teacher_id } });
    return { teacher, assessments };
  }

  // ── Teacher dashboard ──────────────────────────────────────────
  async getTeacherDashboard(academic_year: string, round: string) {
    const teachers = await this.userRepo.find({ where: { role: 'teacher' as any, is_active: true } });
    const assessments = await this.baselineRepo.find({
      where: { academic_year, round: round as AssessmentRound, entity_type: EntityType.TEACHER },
    });

    const teacherStats = teachers.map(t => {
      const a = assessments.find(x => x.entity_id === t.id);
      return {
        teacher: { id: t.id, name: t.name, email: t.email, subjects: t.subjects },
        literacy_pct: a?.literacy_pct || null,
        numeracy_pct: a?.numeracy_pct || null,
        litAvg: a?.literacy_total != null ? +a.literacy_total : null,
        numAvg: a?.numeracy_total != null ? +a.numeracy_total : null,
        overall: a?.overall_score != null ? +a.overall_score : null,
        level: a?.level || null,
        gaps: a?.gaps || null,
        assessed: !!a,
        assessment: a || null,
      };
    });

    const assessed = teacherStats.filter(t => t.assessed);
    const avg = (arr: number[]) => arr.length ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : 0;
    const litAvgs = assessed.filter(t => t.litAvg !== null).map(t => t.litAvg as number);
    const numAvgs = assessed.filter(t => t.numAvg !== null).map(t => t.numAvg as number);
    const overallAvgs = assessed.filter(t => t.overall !== null).map(t => t.overall as number);

    // Level distribution
    const levelDist = { L4: 0, L3: 0, L2: 0, L1: 0 } as Record<string, number>;
    assessed.forEach(t => {
      const s = t.overall || 0;
      if (s >= 80) levelDist.L4++; else if (s >= 60) levelDist.L3++;
      else if (s >= 40) levelDist.L2++; else levelDist.L1++;
    });

    // Bar chart data per teacher
    const teacherBarData = assessed.map(t => ({
      name: t.teacher.name.split(' ')[0],
      fullName: t.teacher.name,
      overall: t.overall || 0,
      literacy: t.litAvg || 0,
      numeracy: t.numAvg || 0,
    })).sort((a, b) => b.overall - a.overall);

    // Domain averages across all assessed teachers
    const litDomains: Record<string, number[]> = {};
    const numDomains: Record<string, number[]> = {};
    assessed.forEach(t => {
      if (t.literacy_pct) Object.entries(t.literacy_pct).forEach(([d, v]) => {
        if (!litDomains[d]) litDomains[d] = []; litDomains[d].push(+v);
      });
      if (t.numeracy_pct) Object.entries(t.numeracy_pct).forEach(([d, v]) => {
        if (!numDomains[d]) numDomains[d] = []; numDomains[d].push(+v);
      });
    });
    const domainData = [
      ...Object.entries(litDomains).map(([domain, vals]) => ({ domain, score: avg(vals), type: 'literacy' })),
      ...Object.entries(numDomains).map(([domain, vals]) => ({ domain, score: avg(vals), type: 'numeracy' })),
    ];

    // Teacher list for table
    const teacherList = teachers.map(t => {
      const a = assessments.find(x => x.entity_id === t.id);
      return { teacher_id: t.id, teacher_name: t.name, assessment: a || null };
    });

    // Stage progression across all rounds
    const allTeacherAssessments = await this.baselineRepo.find({
      where: { entity_type: EntityType.TEACHER, academic_year },
      order: { round: 'ASC' },
    });

    const STAGE_GRADE_MAP: Record<string, string> = {
      foundation: 'Grade 2', preparatory: 'Grade 5', middle: 'Grade 8', secondary: 'Grade 10',
    };

    const teacherStageProgression = teachers.map(t => {
      const tAssessments = allTeacherAssessments.filter(a => a.entity_id === t.id);
      const rounds: Record<string, any> = {};
      tAssessments.forEach(a => {
        const gaps = (a.gaps as any) || {};
        rounds[a.round] = {
          stage: a.stage,
          lit_stage: gaps.lit_stage || a.stage,
          num_stage: gaps.num_stage || a.stage,
          lit_promoted: gaps.lit_promoted || false,
          num_promoted: gaps.num_promoted || false,
          lit_promoted_to: gaps.lit_promoted_to || null,
          num_promoted_to: gaps.num_promoted_to || null,
          lit_grade: STAGE_GRADE_MAP[gaps.lit_stage || a.stage] || 'Grade 2',
          num_grade: STAGE_GRADE_MAP[gaps.num_stage || a.stage] || 'Grade 2',
        };
      });
      return { teacher_id: t.id, teacher_name: t.name, rounds };
    }).filter(t => Object.keys(t.rounds).length > 0);

    return {
      totalTeachers: teachers.length,
      assessed: assessed.length,
      pending: teachers.length - assessed.length,
      literacyAvg: avg(litAvgs),
      numeracyAvg: avg(numAvgs),
      overallAvg: avg(overallAvgs),
      teachers: teacherStats,
      teacherBarData,
      domainData,
      levelDist,
      teacherList,
      teacherStageProgression,
    };
  }

  // ── Consecutive decline alerts ─────────────────────────────────
  async getConsecutiveDeclineStudents(academic_year?: string) {
    const where: any = { entity_type: EntityType.STUDENT };
    if (academic_year) where.academic_year = academic_year;

    const all = await this.baselineRepo.find({ where, order: { entity_id: 'ASC', round: 'ASC' } });

    const ROUND_ORDER = ['baseline_1','baseline_2','baseline_3','baseline_4','baseline_5',
      'baseline_6','baseline_7','baseline_8','baseline_9','baseline_10'];

    const byStudent: Record<string, BaselineAssessment[]> = {};
    all.forEach(a => {
      if (!byStudent[a.entity_id]) byStudent[a.entity_id] = [];
      byStudent[a.entity_id].push(a);
    });

    const alerts: any[] = [];
    for (const [id, records] of Object.entries(byStudent)) {
      const sorted = records.sort((a, b) => ROUND_ORDER.indexOf(a.round) - ROUND_ORDER.indexOf(b.round));
      if (sorted.length < 3) continue;
      const last3 = sorted.slice(-3);
      const scores = last3.map(r => r.overall_score != null ? +r.overall_score : null).filter(s => s !== null) as number[];
      if (scores.length < 3) continue;
      if (scores[0] > scores[1] && scores[1] > scores[2]) {
        alerts.push({
          entity_id: id,
          entity_name: sorted[0].entity_name,
          grade: sorted[0].grade,
          section: sorted[0].section,
          drop: +(scores[0] - scores[2]).toFixed(1),
          scores: last3.map((r, i) => ({ round: r.round, overall: scores[i] })),
        });
      }
    }
    return alerts.sort((a, b) => b.drop - a.drop);
  }

  async getConsecutiveDeclineTeachers(academic_year?: string) {
    const where: any = { entity_type: EntityType.TEACHER };
    if (academic_year) where.academic_year = academic_year;

    const all = await this.baselineRepo.find({ where, order: { entity_id: 'ASC', round: 'ASC' } });

    const ROUND_ORDER = ['baseline_1','baseline_2','baseline_3','baseline_4','baseline_5',
      'baseline_6','baseline_7','baseline_8','baseline_9','baseline_10'];

    const byTeacher: Record<string, BaselineAssessment[]> = {};
    all.forEach(a => {
      if (!byTeacher[a.entity_id]) byTeacher[a.entity_id] = [];
      byTeacher[a.entity_id].push(a);
    });

    const alerts: any[] = [];
    for (const [id, records] of Object.entries(byTeacher)) {
      const sorted = records.sort((a, b) => ROUND_ORDER.indexOf(a.round) - ROUND_ORDER.indexOf(b.round));
      if (sorted.length < 3) continue;
      const last3 = sorted.slice(-3);
      const scores = last3.map(r => r.overall_score != null ? +r.overall_score : null).filter(s => s !== null) as number[];
      if (scores.length < 3) continue;
      if (scores[0] > scores[1] && scores[1] > scores[2]) {
        alerts.push({
          entity_id: id,
          entity_name: sorted[0].entity_name,
          drop: +(scores[0] - scores[2]).toFixed(1),
          scores: last3.map((r, i) => ({ round: r.round, overall: scores[i] })),
        });
      }
    }
    return alerts.sort((a, b) => b.drop - a.drop);
  }

  // ── Section rounds (teacher dashboard entry) ───────────────────
  async getSectionRounds(grade: string, section: string, academic_year: string) {
    const students = await this.studentRepo
      .createQueryBuilder('student')
      .where('LOWER(student.current_class) = LOWER(:grade)', { grade })
      .andWhere('LOWER(student.section) = LOWER(:section)', { section })
      .andWhere('student.is_active = :active', { active: true })
      .orderBy('student.name', 'ASC')
      .getMany();

    const assessments = await this.baselineRepo.find({
      where: { grade, section, academic_year, entity_type: EntityType.STUDENT },
      order: { round: 'ASC' },
    });

    const ROUND_ORDER = ['baseline_1','baseline_2','baseline_3','baseline_4','baseline_5',
      'baseline_6','baseline_7','baseline_8','baseline_9','baseline_10'];

    const allRounds = [...new Set(assessments.map(a => a.round))].sort(
      (a, b) => ROUND_ORDER.indexOf(a) - ROUND_ORDER.indexOf(b)
    );

    const studentData = students.map(student => {
      const rounds = allRounds.map(round => {
        const a = assessments.find(x => x.entity_id === student.id && x.round === round);
        if (!a) return { round, exists: false };
        return {
          round,
          exists: true,
          date: a.assessment_date,
          stage: a.stage,
          promoted: a.promoted,
          promoted_to_stage: a.promoted_to_stage,
          literacy_scores: a.literacy_scores || {},
          numeracy_scores: a.numeracy_scores || {},
          literacy_pct: a.literacy_pct || {},
          numeracy_pct: a.numeracy_pct || {},
          max_marks: a.max_marks || {},
          literacy_total: a.literacy_total != null ? +a.literacy_total : 0,
          numeracy_total: a.numeracy_total != null ? +a.numeracy_total : 0,
          overall: a.overall_score != null ? +a.overall_score : 0,
          level: a.level,
          gaps: a.gaps,
        };
      });
      return { student_id: student.id, student_name: student.name, rounds };
    });

    return {
      grade, section, academic_year,
      total_rounds: allRounds.length,
      next_round: `baseline_${allRounds.length + 1}`,
      round_labels: allRounds.map((r, i) => `Round ${i + 1}`),
      rounds: allRounds,
      students: studentData,
    };
  }

  // ── Save section round (teacher dashboard entry) ───────────────
  async saveSectionRound(data: {
    grade: string;
    section: string;
    academic_year: string;
    round: string;
    stage: string;
    assessment_date?: string;
    entries: Array<{
      student_id: string;
      student_name: string;
      literacy_scores: Record<string, number>;
      numeracy_scores: Record<string, number>;
      max_marks: Record<string, number>;
    }>;
  }) {
    const results = { saved: 0, failed: 0 };
    const round = data.round as AssessmentRound;
    const stage = data.stage as AssessmentStage;

    for (const entry of data.entries) {
      try {
        const { literacy_pct, numeracy_pct, literacy_total, numeracy_total, overall_score } =
          this.calculateTotals(entry.literacy_scores || {}, entry.numeracy_scores || {}, entry.max_marks || {});

        const level = overall_score !== undefined ? this.getLevel(overall_score) : undefined;
        const gaps = this.getGaps(literacy_pct, numeracy_pct);
        const { promoted, promoted_to_stage } = overall_score !== undefined
          ? this.getPromotion(overall_score, data.stage)
          : { promoted: false, promoted_to_stage: null };

        const existing = await this.baselineRepo.findOne({
          where: { entity_id: entry.student_id, academic_year: data.academic_year, round, entity_type: EntityType.STUDENT },
        });

        const record: any = {
          entity_type: EntityType.STUDENT,
          entity_id: entry.student_id,
          entity_name: entry.student_name,
          grade: data.grade,
          section: data.section,
          academic_year: data.academic_year,
          round,
          subject: AssessmentSubject.LITERACY,
          stage,
          assessment_date: data.assessment_date,
          literacy_scores: entry.literacy_scores || {},
          numeracy_scores: entry.numeracy_scores || {},
          max_marks: entry.max_marks || {},
          literacy_pct,
          numeracy_pct,
          literacy_total,
          numeracy_total,
          overall_score,
          level,
          gaps,
          promoted,
          promoted_to_stage,
        };

        if (existing) {
          await this.baselineRepo.update(existing.id, record);
        } else {
          await this.baselineRepo.save(this.baselineRepo.create(record));
        }
        results.saved++;
      } catch { results.failed++; }
    }
    return results;
  }

  // ── Student portfolio ──────────────────────────────────────────
  async getStudentPortfolioBaseline(student_id: string) {
    const student = await this.studentRepo.findOne({ where: { id: student_id } });
    const assessments = await this.baselineRepo.find({
      where: { entity_id: student_id, entity_type: EntityType.STUDENT },
      order: { academic_year: 'ASC', round: 'ASC' },
    });
    return { student, assessments };
  }

  // ── Student rounds ─────────────────────────────────────────────
  async getStudentRounds(student_id: string, academic_year: string) {
    const student = await this.studentRepo.findOne({ where: { id: student_id } });
    const assessments = await this.baselineRepo.find({
      where: { entity_id: student_id, academic_year, entity_type: EntityType.STUDENT },
      order: { round: 'ASC' },
    });
    return { student, assessments };
  }

  // ── Recalculate all stored percentages ─────────────────────────
  async recalculateAll() {
    const all = await this.baselineRepo.find();
    let updated = 0;
    for (const a of all) {
      const lit = (a.literacy_scores as Record<string, number>) || {};
      const num = (a.numeracy_scores as Record<string, number>) || {};
      const mm = (a.max_marks as Record<string, number>) || {};
      const { literacy_pct, numeracy_pct, literacy_total, numeracy_total, overall_score } =
        this.calculateTotals(lit, num, mm);
      const level = overall_score !== undefined ? this.getLevel(overall_score) : a.level;
      const gaps = this.getGaps(literacy_pct, numeracy_pct);
      await this.baselineRepo.update(a.id, {
        literacy_pct, numeracy_pct, literacy_total, numeracy_total, overall_score, level, gaps,
      } as any);
      updated++;
    }
    return { updated, message: `Recalculated ${updated} assessment records` };
  }
}
