import { Injectable } from '@nestjs/common';
import { normalizeSubject } from '../common/utils';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExamConfig } from './entities/exam-config.entity/exam-config.entity';
import { ExamMarks } from './entities/exam-marks.entity/exam-marks.entity';
import { Student } from '../students/entities/student.entity/student.entity';

const safeNum = (v: any) => (v === null || v === undefined || v === '' ? null : +v);
const avg = (arr: number[]) => arr.length ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2) : 0;

const EXAM_ORDER = ['FA1', 'FA2', 'SA1', 'FA3', 'FA4', 'SA2', 'Custom'];

@Injectable()
export class PasaService {
  constructor(
    @InjectRepository(ExamConfig) private configRepo: Repository<ExamConfig>,
    @InjectRepository(ExamMarks) private marksRepo: Repository<ExamMarks>,
    @InjectRepository(Student) private studentRepo: Repository<Student>,
  ) {}

  // ── EXAM CONFIG ──────────────────────────────────────────────

  async saveExamConfig(data: {
    academic_year: string;
    exam_type: string;
    grade: string;
    section: string;
    subject: string;
    teacher_id: string;
    teacher_name: string;
    competencies: { competency_id: string; competency_code: string; competency_name: string; max_marks: number }[];
    exam_date?: string;
    description?: string;
  }) {
    const total_marks = data.competencies.reduce((sum, c) => sum + (+c.max_marks || 0), 0);

    // Check if config already exists for this exam
    const existing = await this.configRepo.findOne({
      where: {
        academic_year: data.academic_year,
        exam_type: data.exam_type,
        grade: data.grade,
        section: data.section,
        subject: data.subject,
        teacher_id: data.teacher_id,
      }
    });

    if (existing) {
      await this.configRepo.update(existing.id, {
        competencies: data.competencies as any,
        total_marks,
        exam_date: data.exam_date,
        description: data.description,
      });
      return { success: true, config_id: existing.id, message: 'Config updated' };
    }

    const config = this.configRepo.create({ ...data, total_marks, competencies: data.competencies as any });
    const saved = await this.configRepo.save(config);
    return { success: true, config_id: saved.id, message: 'Config created' };
  }

  async getExamConfigs(teacher_id: string, academic_year: string) {
    const configs = await this.configRepo.find({
      where: { teacher_id, academic_year, is_active: true },
      order: { created_at: 'DESC' },
    });
    return { configs };
  }

  async getExamConfigById(id: string) {
    return this.configRepo.findOne({ where: { id } });
  }

  async getExamConfigForEntry(grade: string, section: string, subject: string, exam_type: string, academic_year: string) {
    return this.configRepo.createQueryBuilder('c')
      .where('LOWER(c.grade) = LOWER(:grade)', { grade })
      .andWhere('LOWER(c.section) = LOWER(:section)', { section })
      .andWhere('c.subject = :subject', { subject: normalizeSubject(subject) })
      .andWhere('c.exam_type = :exam_type', { exam_type })
      .andWhere('c.academic_year = :academic_year', { academic_year })
      .andWhere('c.is_active = true')
      .getOne();
  }

  async getAllConfigsForGradeSection(grade: string, section: string, academic_year: string) {
    const query = this.configRepo.createQueryBuilder('c')
      .where('c.academic_year = :academic_year', { academic_year })
      .andWhere('c.is_active = :active', { active: true });
    if (grade) query.andWhere('LOWER(c.grade) = LOWER(:grade)', { grade });
    if (section) query.andWhere('LOWER(c.section) = LOWER(:section)', { section });
    query.orderBy('c.grade', 'ASC').addOrderBy('c.subject', 'ASC').addOrderBy('c.exam_type', 'ASC');
    const configs = await query.getMany();
    return { configs };
  }

  async deleteExamConfig(id: string) {
    await this.configRepo.update(id, { is_active: false });
    return { success: true };
  }

  // ── MARKS ENTRY ──────────────────────────────────────────────

