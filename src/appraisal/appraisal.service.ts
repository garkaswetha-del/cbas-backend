import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TeacherAppraisal } from '../assessments/entities/teacher-appraisal.entity/teacher-appraisal.entity';
import { User } from '../users/entities/user.entity/user.entity';
import { UserRole } from '../users/entities/user.entity/user.entity';
import { TeacherMapping } from '../mappings/entities/teacher-mapping.entity/teacher-mapping.entity';

@Injectable()
export class AppraisalService {
  constructor(
    @InjectRepository(TeacherAppraisal)
    private appraisalRepo: Repository<TeacherAppraisal>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(TeacherMapping)
    private mappingRepo: Repository<TeacherMapping>,
  ) {}

  async getAllAppraisals(academic_year: string) {
    // Get distinct teacher_ids that have active mappings for this year
    const mappings = await this.mappingRepo.find({
      where: { academic_year, is_active: true },
    });
    const teacherIdsInYear = [...new Set(mappings.map(m => m.teacher_id))];

    if (teacherIdsInYear.length === 0) {
      return [];
    }

    const teachers = await this.userRepo.findByIds(teacherIdsInYear);
    const appraisals = await this.appraisalRepo.find({ where: { academic_year } });

    // Fetch over_salary_cap via raw query — gracefully falls back to false if column not yet migrated
    const capMap: Record<string, boolean> = {};
    try {
      const rows: { id: string; over_salary_cap: boolean }[] = await this.userRepo.query(
        `SELECT id, over_salary_cap FROM users WHERE role = 'teacher'`
      );
      rows.forEach(r => { capMap[r.id] = r.over_salary_cap || false; });
    } catch { /* column doesn't exist yet — all teachers default to false */ }

    // Build year-specific grade list per teacher from mappings
    const gradesByTeacher: Record<string, string[]> = {};
    mappings.forEach(m => {
      if (!gradesByTeacher[m.teacher_id]) gradesByTeacher[m.teacher_id] = [];
      if (m.grade && !gradesByTeacher[m.teacher_id].includes(m.grade)) {
        gradesByTeacher[m.teacher_id].push(m.grade);
      }
    });

    return teachers.map((teacher) => {
      const appraisal = appraisals.find((a) => a.teacher_id === teacher.id);
      return {
        teacher_id: teacher.id,
        teacher_name: teacher.name,
        appraisal_qualification: teacher.appraisal_qualification || teacher.qualification || null,
        assigned_classes: gradesByTeacher[teacher.id] || [],
        over_salary_cap: capMap[teacher.id] ?? false,
        appraisal: appraisal || null,
      };
    });
  }

  async saveAppraisal(teacher_id: string, data: Partial<TeacherAppraisal>) {
    const existing = await this.appraisalRepo.findOne({
      where: { teacher_id, academic_year: data.academic_year },
    });

    // Merge incoming data with existing record so partial saves don't wipe untouched fields
    const merged: any = existing ? { ...existing, ...data } : { ...data };
    const isNursery = !!merged.literacy_band || !!merged.numeracy_band;
    const literacy_score = isNursery ? this.calculateLiteracyScore(merged) : 0;
    const numeracy_score = isNursery ? this.calculateNumeracyScore(merged) : 0;
    const exam_score = isNursery ? 0 : this.calculateExamScore(merged);
    const skills_score = this.calculateSkillsScore(merged);
    const behaviour_score = this.calculateBehaviourScore(merged);
    const parents_feedback_score = isNursery
      ? this.calculateParentsFeedbackScore(merged, 0.2)
      : this.calculateParentsFeedbackScore(merged, 0.1);
    const classroom_score = isNursery
      ? this.calculateClassroomScore(merged, 0.2)
      : this.calculateClassroomScore(merged, 0.1);
    const english_comm_score = isNursery
      ? this.calculateEnglishCommScore(merged, 0.2)
      : this.calculateEnglishCommScore(merged, 0.05);
    const responsibilities_score = this.calculateResponsibilitiesScore(merged);
    const overall_score = literacy_score + numeracy_score + exam_score + skills_score +
      behaviour_score + parents_feedback_score + classroom_score + english_comm_score + responsibilities_score;
    const overall_percentage = overall_score * 100;

    const appraisalData = {
      ...data, teacher_id, literacy_score, numeracy_score, exam_score, skills_score,
      behaviour_score, parents_feedback_score, classroom_score, english_comm_score,
      responsibilities_score, overall_score, overall_percentage,
    };

    // Get valid column names from entity metadata to avoid unknown field errors
    const meta = this.appraisalRepo.metadata;
    const validCols = new Set(meta.columns.map(c => c.propertyName));
    const safeData: any = {};
    Object.entries(appraisalData).forEach(([k, v]) => { if (validCols.has(k)) safeData[k] = v; });

    if (existing) {
      await this.appraisalRepo.update(existing.id, safeData);
      return this.appraisalRepo.findOne({ where: { id: existing.id } });
    } else {
      const newAppraisal = this.appraisalRepo.create(safeData);
      return this.appraisalRepo.save(newAppraisal);
    }
  }

