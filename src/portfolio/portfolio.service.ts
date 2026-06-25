import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity/user.entity';
import { TeacherAppraisal } from '../assessments/entities/teacher-appraisal.entity/teacher-appraisal.entity';
import { TeacherObservation } from '../observation/entities/teacher-observation.entity/teacher-observation.entity';
import { TeacherMapping } from '../mappings/entities/teacher-mapping.entity/teacher-mapping.entity';
import { ExamMarks } from '../pasa/entities/exam-marks.entity/exam-marks.entity';
import { BaselineAssessment } from '../assessments/entities/baseline-assessment.entity/baseline-assessment.entity';

@Injectable()
export class PortfolioService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(TeacherAppraisal) private appraisalRepo: Repository<TeacherAppraisal>,
    @InjectRepository(TeacherObservation) private obsRepo: Repository<TeacherObservation>,
    @InjectRepository(TeacherMapping) private mappingRepo: Repository<TeacherMapping>,
    @InjectRepository(ExamMarks) private marksRepo: Repository<ExamMarks>,
    @InjectRepository(BaselineAssessment) private baselineRepo: Repository<BaselineAssessment>,
  ) {}

  async getTeacherPortfolio(teacher_id: string) {
    // Profile
    const teacher = await this.userRepo.findOne({ where: { id: teacher_id } });
    if (!teacher) return null;

    // Appraisal history — all years
    const appraisals = await this.appraisalRepo.find({
      where: { teacher_id },
      order: { academic_year: 'DESC' },
      select: [
        'id', 'academic_year', 'overall_score', 'overall_percentage',
        'exam_score', 'skills_score', 'behaviour_score',
        'parents_feedback_score', 'classroom_score', 'english_comm_score',
        'responsibilities_score', 'literacy_score', 'numeracy_score',
      ],
    });

    // Observation history — by email
    const observations = teacher.email
      ? await this.obsRepo.find({
          where: { teacher_email: teacher.email, is_active: true },
          order: { academic_year: 'DESC', observation_date: 'DESC' },
          select: [
            'id', 'academic_year', 'observation_date', 'grade_observed',
            'subject_observed', 'total_score', 'percentage', 'observed_by',
          ],
        })
      : [];

    // Group observations by year
    const obsByYear: Record<string, any[]> = {};
    observations.forEach(o => {
      const y = o.academic_year || 'Unknown';
      if (!obsByYear[y]) obsByYear[y] = [];
      obsByYear[y].push(o);
    });
    const obsHistory = Object.entries(obsByYear).map(([year, obs]) => ({
      academic_year: year,
      count: obs.length,
      avg_percentage: +(obs.reduce((s, o) => s + (+o.percentage), 0) / obs.length).toFixed(2),
      observations: obs,
    }));

    // Teaching history — all years from mappings
    const mappings = await this.mappingRepo.find({
      where: { teacher_id },
      order: { academic_year: 'DESC', grade: 'ASC', section: 'ASC' },
    });

    // Group mappings by year
    const mappingsByYear: Record<string, any[]> = {};
    mappings.forEach(m => {
      if (!mappingsByYear[m.academic_year]) mappingsByYear[m.academic_year] = [];
      mappingsByYear[m.academic_year].push(m);
    });

    // For each year → get exam marks for those grade+section+subject combinations
    const teachingHistory = await Promise.all(
      Object.entries(mappingsByYear).map(async ([year, yearMappings]) => {
        const sections: any[] = [];
        for (const m of yearMappings) {
          // Avg student performance for this grade+section+subject+year
          const marks = await this.marksRepo
            .createQueryBuilder('em')
            .where('em.grade = :grade', { grade: m.grade })
            .andWhere('em.section = :section', { section: m.section })
            .andWhere('em.academic_year = :year', { year })
            .andWhere(m.subject ? 'em.subject = :subject' : '1=1', m.subject ? { subject: m.subject } : {})
            .select('AVG(em.percentage)', 'avg_pct')
            .addSelect('COUNT(DISTINCT em.student_id)', 'student_count')
            .getRawOne();

          sections.push({
            grade: m.grade,
            section: m.section,
            subject: m.subject || null,
            is_class_teacher: m.is_class_teacher,
            avg_student_percentage: marks?.avg_pct ? +parseFloat(marks.avg_pct).toFixed(2) : null,
            student_count: marks?.student_count ? +marks.student_count : 0,
          });
        }
        return { academic_year: year, sections };
      })
    );

    // Baseline history (entity_type = 'teacher')
    const baselineRaw = await this.baselineRepo.find({
      where: { entity_type: 'teacher' as any, entity_id: teacher_id },
      order: { academic_year: 'DESC', round: 'ASC' },
      select: ['id', 'academic_year', 'round', 'subject', 'overall_score', 'literacy_total', 'numeracy_total'],
    });

    const baselineByYear: Record<string, any[]> = {};
    baselineRaw.forEach(b => {
      const y = b.academic_year || 'Unknown';
      if (!baselineByYear[y]) baselineByYear[y] = [];
      baselineByYear[y].push(b);
    });
    const baselineHistory = Object.entries(baselineByYear).map(([year, rounds]) => ({
      academic_year: year,
      rounds,
    }));

    return {
      profile: {
        id: teacher.id,
        name: teacher.name,
        email: teacher.email,
        phone: teacher.phone,
        photo: teacher.photo,
        appraisal_qualification: teacher.appraisal_qualification,
        experience: teacher.experience,
        subjects: teacher.subjects,
        is_active: teacher.is_active,
        deactivated_at: (teacher as any).deactivated_at,
      },
      appraisal_history: appraisals,
      observation_history: obsHistory,
      teaching_history: teachingHistory.sort((a, b) => b.academic_year.localeCompare(a.academic_year)),
      baseline_history: baselineHistory,
    };
  }
}