  async saveMarks(data: {
    exam_config_id: string;
    grade: string;
    section: string;
    subject: string;
    exam_type: string;
    academic_year: string;
    teacher_id: string;
    entries: {
      student_id: string;
      student_name: string;
      roll_number?: string;
      is_absent?: boolean;
      competency_scores: {
        competency_id: string;
        competency_code: string;
        competency_name: string;
        marks_obtained: number | null;
        max_marks: number;
      }[];
    }[];
  }) {
    let saved = 0;
    for (const entry of data.entries) {
      // Calculate totals
      let total_obtained = 0;
      let total_max = 0;
      const scores = entry.competency_scores.map(cs => {
        const mo = entry.is_absent ? null : safeNum(cs.marks_obtained);
        const mm = +cs.max_marks;
        const pct = mo !== null && mm > 0 ? +((mo / mm) * 100).toFixed(2) : null;
        if (mo !== null) total_obtained += mo;
        total_max += mm;
        return { ...cs, marks_obtained: mo, percentage: pct };
      });
      const percentage = !entry.is_absent && total_max > 0
        ? +((total_obtained / total_max) * 100).toFixed(2) : null;

      // Find existing record
      const existing = await this.marksRepo.findOne({
        where: {
          student_id: entry.student_id,
          exam_config_id: data.exam_config_id,
          academic_year: data.academic_year,
          is_active: true,
        }
      });

      if (existing) {
        await this.marksRepo.update(existing.id, {
          competency_scores: scores as any,
          total_obtained: entry.is_absent ? null : total_obtained,
          total_max,
          percentage,
          is_absent: entry.is_absent || false,
          roll_number: entry.roll_number,
        });
      } else {
        await this.marksRepo.save(this.marksRepo.create({
          student_id: entry.student_id,
          student_name: entry.student_name,
          roll_number: entry.roll_number,
          grade: data.grade,
          section: data.section,
          subject: data.subject,
          exam_type: data.exam_type,
          academic_year: data.academic_year,
          exam_config_id: data.exam_config_id,
          teacher_id: data.teacher_id,
          competency_scores: scores as any,
          total_obtained: entry.is_absent ? null : total_obtained,
          total_max,
          percentage,
          is_absent: entry.is_absent || false,
        }));
      }
      saved++;
    }
    return { success: true, saved };
  }

  async getMarksForEntry(exam_config_id: string, grade: string, section: string) {
    // Get all students in section - use case-insensitive query
    const students = await this.studentRepo
      .createQueryBuilder('s')
      .where('LOWER(s.current_class) = LOWER(:grade)', { grade })
      .andWhere('LOWER(s.section) = LOWER(:section)', { section })
      .andWhere('s.is_active = true')
      .orderBy('s.name', 'ASC')
      .getMany();

    // Get existing marks
    const marks = await this.marksRepo.find({
      where: { exam_config_id, grade, section, is_active: true },
    });

    const marksMap: Record<string, any> = {};
    marks.forEach(m => { marksMap[m.student_id] = m; });

    return {
      students: students.map(s => ({
        student_id: s.id,
        student_name: s.name,
        admission_no: s.admission_no,
        existing_marks: marksMap[s.id] || null,
      }))
    };
  }

  async getMarksTable(grade: string, section: string, exam_type: string, academic_year: string, subject?: string) {
    const where: any = { grade, section, exam_type, academic_year, is_active: true };
    if (subject) where.subject = subject;
    const marks = await this.marksRepo.find({ where, order: { student_name: 'ASC' } });
    return { marks };
  }

  // ── STUDENT FULL REPORT (all subjects for one exam) ──────────

  async getStudentExamReport(student_id: string, academic_year: string, exam_type?: string) {
    const where: any = { student_id, academic_year, is_active: true };
    if (exam_type) where.exam_type = exam_type;
    const marks = await this.marksRepo.find({ where, order: { subject: 'ASC' } });
    return { marks };
  }

  // ── DASHBOARD: SECTION ───────────────────────────────────────