  async getTeacherAppraisal(teacher_id: string, academic_year: string) {
    const appraisal = await this.appraisalRepo.findOne({ where: { teacher_id, academic_year } });
    if (!appraisal) throw new NotFoundException('Appraisal not found');
    return appraisal;
  }

  async shareAppraisal(id: string) {
    const appraisal = await this.appraisalRepo.findOne({ where: { id } });
    if (!appraisal) throw new NotFoundException('Appraisal not found');
    await this.appraisalRepo.update(id, { is_shared: true, shared_at: new Date().toISOString() });
    return { message: 'Appraisal shared successfully', id };
  }

  async unshareAppraisal(id: string) {
    const appraisal = await this.appraisalRepo.findOne({ where: { id } });
    if (!appraisal) throw new NotFoundException('Appraisal not found');
    await this.appraisalRepo.update(id, { is_shared: false, shared_at: null });
    return { message: 'Appraisal unshared', id };
  }

  async getSharedAppraisal(id: string) {
    const appraisal = await this.appraisalRepo.findOne({ where: { id } });
    if (!appraisal) throw new NotFoundException('Appraisal not found');
    if (!appraisal.is_shared) throw new NotFoundException('Appraisal not shared');
    return appraisal;
  }

  private calculateLiteracyScore(data: any): number {
    const map: Record<string, number> = {
      'CREATIVE METHODS FOR PHONICS, VOCABULARY, READING & WRITING - EXCELLENT - 5': 5,
      'REGULAR LITERACY PRACTICE USING STORIES, SONGS & WRITING - GOOD - 3': 3,
      'IRREGULAR OR LESS ENGAGING LITERACY ACTIVITIES - NEEDS IMPROVEMENT - 2': 2,
    };
    return ((map[data.literacy_band ?? ''] ?? 0) / 5) * 0.1;
  }

  private calculateNumeracyScore(data: any): number {
    const map: Record<string, number> = {
      'HANDS ON NUMBER CONCEPTS (COUNTING, PATTERNS, ETC) - EXCELLENT - 5 MARKS': 5,
      'REGULAR USE OF BASIC MATH THROUGH WORKSHEETS & OBJECTS - GOOD - 3 MARKS': 3,
      'LIMITED STRATEGIES OR IRREGULAR TEACHING - NEEDS IMPROVEMENT - 2 MARKS': 2,
    };
    return ((map[data.numeracy_band ?? ''] ?? 0) / 5) * 0.1;
  }

  private calculateExamScore(data: Partial<TeacherAppraisal>): number {
    const conducted = [data.pa1, data.pa2, data.pa3, data.pa4, data.sa1, data.sa2]
      .filter(v => v !== null && v !== undefined)
      .map(v => +v)
      .filter(v => v > 0);
    if (conducted.length === 0) return 0;
    const total = conducted.reduce((sum, v) => sum + v, 0);
    return (total / (conducted.length * 100)) * 0.5;
  }

  private calculateSkillsScore(data: Partial<TeacherAppraisal>): number {
    const map: Record<string, number> = {
      // Workshops
      'ATTENDED 41 TO 50:- 2 MARKS': 2, 'ATTENDED 21 TO 40:- 1.5 MARKS': 1.5,
      'ATTENDED 10 TO 20:- 1 MARK': 1,
      // Training
      'CONDUCTED 2 TRAINING:- 2 MARKS': 2, 'CONDUCTED 1 TRAINING:- 1 MARK': 1,
      // Books
      '8 & ABOVE:- 2 MARKS': 2, '6 TO 8:- 1.5 MARKS': 1.5, '4 TO 6:- 1 MARK': 1,
      // Articles & Strategies
      '2 & ABOVE:- 2 MARKS': 2, '1 TO 2:- 1 MARK': 1,
      // Not applicable = 0 (default)
      'NOT APPLICABLE :- 0 MARKS': 0,
    };
    const obtained =
      (map[data.workshops ?? ''] ?? 0) +
      (map[data.training_sessions ?? ''] ?? 0) +
      (map[data.books_read ?? ''] ?? 0) +
      (map[data.articles_published ?? ''] ?? 0) +
      (map[data.teaching_strategies ?? ''] ?? 0);
    return (obtained / 10) * 0.1;
  }

