import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TeacherObservation } from './entities/teacher-observation.entity/teacher-observation.entity';
import { User } from '../users/entities/user.entity/user.entity';

const RATING_SCORE: Record<string, number> = {
  not_done: 0, attempted: 1, done: 2, well_done: 3,
};

const CRITERIA = [
  'preparation', 'purposeful_class', 'action', 'analysis',
  'application', 'assessment', 'super_teacher', 'high_energy',
];

const MAX_SCORE = CRITERIA.length * 3; // 24

function computeScores(data: any): { total_score: number; percentage: number } {
  const total = CRITERIA.reduce((sum, c) => sum + (RATING_SCORE[data[c]] || 0), 0);
  const percentage = +((total / MAX_SCORE) * 100).toFixed(2);
  return { total_score: total, percentage };
}

@Injectable()
export class ObservationService {
  constructor(
    @InjectRepository(TeacherObservation) private obsRepo: Repository<TeacherObservation>,
    @InjectRepository(User) private userRepo: Repository<User>,
  ) {}

  // ── GET ALL TEACHERS (for dropdown) ─────────────────────

  async getTeachers() {
    return this.userRepo.find({
      where: { is_active: true },
      order: { name: 'ASC' },
      select: ['id', 'name', 'email'],
    });
  }

  // ── CREATE OBSERVATION ───────────────────────────────────

  async createObservation(data: any) {
    const { total_score, percentage } = computeScores(data);
    const obs = this.obsRepo.create({
      teacher_name: data.teacher_name,
      teacher_email: data.teacher_email,
      grade_observed: data.grade_observed,
      section_observed: data.section_observed || null,
      subject_observed: data.subject_observed,
      block_number: data.block_number,
      lesson_plan_available: data.lesson_plan_available || false,
      lesson_plan_name: data.lesson_plan_name,
      number_of_students: data.number_of_students,
      classroom_norms_discussed: data.classroom_norms_discussed || false,
      academic_year: data.academic_year || '2025-26',
      observation_date: data.observation_date,
      observed_by: data.observed_by,
      preparation: data.preparation || 'not_done',
      purposeful_class: data.purposeful_class || 'not_done',
      action: data.action || 'not_done',
      analysis: data.analysis || 'not_done',
      application: data.application || 'not_done',
      assessment: data.assessment || 'not_done',
      super_teacher: data.super_teacher || 'not_done',
      high_energy: data.high_energy || 'not_done',
      what_went_well: data.what_went_well,
      what_could_be_better: data.what_could_be_better,
      action_steps: data.action_steps,
      total_score,
      percentage,
      is_active: true,
    });
    return this.obsRepo.save(obs);
  }

  // ── GET ALL OBSERVATIONS ─────────────────────────────────

  async getObservations(filters: { teacher_name?: string; academic_year?: string; grade?: string }) {
    const query = this.obsRepo.createQueryBuilder('o').where('o.is_active = true');
    if (filters.teacher_name) query.andWhere('o.teacher_name ILIKE :name', { name: `%${filters.teacher_name}%` });
    if (filters.academic_year) query.andWhere('o.academic_year = :ay', { ay: filters.academic_year });
    if (filters.grade) query.andWhere('o.grade_observed = :grade', { grade: filters.grade });
    return query.orderBy('o.teacher_name', 'ASC').addOrderBy('o.observation_date', 'ASC').getMany();
  }

  // ── GET SINGLE OBSERVATION ───────────────────────────────

  async getObservationById(id: string) {
    return this.obsRepo.findOne({ where: { id } });
  }

  // ── UPDATE OBSERVATION ───────────────────────────────────

  async updateObservation(id: string, data: any) {
    const { total_score, percentage } = computeScores(data);
    await this.obsRepo.update(id, { ...data, total_score, percentage });
    return this.obsRepo.findOne({ where: { id } });
  }

  // ── DELETE OBSERVATION ───────────────────────────────────

  async deleteObservation(id: string) {
    await this.obsRepo.update(id, { is_active: false });
    return { message: 'Observation deleted' };
  }

  // ── SHARE OBSERVATION ────────────────────────────────────

  async shareObservation(id: string, is_shared: boolean) {
    await this.obsRepo.update(id, { is_shared });
    return { message: is_shared ? 'Observation shared' : 'Share removed', id, is_shared };
  }

  // ── GET SHARED OBSERVATIONS (teacher view) ───────────────

  async getSharedObservations(teacher_email: string) {
    if (!teacher_email) return [];
    return this.obsRepo.find({
      where: { teacher_email, is_shared: true, is_active: true },
      order: { observation_date: 'DESC' },
    });
  }