  async getSectionDashboard(grade: string, section: string, academic_year: string, exam_type?: string) {
    const where: any = { grade, section, academic_year, is_active: true };
    if (exam_type) where.exam_type = exam_type;
    const allMarks = await this.marksRepo.find({ where });

    const subjects = [...new Set(allMarks.map(m => m.subject))].sort();
    const students = [...new Set(allMarks.map(m => m.student_id))];

    // Per subject summary
    const subjectSummary = subjects.map(sub => {
      const subMarks = allMarks.filter(m => m.subject === sub && !m.is_absent && m.percentage !== null);
      const pcts = subMarks.map(m => +(m.percentage ?? 0));
      const compMap: Record<string, number[]> = {};
      subMarks.forEach(m => {
        (m.competency_scores as any[]).forEach((cs: any) => {
          if (!compMap[cs.competency_code]) compMap[cs.competency_code] = [];
          if (cs.marks_obtained !== null && cs.max_marks > 0) {
            compMap[cs.competency_code].push((cs.marks_obtained / cs.max_marks) * 100);
          }
        });
      });
      const competencyAvgs = Object.entries(compMap).map(([code, vals]) => ({
        code, avg: avg(vals),
      }));
      return {
        subject: sub,
        avg_percentage: avg(pcts),
        assessed: subMarks.length,
        total_students: students.length,
        competency_avgs: competencyAvgs,
      };
    });

    return { grade, section, academic_year, exam_type, subjects, subjectSummary };
  }

  // ── DASHBOARD: SCHOOL ────────────────────────────────────────

  async getSchoolDashboard(academic_year: string, exam_type?: string) {
    const where: any = { academic_year, is_active: true };
    if (exam_type) where.exam_type = exam_type;
    const allMarks = await this.marksRepo.find({ where });

    const grades = [...new Set(allMarks.map(m => m.grade))].sort();
    const subjects = [...new Set(allMarks.map(m => m.subject))].sort();

    const gradeSummary = grades.map(grade => {
      const gm = allMarks.filter(m => m.grade === grade && !m.is_absent && m.percentage !== null);
      return { grade, avg: avg(gm.map(m => +(m.percentage ?? 0))), count: gm.length };
    });

    const subjectSummary = subjects.map(sub => {
      const sm = allMarks.filter(m => m.subject === sub && !m.is_absent && m.percentage !== null);
      return { subject: sub, avg: avg(sm.map(m => +(m.percentage ?? 0))), count: sm.length };
    });

    // School-wide weakest competencies
    const compMap: Record<string, { subject: string; avgs: number[] }> = {};
    allMarks.filter(m => !m.is_absent).forEach(m => {
      (m.competency_scores as any[]).forEach((cs: any) => {
        const key = cs.competency_code;
        if (!compMap[key]) compMap[key] = { subject: m.subject, avgs: [] };
        if (cs.marks_obtained !== null && cs.max_marks > 0) {
          compMap[key].avgs.push((cs.marks_obtained / cs.max_marks) * 100);
        }
      });
    });
    const weakCompetencies = Object.entries(compMap)
      .map(([code, { subject, avgs: vals }]) => ({ code, subject, avg: avg(vals) }))
      .filter(c => c.avg < 60)
      .sort((a, b) => a.avg - b.avg)
      .slice(0, 20);

    return {
      academic_year, exam_type,
      total_entries: allMarks.length,
      gradeSummary, subjectSummary, weakCompetencies,
    };
  }

  // ── DASHBOARD: GRADE ─────────────────────────────────────────

  async getGradeDashboard(grade: string, academic_year: string, exam_type?: string) {
    const where: any = { grade, academic_year, is_active: true };
    if (exam_type) where.exam_type = exam_type;
    const allMarks = await this.marksRepo.find({ where });

    const sections = [...new Set(allMarks.map(m => m.section))].sort();
    const subjects = [...new Set(allMarks.map(m => m.subject))].sort();

    const sectionSummary = sections.map(sec => {
      const sm = allMarks.filter(m => m.section === sec && !m.is_absent && m.percentage !== null);
      return { section: sec, avg: avg(sm.map(m => +(m.percentage ?? 0))), count: sm.length };
    });

    const subjectSummary = subjects.map(sub => {
      const sm = allMarks.filter(m => m.subject === sub && !m.is_absent && m.percentage !== null);
      return { subject: sub, avg: avg(sm.map(m => +(m.percentage ?? 0))), count: sm.length };
    });

    return { grade, academic_year, exam_type, sectionSummary, subjectSummary };
  }