  private calculateBehaviourScore(data: Partial<TeacherAppraisal>): number {
    const map: Record<string, number> = {
      'HIGHLY CO-OPERATIVE: 2 MARKS': 2, 'GENERALLY CO-OPERATIVE: 1 MARK': 1, 'SOMETIMES CO-OPERATIVE: 0 MARKS': 0,
      'RESPECTFUL & FAIR TOWARDS STUDENTS:- 2 MARKS': 2, 'SOMETIMES RESPECTFUL & FAIR:- 1 MARK': 1, 'UNFAIR:- 0 MARKS': 0,
      'FULLY COMMITTED & ACTIVELY PROMOTES SCHOOL VALUES:- 2 MARKS': 2,
      'GENERALLY COMMITTED & SUPPORTS SCHOOL VALUES:- 1 MARK': 1, 'RARELY FOLLOWS & COMMITTED:- 0 MARKS': 0,
      'HIGHLY ADAPTABLE & FLEXIBLE:- 2 MARKS': 2, 'GENERALLY ADAPTABLE & FLEXIBLE:- 1 MARK': 1, 'STRUGGLES WITH ADAPTABILITY:- 0 MARKS': 0,
      'ALWAYS CLEAN, NEAT & WELL PRESENTED PROFESSIONALLY:- 2 MARKS': 2,
      'GENERALLY CLEAN & NEAT WITH OCCASIONAL LAPSES:- 1 MARK': 1, 'FREQUENTLY UNTIDY:- 0 MARKS': 0,
    };
    const obtained =
      (map[data.team_work ?? ''] ?? 0) +
      (map[data.attitude_towards_students ?? ''] ?? 0) +
      (map[data.commitment_to_values ?? ''] ?? 0) +
      (map[data.adaptability ?? ''] ?? 0) +
      (map[data.dressing ?? ''] ?? 0);
    return (obtained / 10) * 0.1;
  }

  private calculateParentsFeedbackScore(data: Partial<TeacherAppraisal>, weight = 0.1): number {
    const map: Record<string, number> = {
      'BELOW 3:- 10%': 10, 'BELOW 5:- 8%': 8, 'BELOW 10:- 5%': 5, 'MORE THAN 10:- 2%': 2,
    };
    return ((map[data.parents_feedback_band ?? ''] ?? 0) / 10) * weight;
  }

  private calculateClassroomScore(data: Partial<TeacherAppraisal>, weight = 0.1): number {
    const map: Record<string, number> = {
      'BELOW 10:- 3 MARKS': 3, '11 TO 15:- 5 MARKS': 5,
      '16 TO 19:- 8 MARKS': 8, '20 & ABOVE:- 10 MARKS': 10,
    };
    const score = map[(data as any).classroom_observation_band ?? ''] ?? 0;
    return (score / 10) * weight;
  }

  private calculateEnglishCommScore(data: Partial<TeacherAppraisal>, weight = 0.05): number {
    const map: Record<string, number> = {
      'BELOW 3:- 10%': 10, 'BELOW 5:- 8%': 8, 'BELOW 10:- 5%': 5, 'MORE THAN 10:- 2%': 2,
    };
    return ((map[data.english_comm_band ?? ''] ?? 0) / 10) * weight;
  }

  private calculateResponsibilitiesScore(data: Partial<TeacherAppraisal>): number {
    const responsibilities = [
      data.resp_phonics, data.resp_math, data.resp_reading, data.resp_handwriting,
      data.resp_kannada_reading, data.resp_notes_hw, data.resp_library,
      data.resp_parental_engagement, data.resp_below_a_students,
      data.resp_english_grammar, data.resp_others,
    ];
    const count = responsibilities.filter(Boolean).length;
    return Math.min(count * 0.005, 0.05);
  }
}