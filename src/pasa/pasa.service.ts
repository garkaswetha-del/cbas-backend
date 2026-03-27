import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExamConfig } from './entities/exam-config.entity/exam-config.entity';
import { ExamMarks } from './entities/exam-marks.entity/exam-marks.entity';
import { Student } from '../students/entities/student.entity/student.entity';
import * as XLSX from 'xlsx';

const EXAM_ORDER = ['PA1', 'PA2', 'SA1', 'PA3', 'PA4', 'SA2'];

const GRADE_BANDS = [
  { key: 'A', label: 'A (< 33)', min: 0, max: 32.99, color: '#ef4444' },
  { key: 'M2', label: 'M2 (33-59)', min: 33, max: 59.99, color: '#f97316' },
  { key: 'M1', label: 'M1 (60-79)', min: 60, max: 79.99, color: '#f59e0b' },
  { key: 'E2', label: 'E2 (80-85)', min: 80, max: 85.99, color: '#84cc16' },
  { key: 'E1', label: 'E1 (86-89)', min: 86, max: 89.99, color: '#10b981' },
  { key: 'A+', label: 'A+ (90-100)', min: 90, max: 100, color: '#6366f1' },
];

function getBand(pct: number): string {
  for (const b of GRADE_BANDS) {
    if (pct >= b.min && pct <= b.max) return b.key;
  }
  return 'A';
}

function avg(arr: number[]): number {
  if (!arr.length) return 0;
  return +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2);
}

function calcBandDist(percentages: number[]) {
  const dist: Record<string, { count: number; percentage: number }> = {};
  GRADE_BANDS.forEach(b => { dist[b.key] = { count: 0, percentage: 0 }; });
  percentages.forEach(p => {
    const band = getBand(p);
    dist[band].count++;
  });
  const total = percentages.length;
  Object.keys(dist).forEach(k => {
    dist[k].percentage = total > 0 ? +((dist[k].count / total) * 100).toFixed(2) : 0;
  });
  return dist;
}