  // ── ALERTS: CONSECUTIVE DECLINE ──────────────────────────────

  async getConsecutiveDeclineAlerts(academic_year: string, grade?: string, section?: string) {
    const where: any = { academic_year, is_active: true };
    if (grade) where.grade = grade;
    if (section) where.section = section;
    const allMarks = await this.marksRepo.find({ where });

    // Group by student + subject + competency_code
    const map: Record<string, { student_name: string; grade: string; section: string; subject: string; exams: { exam_type: string; pct: number }[] }> = {};

    allMarks.filter(m => !m.is_absent).forEach(m => {
      (m.competency_scores as any[]).forEach((cs: any) => {
        if (cs.marks_obtained === null || cs.max_marks === 0) return;
        const key = `${m.student_id}__${m.subject}__${cs.competency_code}`;
        if (!map[key]) map[key] = {
          student_name: m.student_name,
          grade: m.grade, section: m.section,
          subject: m.subject, exams: [],
        };
        map[key].exams.push({
          exam_type: m.exam_type,
          pct: +((cs.marks_obtained / cs.max_marks) * 100).toFixed(2),
        });
      });
    });

    const alerts: any[] = [];
    for (const [key, data] of Object.entries(map)) {
      const competency_code = key.split('__')[2];
      // Sort exams in order
      const sorted = data.exams.sort((a, b) => {
        const ai = EXAM_ORDER.indexOf(a.exam_type);
        const bi = EXAM_ORDER.indexOf(b.exam_type);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });
      if (sorted.length < 3) continue;
      // Check for 2 consecutive declines
      for (let i = 0; i <= sorted.length - 3; i++) {
        const p1 = sorted[i].pct;
        const p2 = sorted[i + 1].pct;
        const p3 = sorted[i + 2].pct;
        if (p1 > p2 && p2 > p3) {
          alerts.push({
            student_name: data.student_name,
            grade: data.grade, section: data.section,
            subject: data.subject,
            competency_code,
            exam_scores: sorted,
            decline_from: p1, decline_to: p3,
            drop: +(p1 - p3).toFixed(2),
          });
          break;
        }
      }
    }

    return { alerts: alerts.sort((a, b) => b.drop - a.drop) };
  }

  // ── STUDENT PORTFOLIO (all years) ────────────────────────────

  async getStudentPortfolioPasa(student_id: string, subjects?: string[]) {
    let allMarks = await this.marksRepo.find({
      where: { student_id, is_active: true },
      order: { academic_year: 'ASC', created_at: 'ASC' },
    });

    if (subjects && subjects.length > 0) {
      allMarks = allMarks.filter(m => subjects.includes(m.subject));
    }

    if (!allMarks.length) return { years: [] };

    const byYear: Record<string, any[]> = {};
    allMarks.forEach(m => {
      if (!byYear[m.academic_year]) byYear[m.academic_year] = [];
      byYear[m.academic_year].push(m);
    });

    const years = Object.keys(byYear).sort().map(year => {
      const marks = byYear[year];
      const grade = marks[0]?.grade;
      const examTypes = [...new Set(marks.map(m => m.exam_type))].sort((a, b) => {
        return (EXAM_ORDER.indexOf(a) === -1 ? 99 : EXAM_ORDER.indexOf(a)) -
               (EXAM_ORDER.indexOf(b) === -1 ? 99 : EXAM_ORDER.indexOf(b));
      });
      const subjectsList = [...new Set(marks.map(m => m.subject))].sort();

      const examSummary = examTypes.map(exam => {
        const examMarks = marks.filter(m => m.exam_type === exam);
        let to = 0, tm = 0;
        const subjectData: Record<string, any> = {};
        subjectsList.forEach(sub => {
          const m = examMarks.find(x => x.subject === sub);
          subjectData[sub] = {
            percentage: m ? safeNum(m.percentage) : null,
            total_obtained: m ? safeNum(m.total_obtained) : null,
            total_max: m ? safeNum(m.total_max) : null,
            competency_scores: m ? m.competency_scores : [],
          };
          if (m && !m.is_absent && m.total_obtained !== null) {
            to += +m.total_obtained;
            tm += +m.total_max;
          }
        });
        const grand_pct = tm > 0 ? +((to / tm) * 100).toFixed(2) : null;
        return { exam, subjects: subjectData, grand_percentage: grand_pct };
      });

      return { academic_year: year, grade, subjects: subjectsList, exams: examSummary };
    });

    return { years };
  }

