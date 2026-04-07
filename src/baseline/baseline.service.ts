import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaselineAssessment, EntityType, AssessmentRound, AssessmentStage, AssessmentSubject } from '../assessments/entities/baseline-assessment.entity/baseline-assessment.entity';
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
    const students = await this.studentRepo
      .createQueryBuilder('student')
      .where('LOWER(student.current_class) = LOWER(:grade)', { grade })
      .andWhere('LOWER(student.section) = LOWER(:section)', { section })
      .andWhere('student.is_active = :active', { active: true })
      .orderBy('student.name', 'ASC')
      .getMany();
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
    // Get ALL assessments for this round — both literacy and numeracy records
    const assessments = await this.baselineRepo.find({
      where: { academic_year, round: round as AssessmentRound, entity_type: EntityType.TEACHER }
    });
    const avg = (arr: number[]) => arr.length ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : 0;

    // Group by teacher — each teacher may have lit + num records
    const byTeacher: Record<string, { lit?: any; num?: any }> = {};
    assessments.forEach(a => {
      if (!byTeacher[a.entity_id]) byTeacher[a.entity_id] = {};
      if (a.subject === 'literacy') byTeacher[a.entity_id].lit = a;
      else if (a.subject === 'numeracy') byTeacher[a.entity_id].num = a;
    });

    // Compute per-teacher averages
    const litDomains = ['listening_score','speaking_score','reading_score','writing_score'];
    const numDomains = ['operations_score','base10_score','measurement_score','geometry_score'];

    const computeSubjAvg = (rec: any, domains: string[]) => {
      if (!rec) return null;
      const vals = domains.map(d => rec[d] ? +rec[d] : 0).filter(v => v > 0);
      return vals.length ? +(vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1) : null;
    };

    const teacherStats = teachers.map(t => {
      const recs = byTeacher[t.id] || {};
      const litAvg = computeSubjAvg(recs.lit, litDomains);
      const numAvg = computeSubjAvg(recs.num, numDomains);
      const overall = litAvg !== null && numAvg !== null ? +((litAvg+numAvg)/2).toFixed(1)
        : litAvg ?? numAvg ?? null;
      return { teacher: t, lit: recs.lit, num: recs.num, litAvg, numAvg, overall };
    });

    const assessed = teacherStats.filter(t => t.overall !== null).length;
    const pending = teachers.length - assessed;

    // Level distribution
    const levelDist = { L1: 0, L2: 0, L3: 0, L4: 0 };
    teacherStats.forEach(t => {
      if (t.overall === null) return;
      if (t.overall >= 80) levelDist.L4++;
      else if (t.overall >= 60) levelDist.L3++;
      else if (t.overall >= 40) levelDist.L2++;
      else levelDist.L1++;
    });

    // Domain averages across all teachers
    const domainAvgs = {
      Listening:   avg(assessments.filter(a=>a.subject==='literacy'&&a.listening_score).map(a=>+a.listening_score)),
      Speaking:    avg(assessments.filter(a=>a.subject==='literacy'&&a.speaking_score).map(a=>+a.speaking_score)),
      Reading:     avg(assessments.filter(a=>a.subject==='literacy'&&a.reading_score).map(a=>+a.reading_score)),
      Writing:     avg(assessments.filter(a=>a.subject==='literacy'&&a.writing_score).map(a=>+a.writing_score)),
      Operations:  avg(assessments.filter(a=>a.subject==='numeracy'&&a.operations_score).map(a=>+a.operations_score)),
      'Base 10':   avg(assessments.filter(a=>a.subject==='numeracy'&&a.base10_score).map(a=>+a.base10_score)),
      Measurement: avg(assessments.filter(a=>a.subject==='numeracy'&&a.measurement_score).map(a=>+a.measurement_score)),
      Geometry:    avg(assessments.filter(a=>a.subject==='numeracy'&&a.geometry_score).map(a=>+a.geometry_score)),
    };
    const domainData = Object.entries(domainAvgs).map(([domain, score]) => ({ domain, score }));

    // Stage distribution
    const stageMap: Record<string, number[]> = {};
    const stageAssessed: Record<string, number> = {};
    teacherStats.forEach(t => {
      [t.lit, t.num].forEach(rec => {
        if (!rec) return;
        const stage = rec.stage || 'unknown';
        if (!stageMap[stage]) stageMap[stage] = [];
        const subAvg = rec.subject === 'literacy'
          ? computeSubjAvg(rec, litDomains)
          : computeSubjAvg(rec, numDomains);
        if (subAvg !== null) stageMap[stage].push(subAvg);
        stageAssessed[stage] = (stageAssessed[stage] || 0) + 1;
      });
    });
    const stageData = ['foundation','preparatory','middle','secondary'].map(stage => ({
      stage: stage.charAt(0).toUpperCase() + stage.slice(1),
      avg: avg(stageMap[stage] || []),
      assessed: stageAssessed[stage] || 0,
    }));

    // Per-teacher bar data
    const teacherBarData = teacherStats
      .filter(t => t.overall !== null)
      .map(t => ({
        name: t.teacher.name.split(' ')[0],
        fullName: t.teacher.name,
        literacy: t.litAvg ?? 0,
        numeracy: t.numAvg ?? 0,
        overall: t.overall ?? 0,
      }));

    const teacherList = teachers.map(t => {
      const st = teacherStats.find(s => s.teacher.id === t.id);
      return {
        teacher_id: t.id,
        teacher_name: t.name,
        litAvg: st?.litAvg ?? null,
        numAvg: st?.numAvg ?? null,
        overall: st?.overall ?? null,
        litStage: st?.lit?.stage ?? null,
        numStage: st?.num?.stage ?? null,
        litPromoted: st?.lit?.promoted ?? false,
        numPromoted: st?.num?.promoted ?? false,
      };
    });

    const litAvgs = teacherStats.filter(t=>t.litAvg!==null).map(t=>t.litAvg as number);
    const numAvgs = teacherStats.filter(t=>t.numAvg!==null).map(t=>t.numAvg as number);
    const overallAvgs = teacherStats.filter(t=>t.overall!==null).map(t=>t.overall as number);

    return {
      teacherList,
      totalTeachers: teachers.length,
      assessed, pending,
      literacyAvg: avg(litAvgs),
      numeracyAvg: avg(numAvgs),
      overallAvg: avg(overallAvgs),
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

  // ── MULTI-ROUND STUDENT BASELINE (Teacher Entry) ─────────────

  // Returns all rounds for a section grouped by student — for class marksheet view
  async getSectionRounds(grade: string, section: string, academic_year: string) {
    let students = await this.studentRepo
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

    // Get all rounds that have data
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
          literacy: {
            Listening: +(+a.listening_score || 0),
            Speaking:  +(+a.speaking_score  || 0),
            Reading:   +(+a.reading_score   || 0),
            Writing:   +(+a.writing_score   || 0),
            avg:       a.literacy_total ? +(+a.literacy_total) : 0,
          },
          numeracy: {
            Operations:  +(+a.operations_score   || 0),
            'Base 10':   +(+a.base10_score       || 0),
            Measurement: +(+a.measurement_score  || 0),
            Geometry:    +(+a.geometry_score      || 0),
            avg:         a.numeracy_total ? +(+a.numeracy_total) : 0,
          },
          overall: a.overall_score ? +(+a.overall_score) : 0,
          level: a.level,
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

  // Save a full round of marks for all students in a section
  async saveSectionRound(data: {
    grade: string;
    section: string;
    academic_year: string;
    round: string;      // e.g. "baseline_1"
    stage: string;      // e.g. "foundation"
    assessment_date: string;
    entries: {
      student_id: string;
      student_name: string;
      literacy: { Listening: number; Speaking: number; Reading: number; Writing: number };
      numeracy: { Operations: number; 'Base 10': number; Measurement: number; Geometry: number };
    }[];
  }) {
    const results = { saved: 0, failed: 0 };
    const round = data.round as AssessmentRound;
    const stage = data.stage as AssessmentStage;

    for (const entry of data.entries) {
      try {
        const litScores = {
          listening_score:  entry.literacy.Listening,
          speaking_score:   entry.literacy.Speaking,
          reading_score:    entry.literacy.Reading,
          writing_score:    entry.literacy.Writing,
        };
        const numScores = {
          operations_score:  entry.numeracy.Operations,
          base10_score:      entry.numeracy['Base 10'],
          measurement_score: entry.numeracy.Measurement,
          geometry_score:    entry.numeracy.Geometry,
        };
        const all = { ...litScores, ...numScores };
        const { literacy_total, numeracy_total, overall_score } = this.calculateTotals(all);
        const level = overall_score !== undefined ? this.getLevel(overall_score) : undefined;
        const litGaps = this.getGaps(all, 'literacy');
        const numGaps = this.getGaps(all, 'numeracy');

        // Check promotion (80% threshold — same as Python app)
        const litAvg = literacy_total ?? 0;
        const numAvg = numeracy_total ?? 0;
        const overallAvg = overall_score ?? 0;
        const promoted = overallAvg >= 80;

        const STAGE_ORDER = ['foundation', 'preparatory', 'middle', 'secondary'];
        const stageIdx = STAGE_ORDER.indexOf(data.stage);
        const promoted_to_stage = promoted && stageIdx < 3 ? STAGE_ORDER[stageIdx + 1] : null;

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
          ...litScores,
          ...numScores,
          literacy_total,
          numeracy_total,
          overall_score,
          level,
          gaps: { literacy: litGaps, numeracy: numGaps },
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

  // Get all rounds for one student — for student profile view
  // Portfolio — fetch ALL years baseline for a student
  async getStudentPortfolioBaseline(student_id: string) {
    const student = await this.studentRepo.findOne({ where: { id: student_id } });
    const assessments = await this.baselineRepo.find({
      where: { entity_id: student_id, entity_type: EntityType.STUDENT },
      order: { academic_year: 'ASC', round: 'ASC' },
    });

    // Group by academic_year
    const byYear: Record<string, any[]> = {};
    assessments.forEach(a => {
      if (!byYear[a.academic_year]) byYear[a.academic_year] = [];
      byYear[a.academic_year].push(a);
    });

    const years = Object.keys(byYear).sort().map(year => {
      const recs = byYear[year];
      const litRecs = recs.filter(r => r.subject === 'literacy' || !r.subject);
      const numRecs = recs.filter(r => r.subject === 'numeracy');
      const avg = (arr: number[]) => arr.length ? +(arr.reduce((a,b)=>a+b,0)/arr.length).toFixed(1) : null;

      const litScores = litRecs.map(r => r.literacy_total || r.overall_score).filter(Boolean).map(Number);
      const numScores = numRecs.map(r => r.numeracy_total || r.overall_score).filter(Boolean).map(Number);

      return {
        academic_year: year,
        grade: recs[0]?.grade || null,
        literacy: { avg: avg(litScores), records: litRecs, stage: litRecs[0]?.stage },
        numeracy: { avg: avg(numScores), records: numRecs, stage: numRecs[0]?.stage },
        rounds: recs.length,
      };
    });

    return { student, years };
  }

  async getStudentRounds(student_id: string, academic_year: string) {
    const student = await this.studentRepo.findOne({ where: { id: student_id } });
    const assessments = await this.baselineRepo.find({
      where: { entity_id: student_id, academic_year, entity_type: EntityType.STUDENT },
      order: { round: 'ASC' },
    });

    const ROUND_ORDER = ['baseline_1','baseline_2','baseline_3','baseline_4','baseline_5',
      'baseline_6','baseline_7','baseline_8','baseline_9','baseline_10'];

    const rounds = assessments
      .sort((a, b) => ROUND_ORDER.indexOf(a.round) - ROUND_ORDER.indexOf(b.round))
      .map((a, i) => ({
        round_number: i + 1,
        round: a.round,
        date: a.assessment_date,
        stage: a.stage,
        promoted: a.promoted,
        promoted_to_stage: a.promoted_to_stage,
        scores: {
          literacy: {
            Listening: +(+a.listening_score || 0),
            Speaking:  +(+a.speaking_score  || 0),
            Reading:   +(+a.reading_score   || 0),
            Writing:   +(+a.writing_score   || 0),
          },
          numeracy: {
            Operations:  +(+a.operations_score   || 0),
            'Base 10':   +(+a.base10_score       || 0),
            Measurement: +(+a.measurement_score  || 0),
            Geometry:    +(+a.geometry_score      || 0),
          },
        },
        literacy_avg: a.literacy_total ? +(+a.literacy_total) : 0,
        numeracy_avg: a.numeracy_total ? +(+a.numeracy_total) : 0,
        overall: a.overall_score ? +(+a.overall_score) : 0,
        level: a.level,
        gaps: a.gaps,
      }));

    // Strengths (≥80%) and weaknesses (<60%) across all rounds rolling avg
    const domainScores: Record<string, number[]> = {};
    const LITERACY_DOMAINS = ['Listening','Speaking','Reading','Writing'];
    const NUMERACY_DOMAINS = ['Operations','Base 10','Measurement','Geometry'];
    for (const r of rounds) {
      for (const d of LITERACY_DOMAINS) { domainScores[d] = domainScores[d] || []; domainScores[d].push(r.scores.literacy[d] || 0); }
      for (const d of NUMERACY_DOMAINS) { domainScores[d] = domainScores[d] || []; domainScores[d].push(r.scores.numeracy[d] || 0); }
    }
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    Object.entries(domainScores).forEach(([domain, vals]) => {
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      if (avg >= 80) strengths.push(`${domain} — ${avg.toFixed(0)}%`);
      else if (avg < 60) weaknesses.push(`${domain} — ${avg.toFixed(0)}%`);
    });

    return { student, rounds, strengths, weaknesses };
  }
}