  // ── DASHBOARD ────────────────────────────────────────────

  async getDashboard(academic_year: string) {
    const all = await this.obsRepo.find({
      where: { academic_year, is_active: true },
      order: { teacher_name: 'ASC', observation_date: 'ASC' },
    });

    // Group by teacher (case-insensitive key to merge name variants)
    const teacherMap: Record<string, any[]> = {};
    all.forEach(o => {
      const key = (o.teacher_name || '').toLowerCase().trim();
      if (!teacherMap[key]) teacherMap[key] = [];
      teacherMap[key].push(o);
    });

    const teacherSummaries = Object.entries(teacherMap).map(([, obs]) => {
      const name = obs[0].teacher_name;
      const avgPct = obs.reduce((sum, o) => sum + (+o.percentage), 0) / obs.length;
      const avgScore = obs.reduce((sum, o) => sum + (+o.total_score), 0) / obs.length;

      // Criteria averages
      const criteriaAvg: Record<string, number> = {};
      CRITERIA.forEach(c => {
        const avg = obs.reduce((sum, o) => sum + (RATING_SCORE[(o as any)[c]] || 0), 0) / obs.length;
        criteriaAvg[c] = +avg.toFixed(2);
      });

      return {
        teacher_name: name,
        observation_count: obs.length,
        avg_score: +avgScore.toFixed(2),
        avg_percentage: +avgPct.toFixed(2),
        criteria_avg: criteriaAvg,
        observations: obs.map(o => ({
          id: o.id,
          date: o.observation_date,
          grade: o.grade_observed,
          subject: o.subject_observed,
          total_score: o.total_score,
          percentage: o.percentage,
          preparation: o.preparation,
          purposeful_class: o.purposeful_class,
          action: o.action,
          analysis: o.analysis,
          application: o.application,
          assessment: o.assessment,
          super_teacher: o.super_teacher,
          high_energy: o.high_energy,
        })),
      };
    });

    // Overall stats
    const totalTeachers = Object.keys(teacherMap).length;
    const totalObservations = all.length;
    const observedOnce = Object.values(teacherMap).filter(obs => obs.length >= 1).length;
    const observedMultiple = Object.values(teacherMap).filter(obs => obs.length > 1).length;
    const schoolAvg = all.length > 0
      ? +(all.reduce((sum, o) => sum + (+o.percentage), 0) / all.length).toFixed(2)
      : 0;

    // Criteria school-wide averages
    const schoolCriteriaAvg: Record<string, number> = {};
    CRITERIA.forEach(c => {
      const avg = all.length > 0
        ? all.reduce((sum, o) => sum + (RATING_SCORE[(o as any)[c]] || 0), 0) / all.length
        : 0;
      schoolCriteriaAvg[c] = +avg.toFixed(2);
    });

    // Top and bottom teachers
    const sorted = [...teacherSummaries].sort((a, b) => b.avg_percentage - a.avg_percentage);

    return {
      total_teachers: totalTeachers,
      total_observations: totalObservations,
      observed_once: observedOnce,
      observed_multiple: observedMultiple,
      school_avg_percentage: schoolAvg,
      school_criteria_avg: schoolCriteriaAvg,
      top5: sorted.slice(0, 5),
      bottom5: sorted.slice(-5).reverse(),
      teachers: teacherSummaries,
    };
  }

  // ── TEACHER DETAIL ───────────────────────────────────────

  async getTeacherDetail(teacher_name: string, academic_year: string) {
    const obs = await this.obsRepo.find({
      where: { teacher_name, academic_year, is_active: true },
      order: { observation_date: 'ASC' },
    });

    if (obs.length === 0) return { teacher_name, observations: [], summary: null };

    const avgPct = obs.reduce((sum, o) => sum + (+o.percentage), 0) / obs.length;
    const avgScore = obs.reduce((sum, o) => sum + (+o.total_score), 0) / obs.length;

    const criteriaAvg: Record<string, number> = {};
    CRITERIA.forEach(c => {
      const avg = obs.reduce((sum, o) => sum + (RATING_SCORE[(o as any)[c]] || 0), 0) / obs.length;
      criteriaAvg[c] = +avg.toFixed(2);
    });

    const trend = obs.map(o => ({
      date: o.observation_date,
      score: o.total_score,
      percentage: o.percentage,
      grade: o.grade_observed,
      subject: o.subject_observed,
    }));

    return {
      teacher_name,
      academic_year,
      observation_count: obs.length,
      avg_score: +avgScore.toFixed(2),
      avg_percentage: +avgPct.toFixed(2),
      criteria_avg: criteriaAvg,
      trend,
      observations: obs,
    };
  }
}