  // ── EXAM TYPES available ─────────────────────────────────────

  async getExamTypes(academic_year: string, grade?: string) {
    const where: any = { academic_year, is_active: true };
    if (grade) where.grade = grade;
    const configs = await this.configRepo.find({ where });
    const examTypes = [...new Set(configs.map(c => c.exam_type))].sort((a, b) => {
      return (EXAM_ORDER.indexOf(a) === -1 ? 99 : EXAM_ORDER.indexOf(a)) -
             (EXAM_ORDER.indexOf(b) === -1 ? 99 : EXAM_ORDER.indexOf(b));
    });
    return { examTypes };
  }

  // ── CLEAR OLD DATA ───────────────────────────────────────────

  async clearAllPasaData() {
    await this.marksRepo.query('DELETE FROM exam_marks');
    await this.configRepo.query('DELETE FROM exam_configs');
    return { success: true, message: 'All PASA data cleared' };
  }

  // ── STUDENT ANALYSIS (all exams, all subjects, competency detail) ────
  async getStudentAnalysis(student_id: string, academic_year: string) {
    const allMarks = await this.marksRepo.find({
      where: { student_id, academic_year, is_active: true },
      order: { exam_type: 'ASC' },
    });
    if (!allMarks.length) return null;

    const grade = allMarks[0].grade;
    const section = allMarks[0].section;
    const examTypes = [...new Set(allMarks.map(m => m.exam_type))].sort((a, b) => {
      const ai = EXAM_ORDER.indexOf(a); const bi = EXAM_ORDER.indexOf(b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
    const subjects = [...new Set(allMarks.map(m => m.subject))].sort();

    const examSummary = examTypes.map(exam => {
      const examMarks = allMarks.filter(m => m.exam_type === exam);
      const subjectData: Record<string, any> = {};
      let to = 0, tm = 0;
      subjects.forEach(sub => {
        const m = examMarks.find(x => x.subject === sub);
        subjectData[sub] = {
          total_obtained: m ? safeNum(m.total_obtained) : null,
          total_max: m ? safeNum(m.total_max) : null,
          percentage: m ? safeNum(m.percentage) : null,
          is_absent: m?.is_absent || false,
          competency_scores: m ? m.competency_scores : [],
        };
        if (m && !m.is_absent && m.total_obtained !== null) {
          to += safeNum(m.total_obtained) || 0;
          tm += safeNum(m.total_max) || 0;
        }
      });
      const grand_pct = tm > 0 ? +((to / tm) * 100).toFixed(2) : null;
      const band = grand_pct !== null
        ? grand_pct >= 90 ? 'A+' : grand_pct >= 75 ? 'A' : grand_pct >= 60 ? 'B' : grand_pct >= 40 ? 'C' : 'D'
        : null;
      return { exam, subjects: subjectData, total_obtained: to, total_max: tm, grand_percentage: grand_pct, band };
    });

    // Subject trend across exams
    const subjectTrend = subjects.map(sub => {
      const points = examTypes.map(exam => {
        const m = allMarks.find(x => x.exam_type === exam && x.subject === sub);
        return { exam, percentage: m ? safeNum(m.percentage) : null, is_absent: m?.is_absent || false };
      });
      return { subject: sub, trend: points };
    });

    // Competency-level summary (best and worst per competency)
    const compMap: Record<string, { code: string; name: string; scores: number[] }> = {};
    allMarks.forEach(m => {
      (m.competency_scores as any[]).forEach((cs: any) => {
        if (!compMap[cs.competency_code]) {
          compMap[cs.competency_code] = { code: cs.competency_code, name: cs.competency_name, scores: [] };
        }
        if (cs.marks_obtained !== null && cs.max_marks > 0) {
          compMap[cs.competency_code].scores.push((cs.marks_obtained / cs.max_marks) * 100);
        }
      });
    });
    const competencyProfile = Object.values(compMap).map(c => ({
      code: c.code, name: c.name,
      avg: avg(c.scores), attempts: c.scores.length,
    })).sort((a, b) => a.avg - b.avg);

    return { student_id, grade, section, academic_year, subjects, examTypes, examSummary, subjectTrend, competencyProfile };
  }

  // ── LONGITUDINAL TREND (subject % across exams for a section) ─────────
  async getLongitudinalTrend(grade: string, section: string, academic_year: string) {
    const allMarks = await this.marksRepo.find({
      where: { grade, section, academic_year, is_active: true },
    });
    if (!allMarks.length) return { trends: [] };

    const subjects = [...new Set(allMarks.map(m => m.subject))].sort();
    const examTypes = [...new Set(allMarks.map(m => m.exam_type))].sort((a, b) => {
      const ai = EXAM_ORDER.indexOf(a); const bi = EXAM_ORDER.indexOf(b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });

    const trends = subjects.map(sub => {
      const points = examTypes.map(exam => {
        const examMarks = allMarks.filter(m => m.exam_type === exam && m.subject === sub && !m.is_absent && m.percentage !== null);
        const avgPct = examMarks.length ? avg(examMarks.map(m => +(m.percentage ?? 0))) : null;
        return { exam, avg_percentage: avgPct, student_count: examMarks.length };
      });
      return { subject: sub, points };
    });

    // Also overall trend (all subjects combined)
    const overallPoints = examTypes.map(exam => {
      const examMarks = allMarks.filter(m => m.exam_type === exam && !m.is_absent && m.percentage !== null);
      return { exam, avg_percentage: examMarks.length ? avg(examMarks.map(m => +(m.percentage ?? 0))) : null };
    });

    return { grade, section, academic_year, subjects, examTypes, trends, overallTrend: overallPoints };
  }

  // ── ADVANCING / RETRACTING (between two consecutive exams) ────────────
  async getAdvancingRetracting(grade: string, section: string, academic_year: string, exam1: string, exam2: string) {
    const [marks1, marks2] = await Promise.all([
      this.marksRepo.find({ where: { grade, section, academic_year, exam_type: exam1, is_active: true } }),
      this.marksRepo.find({ where: { grade, section, academic_year, exam_type: exam2, is_active: true } }),
    ]);

    const studentMap: Record<string, { name: string; pct1: number | null; pct2: number | null }> = {};

    marks1.filter(m => !m.is_absent && m.percentage !== null).forEach(m => {
      if (!studentMap[m.student_id]) studentMap[m.student_id] = { name: m.student_name, pct1: null, pct2: null };
      studentMap[m.student_id].pct1 = +(m.percentage ?? 0);
    });
    marks2.filter(m => !m.is_absent && m.percentage !== null).forEach(m => {
      if (!studentMap[m.student_id]) studentMap[m.student_id] = { name: m.student_name, pct1: null, pct2: null };
      studentMap[m.student_id].pct2 = +(m.percentage ?? 0);
    });

    const advancing: any[] = [];
    const retracting: any[] = [];
    const steady: any[] = [];

    Object.entries(studentMap).forEach(([id, d]) => {
      if (d.pct1 === null || d.pct2 === null) return;
      const diff = +(d.pct2 - d.pct1).toFixed(2);
      const entry = { student_id: id, student_name: d.name, pct1: d.pct1, pct2: d.pct2, diff };
      if (diff > 2) advancing.push(entry);
      else if (diff < -2) retracting.push(entry);
      else steady.push(entry);
    });

    advancing.sort((a, b) => b.diff - a.diff);
    retracting.sort((a, b) => a.diff - b.diff);

    return {
      grade, section, academic_year, exam1, exam2,
      advancing, retracting, steady,
      summary: { advancing: advancing.length, retracting: retracting.length, steady: steady.length },
    };
  }
}