function safeNum(val: number | null | undefined): number {
  return val ?? 0;
}

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
    subjects: { subject: string; max_marks: number }[];
    exam_date?: string;
  }) {
    const results: ExamConfig[] = [];
    for (const s of data.subjects) {
      const existing = await this.configRepo.findOne({
        where: {
          academic_year: data.academic_year,
          exam_type: data.exam_type,
          grade: data.grade,
          subject: s.subject,
        },
      });
      if (existing) {
        await this.configRepo.update(existing.id, {
          max_marks: s.max_marks,
          exam_date: data.exam_date,
        });
        results.push(existing);
      } else {
        const config = this.configRepo.create({
          academic_year: data.academic_year,
          exam_type: data.exam_type,
          grade: data.grade,
          subject: s.subject,
          max_marks: s.max_marks,
          exam_date: data.exam_date,
        });
        results.push(await this.configRepo.save(config));
      }
    }
    return results;
  }

  async getExamConfig(academic_year: string, exam_type: string, grade: string) {
    return this.configRepo.find({
      where: { academic_year, exam_type, grade, is_active: true },
      order: { subject: 'ASC' },
    });
  }

  async getExamTypes(academic_year: string, grade?: string) {
    const query = this.configRepo.createQueryBuilder('c')
      .select('DISTINCT c.exam_type', 'exam_type')
      .where('c.academic_year = :ay', { ay: academic_year })
      .andWhere('c.is_active = true');
    if (grade) query.andWhere('c.grade = :grade', { grade });
    const res = await query.getRawMany();
    return res.map(r => r.exam_type);
  }

  // ── MARKS ENTRY ──────────────────────────────────────────────

  async saveMarks(data: {
    academic_year: string;
    exam_type: string;
    grade: string;
    section: string;
    entries: {
      student_id?: string;
      student_name: string;
      roll_number?: string;
      subject: string;
      marks_obtained: number | null;
      max_marks: number;
      is_absent?: boolean;
    }[];
  }) {
    const results = { saved: 0, failed: 0 };
    for (const entry of data.entries) {
      try {
        const pct = entry.is_absent || entry.marks_obtained === null
          ? undefined
          : +((entry.marks_obtained / entry.max_marks) * 100).toFixed(2);

        const existing = await this.marksRepo.findOne({
          where: {
            academic_year: data.academic_year,
            exam_type: data.exam_type,
            grade: data.grade,
            section: data.section,
            student_name: entry.student_name,
            subject: entry.subject,
          },
        });

        if (existing) {
          await this.marksRepo.update(existing.id, {
            marks_obtained: entry.marks_obtained ?? undefined,
            max_marks: entry.max_marks,
            percentage: pct,
            is_absent: entry.is_absent || false,
            roll_number: entry.roll_number ?? undefined,
            student_id: entry.student_id ?? undefined,
          });
        } else {
          await this.marksRepo.save(this.marksRepo.create({
            student_id: entry.student_id ?? undefined,
            student_name: entry.student_name,
            roll_number: entry.roll_number ?? undefined,
            grade: data.grade,
            section: data.section,
            academic_year: data.academic_year,
            exam_type: data.exam_type,
            subject: entry.subject,
            marks_obtained: entry.marks_obtained ?? undefined,
            max_marks: entry.max_marks,
            percentage: pct,
            is_absent: entry.is_absent || false,
          }));
        }
        results.saved++;
      } catch { results.failed++; }
    }
    return results;
  }

  async getMarksTable(academic_year: string, exam_type: string, grade: string, section: string) {
    const students = await this.studentRepo.find({
      where: { current_class: grade, section, is_active: true },
      order: { name: 'ASC' },
    });

    const configs = await this.configRepo.find({
      where: { academic_year, exam_type, grade, is_active: true },
      order: { subject: 'ASC' },
    });

    const existingMarks = await this.marksRepo.find({
      where: { academic_year, exam_type, grade, section, is_active: true },
    });

    const subjects = configs.map(c => c.subject);

    const rows = students.map(student => {
      const studentMarks: Record<string, any> = {};
      let totalObtained = 0;
      let totalMax = 0;

      subjects.forEach(subject => {
        const mark = existingMarks.find(
          m => m.student_name === student.name && m.subject === subject
        );
        const config = configs.find(c => c.subject === subject);
        studentMarks[subject] = {
          marks: mark?.marks_obtained ?? null,
          max_marks: config?.max_marks || 100,
          percentage: mark?.percentage ?? null,
          is_absent: mark?.is_absent || false,
        };
        if (mark && !mark.is_absent && mark.marks_obtained !== null) {
          totalObtained += safeNum(mark.marks_obtained);
          totalMax += safeNum(mark.max_marks);
        }
      });

      const grand_percentage = totalMax > 0
        ? +((totalObtained / totalMax) * 100).toFixed(2)
        : null;

      return {
        student_id: student.id,
        student_name: student.name,
        roll_number: student.admission_no,
        subjects: studentMarks,
        total_obtained: totalObtained,
        total_max: totalMax,
        grand_percentage,
        band: grand_percentage ? getBand(grand_percentage) : null,
      };
    });

    return { students: rows, subjects, configs };
  }

  // ── IMPORT FROM EXCEL ─────────────────────────────────────────

  async importFromExcel(buffer: Buffer, academic_year: string, exam_type: string) {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const results = { sheets_processed: 0, marks_saved: 0, errors: [] as string[] };

    for (const sheetName of wb.SheetNames) {
      if (sheetName === 'SHEET LINK') continue;
      try {
        const ws = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as any[][];

        const gradeMatch = sheetName.match(/G(\d+)/i);
        if (!gradeMatch) continue;
        const grade = `Grade ${gradeMatch[1]}`;

        const sectionName = sheetName
          .replace(/G\d+\s*/i, '')
          .replace(/Final|Preparatory/gi, '')
          .trim();

        let headerRowIdx = -1;
        for (let i = 0; i < Math.min(rows.length, 5); i++) {
          if (rows[i] && rows[i].some((c: any) =>
            (c && String(c).toLowerCase().includes('roll')) ||
            (c && String(c).toLowerCase().includes('student'))
          )) {
            headerRowIdx = i;
            break;
          }
        }
        if (headerRowIdx < 0) continue;

        const headers = rows[headerRowIdx].map((h: any) => h ? String(h).trim().toUpperCase() : null);
        const subjectCols: { subject: string; colIdx: number }[] = [];

        headers.forEach((h, i) => {
          if (!h) return;
          if (h === 'ROLL NO' || h === 'STUDENT NAME' || h.includes('GRAND') || h.includes('PERCENTAGE')) return;
          subjectCols.push({ subject: h, colIdx: i });
        });

        for (const sc of subjectCols) {
          const existing = await this.configRepo.findOne({
            where: { academic_year, exam_type, grade, subject: sc.subject },
          });
          if (!existing) {
            await this.configRepo.save(this.configRepo.create({
              academic_year, exam_type, grade, subject: sc.subject, max_marks: 100,
            }));
          }
        }

        for (let i = headerRowIdx + 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || !row[1]) continue;

          const studentName = String(row[1]).trim();
          if (!studentName ||
            studentName.toLowerCase().includes('average') ||
            studentName.toLowerCase().includes('less than') ||
            studentName.toLowerCase().includes('percentage')) break;

          const rollNo = row[0] ? String(row[0]).replace('.0', '') : undefined;

          for (const sc of subjectCols) {
            const rawMark = row[sc.colIdx];
            if (rawMark === null || rawMark === undefined) continue;
            const marks = parseFloat(String(rawMark));
            if (isNaN(marks)) continue;

            const existing = await this.marksRepo.findOne({
              where: { academic_year, exam_type, grade, section: sectionName, student_name: studentName, subject: sc.subject },
            });

            const pct = +((marks / 100) * 100).toFixed(2);

            if (existing) {
              await this.marksRepo.update(existing.id, {
                marks_obtained: marks,
                max_marks: 100,
                percentage: pct,
                roll_number: rollNo,
              });
            } else {
              await this.marksRepo.save(this.marksRepo.create({
                student_name: studentName,
                roll_number: rollNo,
                grade,
                section: sectionName,
                academic_year,
                exam_type,
                subject: sc.subject,
                marks_obtained: marks,
                max_marks: 100,
                percentage: pct,
              }));
            }
            results.marks_saved++;
          }
        }
        results.sheets_processed++;
      } catch (e) {
        results.errors.push(`${sheetName}: ${String(e)}`);
      }
    }
    return results;
  }

  // ── SECTION ANALYSIS ─────────────────────────────────────────

  async getSectionAnalysis(academic_year: string, exam_type: string, grade: string, section: string) {
    const marks = await this.marksRepo.find({
      where: { academic_year, exam_type, grade, section, is_active: true },
    });
    if (!marks.length) return null;

    const subjects = [...new Set(marks.map(m => m.subject))].sort();
    const studentNames = [...new Set(marks.map(m => m.student_name))].sort();

    const studentRows = studentNames.map(name => {
      const studentMarks = marks.filter(m => m.student_name === name);
      const subjectData: Record<string, any> = {};
      let totalObtained = 0, totalMax = 0;

      subjects.forEach(sub => {
        const m = studentMarks.find(x => x.subject === sub);
        subjectData[sub] = {
          marks: m ? safeNum(m.marks_obtained) : null,
          max_marks: m ? safeNum(m.max_marks) : 100,
          percentage: m ? safeNum(m.percentage) : null,
          is_absent: m?.is_absent || false,
        };
        if (m && !m.is_absent && m.marks_obtained !== null) {
          totalObtained += safeNum(m.marks_obtained);
          totalMax += safeNum(m.max_marks);
        }
      });

      const grand_pct = totalMax > 0 ? +((totalObtained / totalMax) * 100).toFixed(2) : null;
      return {
        student_name: name,
        roll_number: studentMarks[0]?.roll_number,
        subjects: subjectData,
        total_obtained: totalObtained,
        total_max: totalMax,
        grand_percentage: grand_pct,
        band: grand_pct ? getBand(grand_pct) : null,
      };
    });

    const sortedHighToLow = [...studentRows]
      .sort((a, b) => (b.grand_percentage || 0) - (a.grand_percentage || 0))
      .map((s, i) => ({ ...s, rank: i + 1 }));

    const subjectAverages: Record<string, number> = {};
    subjects.forEach(sub => {
      const vals = marks
        .filter(m => m.subject === sub && !m.is_absent && m.percentage !== null)
        .map(m => safeNum(m.percentage));
      subjectAverages[sub] = avg(vals);
    });

    const bandDistribution: Record<string, any> = {};
    subjects.forEach(sub => {
      const pcts = marks
        .filter(m => m.subject === sub && !m.is_absent && m.percentage !== null)
        .map(m => safeNum(m.percentage));
      bandDistribution[sub] = calcBandDist(pcts);
    });

    const grandPcts = studentRows
      .filter(s => s.grand_percentage !== null)
      .map(s => s.grand_percentage as number);
    const overallBandDist = calcBandDist(grandPcts);

    const grandVsSubject: Record<string, any[]> = {};
    subjects.forEach(sub => {
      grandVsSubject[sub] = sortedHighToLow.map(s => ({
        student_name: s.student_name,
        grand_percentage: s.grand_percentage,
        subject_percentage: s.subjects[sub]?.percentage,
      }));
    });

    const passFail: Record<string, { pass: number; fail: number; absent: number; pass_pct: number }> = {};
    subjects.forEach(sub => {
      const subMarks = marks.filter(m => m.subject === sub);
      const absent = subMarks.filter(m => m.is_absent).length;
      const pass = subMarks.filter(m => !m.is_absent && m.percentage !== null && safeNum(m.percentage) >= 33).length;
      const fail = subMarks.filter(m => !m.is_absent && m.percentage !== null && safeNum(m.percentage) < 33).length;
      const total = pass + fail;
      passFail[sub] = { pass, fail, absent, pass_pct: total > 0 ? +((pass / total) * 100).toFixed(1) : 0 };
    });

    return {
      grade, section, exam_type, academic_year,
      total_students: studentNames.length,
      section_avg: avg(grandPcts),
      subjects,
      subject_averages: subjectAverages,
      band_distribution: bandDistribution,
      overall_band_distribution: overallBandDist,
      grand_vs_subject: grandVsSubject,
      pass_fail: passFail,
      students_alphabetical: studentRows,
      students_ranked: sortedHighToLow,
      grade_bands: GRADE_BANDS,
    };
  }

  // ── GRADE ANALYSIS ───────────────────────────────────────────

  async getGradeAnalysis(academic_year: string, exam_type: string, grade: string) {
    const marks = await this.marksRepo.find({
      where: { academic_year, exam_type, grade, is_active: true },
    });
    if (!marks.length) return null;

    const sections = [...new Set(marks.map(m => m.section))].sort();
    const subjects = [...new Set(marks.map(m => m.subject))].sort();

    const sectionAverages: Record<string, number> = {};
    for (const section of sections) {
      const sectionMarks = marks.filter(m => m.section === section && !m.is_absent);
      const studentNames = [...new Set(sectionMarks.map(m => m.student_name))];
      const grandPcts = studentNames.map(name => {
        const sm = sectionMarks.filter(m => m.student_name === name);
        const to = sm.reduce((s, m) => s + safeNum(m.marks_obtained), 0);
        const tm = sm.reduce((s, m) => s + safeNum(m.max_marks), 0);
        return tm > 0 ? (to / tm) * 100 : 0;
      });
      sectionAverages[section] = avg(grandPcts);
    }

    const subjectSectionAvg: Record<string, Record<string, number>> = {};
    subjects.forEach(sub => {
      subjectSectionAvg[sub] = {};
      sections.forEach(sec => {
        const vals = marks
          .filter(m => m.subject === sub && m.section === sec && !m.is_absent && m.percentage !== null)
          .map(m => safeNum(m.percentage));
        subjectSectionAvg[sub][sec] = avg(vals);
      });
    });

    const subjectAverages: Record<string, number> = {};
    subjects.forEach(sub => {
      const vals = marks
        .filter(m => m.subject === sub && !m.is_absent && m.percentage !== null)
        .map(m => safeNum(m.percentage));
      subjectAverages[sub] = avg(vals);
    });

    const bandDistribution: Record<string, any> = {};
    subjects.forEach(sub => {
      const pcts = marks
        .filter(m => m.subject === sub && !m.is_absent && m.percentage !== null)
        .map(m => safeNum(m.percentage));
      bandDistribution[sub] = calcBandDist(pcts);
    });

    const studentNames = [...new Set(marks.map(m => m.student_name))];
    const studentGrandPcts = studentNames.map(name => {
      const sm = marks.filter(m => m.student_name === name && !m.is_absent);
      const to = sm.reduce((s, m) => s + safeNum(m.marks_obtained), 0);
      const tm = sm.reduce((s, m) => s + safeNum(m.max_marks), 0);
      const section = marks.find(m => m.student_name === name)?.section;
      return {
        student_name: name,
        section,
        grand_percentage: tm > 0 ? +((to / tm) * 100).toFixed(2) : 0,
      };
    }).sort((a, b) => b.grand_percentage - a.grand_percentage)
      .map((s, i) => ({ ...s, rank: i + 1 }));

    return {
      grade, exam_type, academic_year,
      sections, subjects,
      section_averages: sectionAverages,
      subject_averages: subjectAverages,
      subject_section_avg: subjectSectionAvg,
      band_distribution: bandDistribution,
      top10: studentGrandPcts.slice(0, 10),
      bottom10: studentGrandPcts.slice(-10).reverse(),
      grade_bands: GRADE_BANDS,
    };
  }

  // ── SCHOOL ANALYSIS ──────────────────────────────────────────

  async getSchoolAnalysis(academic_year: string, exam_type: string) {
    const marks = await this.marksRepo.find({
      where: { academic_year, exam_type, is_active: true },
    });
    if (!marks.length) return null;

    const grades = [...new Set(marks.map(m => m.grade))].sort();
    const subjects = [...new Set(marks.map(m => m.subject))].sort();

    const gradeAverages: Record<string, number> = {};
    grades.forEach(grade => {
      const studentNames = [...new Set(marks.filter(m => m.grade === grade).map(m => m.student_name))];
      const grandPcts = studentNames.map(name => {
        const sm = marks.filter(m => m.student_name === name && m.grade === grade && !m.is_absent);
        const to = sm.reduce((s, m) => s + safeNum(m.marks_obtained), 0);
        const tm = sm.reduce((s, m) => s + safeNum(m.max_marks), 0);
        return tm > 0 ? (to / tm) * 100 : 0;
      });
      gradeAverages[grade] = avg(grandPcts);
    });

    const subjectAverages: Record<string, number> = {};
    subjects.forEach(sub => {
      const vals = marks
        .filter(m => m.subject === sub && !m.is_absent && m.percentage !== null)
        .map(m => safeNum(m.percentage));
      subjectAverages[sub] = avg(vals);
    });

    const allStudents = [...new Set(marks.map(m => m.student_name))];
    const allGrandPcts = allStudents.map(name => {
      const sm = marks.filter(m => m.student_name === name && !m.is_absent);
      const to = sm.reduce((s, m) => s + safeNum(m.marks_obtained), 0);
      const tm = sm.reduce((s, m) => s + safeNum(m.max_marks), 0);
      return tm > 0 ? (to / tm) * 100 : 0;
    });

    return {
      exam_type, academic_year,
      total_students: allStudents.length,
      school_avg: avg(allGrandPcts),
      grades, subjects,
      grade_averages: gradeAverages,
      subject_averages: subjectAverages,
      overall_band_distribution: calcBandDist(allGrandPcts),
      grade_bands: GRADE_BANDS,
    };
  }

  // ── LONGITUDINAL ANALYSIS ────────────────────────────────────

  async getLongitudinalAnalysis(academic_year: string, grade: string, section?: string) {
    const examTypes = await this.configRepo
      .createQueryBuilder('c')
      .select('DISTINCT c.exam_type', 'exam_type')
      .where('c.academic_year = :ay', { ay: academic_year })
      .andWhere('c.grade = :grade', { grade })
      .getRawMany();

    const availableExams = examTypes
      .map(e => e.exam_type)
      .sort((a, b) => {
        const ai = EXAM_ORDER.indexOf(a);
        const bi = EXAM_ORDER.indexOf(b);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      });

    const longitudinalData: any[] = [];

    for (const examType of availableExams) {
      const query = this.marksRepo.createQueryBuilder('m')
        .where('m.academic_year = :ay', { ay: academic_year })
        .andWhere('m.exam_type = :et', { et: examType })
        .andWhere('m.grade = :grade', { grade })
        .andWhere('m.is_active = true')
        .andWhere('m.is_absent = false');
      if (section) query.andWhere('m.section = :section', { section });

      const marks = await query.getMany();
      if (!marks.length) continue;

      const subjects = [...new Set(marks.map(m => m.subject))].sort();
      const point: any = { exam: examType };

      subjects.forEach(sub => {
        const vals = marks
          .filter(m => m.subject === sub && m.percentage !== null)
          .map(m => safeNum(m.percentage));
        point[sub] = avg(vals);
      });

      const studentNames = [...new Set(marks.map(m => m.student_name))];
      const grandPcts = studentNames.map(name => {
        const sm = marks.filter(m => m.student_name === name);
        const to = sm.reduce((s, m) => s + safeNum(m.marks_obtained), 0);
        const tm = sm.reduce((s, m) => s + safeNum(m.max_marks), 0);
        return tm > 0 ? (to / tm) * 100 : 0;
      });
      point['Overall'] = avg(grandPcts);
      longitudinalData.push(point);
    }

    return { grade, section, academic_year, exams: availableExams, data: longitudinalData };
  }

  // ── STUDENT ANALYSIS ─────────────────────────────────────────

  async getStudentAnalysis(academic_year: string, student_name: string) {
    const allMarks = await this.marksRepo.find({
      where: { academic_year, student_name, is_active: true },
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
          marks: m ? safeNum(m.marks_obtained) : null,
          max_marks: m ? safeNum(m.max_marks) : 100,
          percentage: m ? safeNum(m.percentage) : null,
          is_absent: m?.is_absent || false,
        };
        if (m && !m.is_absent && m.marks_obtained !== null) {
          to += safeNum(m.marks_obtained);
          tm += safeNum(m.max_marks);
        }
      });
      const grand_pct = tm > 0 ? +((to / tm) * 100).toFixed(2) : null;
      return { exam, subjects: subjectData, total_obtained: to, total_max: tm, grand_percentage: grand_pct, band: grand_pct ? getBand(grand_pct) : null };
    });

    const subjectTrend: any[] = examTypes.map(exam => {
      const point: any = { exam };
      subjects.forEach(sub => {
        const m = allMarks.find(x => x.exam_type === exam && x.subject === sub);
        point[sub] = m && !m.is_absent ? safeNum(m.percentage) : null;
      });
      const es = examSummary.find(e => e.exam === exam);
      point['Overall'] = es?.grand_percentage;
      return point;
    });

    const rankPerExam: Record<string, number | null> = {};
    for (const exam of examTypes) {
      const allSectionMarks = await this.marksRepo.find({
        where: { academic_year, exam_type: exam, grade, section, is_active: true },
      });
      const studentNames = [...new Set(allSectionMarks.map(m => m.student_name))];
      const grandPcts = studentNames.map(name => {
        const sm = allSectionMarks.filter(m => m.student_name === name && !m.is_absent);
        const to = sm.reduce((s, m) => s + safeNum(m.marks_obtained), 0);
        const tm = sm.reduce((s, m) => s + safeNum(m.max_marks), 0);
        return { name, pct: tm > 0 ? (to / tm) * 100 : 0 };
      }).sort((a, b) => b.pct - a.pct);
      const rank = grandPcts.findIndex(s => s.name === student_name) + 1;
      rankPerExam[exam] = rank > 0 ? rank : null;
    }

    return {
      student_name, grade, section, academic_year,
      exam_types: examTypes, subjects,
      exam_summary: examSummary,
      subject_trend: subjectTrend,
      rank_per_exam: rankPerExam,
    };
  }

  // ── SEARCH STUDENTS ──────────────────────────────────────────

  async searchStudents(academic_year: string, query: string) {
    return this.marksRepo
      .createQueryBuilder('m')
      .select('DISTINCT m.student_name', 'student_name')
      .addSelect('m.grade', 'grade')
      .addSelect('m.section', 'section')
      .where('m.academic_year = :ay', { ay: academic_year })
      .andWhere('m.student_name ILIKE :q', { q: `%${query}%` })
      .getRawMany();
  }

  async getSectionsForGrade(academic_year: string, grade: string) {
    const res = await this.marksRepo
      .createQueryBuilder('m')
      .select('DISTINCT m.section', 'section')
      .where('m.academic_year = :ay', { ay: academic_year })
      .andWhere('m.grade = :grade', { grade })
      .getRawMany();
    return res.map(r => r.section).sort();
  }

  async getSubjectsForGradeExam(academic_year: string, exam_type: string, grade: string) {
    const configs = await this.configRepo.find({
      where: { academic_year, exam_type, grade, is_active: true },
      order: { subject: 'ASC' },
    });
    if (configs.length) return configs.map(c => c.subject);
    const res = await this.marksRepo
      .createQueryBuilder('m')
      .select('DISTINCT m.subject', 'subject')
      .where('m.academic_year = :ay', { ay: academic_year })
      .andWhere('m.exam_type = :et', { et: exam_type })
      .andWhere('m.grade = :grade', { grade })
      .getRawMany();
    return res.map(r => r.subject).sort();
  }
