import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TeacherAppraisal } from '../assessments/entities/teacher-appraisal.entity/teacher-appraisal.entity';
import { User } from '../users/entities/user.entity/user.entity';
import { UserRole } from '../users/entities/user.entity/user.entity';

@Injectable()
export class AppraisalService {
  constructor(
    @InjectRepository(TeacherAppraisal)
    private appraisalRepo: Repository<TeacherAppraisal>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
  ) {}

  async getAllAppraisals(academic_year: string) {
    const teachers = await this.userRepo.find({
      where: { role: UserRole.TEACHER },
    });
    const appraisals = await this.appraisalRepo.find({ where: { academic_year } });
    return teachers.map((teacher) => {
      const appraisal = appraisals.find((a) => a.teacher_id === teacher.id);
      return { teacher_id: teacher.id, teacher_name: teacher.name, appraisal: appraisal || null };
    });
  }

  async saveAppraisal(teacher_id: string, data: Partial<TeacherAppraisal>) {
    const existing = await this.appraisalRepo.findOne({
      where: { teacher_id, academic_year: data.academic_year },
    });

    const exam_score = this.calculateExamScore(data);
    const skills_score = this.calculateSkillsScore(data);
    const behaviour_score = this.calculateBehaviourScore(data);
    const parents_feedback_score = this.calculateParentsFeedbackScore(data);
    const classroom_score = this.calculateClassroomScore(data);
    const english_comm_score = this.calculateEnglishCommScore(data);
    const responsibilities_score = this.calculateResponsibilitiesScore(data);
    const overall_score = exam_score + skills_score + behaviour_score +
      parents_feedback_score + classroom_score + english_comm_score + responsibilities_score;
    const overall_percentage = overall_score * 100;

    const appraisalData = {
      ...data, teacher_id, exam_score, skills_score, behaviour_score,
      parents_feedback_score, classroom_score, english_comm_score,
      responsibilities_score, overall_score, overall_percentage,
    };

    if (existing) {
      await this.appraisalRepo.update(existing.id, appraisalData);
      return this.appraisalRepo.findOne({ where: { id: existing.id } });
    } else {
      const newAppraisal = this.appraisalRepo.create(appraisalData);
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

  async getSharedAppraisal(id: string) {
    const appraisal = await this.appraisalRepo.findOne({ where: { id } });
    if (!appraisal) throw new NotFoundException('Appraisal not found');
    if (!appraisal.is_shared) throw new NotFoundException('Appraisal not shared');
    return appraisal;
  }

  private calculateExamScore(data: Partial<TeacherAppraisal>): number {
    const total = (+(data.pa1 ?? 0)) + (+(data.pa2 ?? 0)) + (+(data.pa3 ?? 0)) +
      (+(data.pa4 ?? 0)) + (+(data.sa1 ?? 0)) + (+(data.sa2 ?? 0));
    return (total / 600) * 0.5;
  }

  private calculateSkillsScore(data: Partial<TeacherAppraisal>): number {
    const map: Record<string, number> = {
      'ATTENDED 41 TO 50:-  2 MARKS': 2, 'ATTENDED 21 TO 30:- 1.5 MARKS': 1.5,
      'ATTENDED 10 TO 20:- 1 MARKS': 1,
      'CONDUCTED 2 TRAINING:- 2 MARKS': 2, 'CONDUCTED 1 TRAINING:- 1 MARKS': 1,
      '8 & ABOVE:- 2 MARKS': 2, '6 - 8:- 1.5 MARKS': 1.5, '4 - 6:- 1 MARKS': 1,
      '2 & ABOVE:- 2 MARKS': 2, '1 - 2:- 1 MARKS': 1,
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
      'HIGHLY CO-OPERATIVE: 2 MARKS': 2, 'GENERALLY CO-OPERATIVE: 1 MARKS': 1, 'SOMETIMES CO-OPERATIVE: 0 MARKS': 0,
      'RESPECTFULL & FAIR TOWARDS STUDENTS:- 2 MARKS': 2, 'SOMETIMES RESPECTFULL & FAIR:- 1 MARKS': 1, 'UNFAIR:- 0 MARKS': 0,
      'FULLY COMMITTED & ACTIVITY PROMOTES SCHOOL VALUES:- 2 MARKS': 2,
      'GENERALLY COMMITTED & SUPPORT TO SCHOOL VALUES:- 1 MARKS': 1, 'RARELY FOLLOWS & COMMITTED:- 0 MARKS': 0,
      'HIGHLY ADAPTABLE & FLEXIBLE:- 2 MARKS': 2, 'GENERALLY ADAPTABLE & FLEXIBLE:- 1 MARKS': 1, 'STRUGGLES WITH ADAPTABILITY:- 0 MARKS': 0,
      'ALWAYS CLEAN, NEAT & WELL PRESENTED PROFESIONALLY:- 2 MARKS': 2,
      'GENERALLY CLEAN & NEAT WITH OCCASIONAL LAPSES:- 1 MARKS': 1, 'FREQUENTLY UNTIDY:- 0 MARKS': 0,
    };
    const obtained =
      (map[data.team_work ?? ''] ?? 0) +
      (map[data.attitude_towards_students ?? ''] ?? 0) +
      (map[data.commitment_to_values ?? ''] ?? 0) +
      (map[data.adaptability ?? ''] ?? 0) +
      (map[data.dressing ?? ''] ?? 0);
    return (obtained / 10) * 0.1;
  }

  private calculateParentsFeedbackScore(data: Partial<TeacherAppraisal>): number {
    const map: Record<string, number> = {
      'BELOW 3:- 10%': 10, 'BELOW 5:- 8%': 8, 'BELOW 10:- 5%': 5, 'MORE THAN 10:- 2%': 2,
    };
    return ((map[data.parents_feedback_band ?? ''] ?? 0) / 100) * 0.1;
  }

  private calculateClassroomScore(data: Partial<TeacherAppraisal>): number {
    const obs = data.classroom_observations as any[];
    if (!obs || !obs.length) return 0;
    const map: Record<string, number> = {
      'BELOW 10 :-    3 MARKS': 3, '11 TO 15 :-       5 MARKS': 5,
      '16 TO 19 :-         8 MARKS': 8, '20 & ABOVE :-  10 MARKS': 10,
    };
    const total = obs.reduce((sum, o) => sum + (map[o.band] || 0), 0);
    const maxMarks = obs.length * 10;
    return maxMarks > 0 ? (total / maxMarks) * 0.1 : 0;
  }

  private calculateEnglishCommScore(data: Partial<TeacherAppraisal>): number {
    const map: Record<string, number> = {
      'BELOW 3:- 10%': 10, 'BELOW 5:- 8%': 8, 'BELOW 10:- 5%': 5, 'MORE THAN 10:- 2%': 2,
    };
    return ((map[data.english_comm_band ?? ''] ?? 0) / 100) * 0.05;
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