async getConsecutiveDeclineStudents(academic_year: string) {
    // Get all exam marks for this year ordered by exam sequence
    const marks = await this.marksRepo.find({
      where: { academic_year, is_active: true },
    });
    if (!marks.length) return [];

    const EXAM_ORDER = ['PA1', 'PA2', 'SA1', 'PA3', 'PA4', 'SA2'];

    // Get unique students
    const studentNames = [...new Set(marks.map(m => m.student_name))];
    const declining: any[] = [];

    for (const studentName of studentNames) {
      const studentMarks = marks.filter(m => m.student_name === studentName);
      const grade = studentMarks[0]?.grade;
      const section = studentMarks[0]?.section;

      // Get exam types this student has taken, in order
      const examTypes = [...new Set(studentMarks.map(m => m.exam_type))]
        .sort((a, b) => {
          const ai = EXAM_ORDER.indexOf(a);
          const bi = EXAM_ORDER.indexOf(b);
          return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        });

      if (examTypes.length < 3) continue;

      // Compute grand % per exam
      const examAvgs: { exam: string; pct: number }[] = [];
      for (const exam of examTypes) {
        const examMarks = studentMarks.filter(m => m.exam_type === exam && !m.is_absent && m.marks_obtained !== null);
        if (!examMarks.length) continue;
        const totalObtained = examMarks.reduce((sum, m) => sum + +(m.marks_obtained ?? 0), 0);
        const totalMax = examMarks.reduce((sum, m) => sum + +m.max_marks, 0);
        const pct = totalMax > 0 ? +((totalObtained / totalMax) * 100).toFixed(2) : 0;
        examAvgs.push({ exam, pct });
      }

      if (examAvgs.length < 3) continue;

      // Check for 3 consecutive declines anywhere in sequence
      for (let i = 0; i <= examAvgs.length - 3; i++) {
        const p1 = examAvgs[i].pct;
        const p2 = examAvgs[i + 1].pct;
        const p3 = examAvgs[i + 2].pct;
        if (p1 > p2 && p2 > p3) {
          declining.push({
            student_name: studentName,
            grade,
            section,
            exam_scores: examAvgs,
            decline_from: p1,
            decline_to: p3,
            drop: +(p1 - p3).toFixed(2),
          });
          break;
        }
      }
    }

    return declining.sort((a, b) => b.drop - a.drop);
  }
}