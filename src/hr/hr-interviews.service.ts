import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HrInterview } from './entities/hr-interview.entity';
import { HrApplicant } from './entities/hr-applicant.entity';
import { HrInductionVideo } from './entities/hr-induction-video.entity';
import { HrInductionProgress } from './entities/hr-induction-progress.entity';
import { UsersService } from '../users/users.service';
import { HrAppointmentLetterService } from './hr-appointment-letter.service';

function autoPassword(name: string): string {
  const first = (name || 'candidate').trim().split(/\s+/)[0] || 'candidate';
  return first + Math.floor(1000 + Math.random() * 9000);
}

@Injectable()
export class HrInterviewsService {
  constructor(
    @InjectRepository(HrInterview)
    private repo: Repository<HrInterview>,
    @InjectRepository(HrApplicant)
    private applicantRepo: Repository<HrApplicant>,
    @InjectRepository(HrInductionVideo)
    private videoRepo: Repository<HrInductionVideo>,
    @InjectRepository(HrInductionProgress)
    private progressRepo: Repository<HrInductionProgress>,
    private usersService: UsersService,
    private appointmentLetterService: HrAppointmentLetterService,
  ) {}

  private async getApplicant(applicant_id: string) {
    const a = await this.applicantRepo.findOne({ where: { id: applicant_id } });
    if (!a) throw new NotFoundException('Applicant not found');
    return a;
  }

  async findByDate(date?: string) {
    const qb = this.repo.createQueryBuilder('i').leftJoinAndMapOne('i.applicant', HrApplicant, 'a', 'a.id = i.applicant_id');
    if (date) qb.andWhere('i.interview_date = :date', { date });
    qb.orderBy('i.interview_date', 'ASC').addOrderBy('i.slot_time', 'ASC');
    return qb.getMany();
  }

  // Counts per date, for the "how many interviews on this date" filter view
  async countsByDate() {
    return this.repo
      .createQueryBuilder('i')
      .select('i.interview_date', 'interview_date')
      .addSelect('COUNT(*)', 'count')
      .where('i.interview_date IS NOT NULL')
      .groupBy('i.interview_date')
      .orderBy('i.interview_date', 'ASC')
      .getRawMany();
  }

  async findByApplicant(applicant_id: string) {
    return this.repo.find({ where: { applicant_id }, order: { created_at: 'DESC' } });
  }

  async schedule(data: { applicant_id: string; interview_date: string; slot_time?: string; interviewer_name?: string; scheduled_by?: string }) {
    const applicant = await this.getApplicant(data.applicant_id);
    const existing = await this.repo.findOne({ where: { applicant_id: data.applicant_id } });
    let interview: HrInterview;
    if (existing) {
      await this.repo.update(existing.id, {
        interview_date: data.interview_date,
        slot_time: data.slot_time,
        interviewer_name: data.interviewer_name,
        scheduled_by: data.scheduled_by,
        scheduled_at: new Date(),
      });
      interview = (await this.repo.findOne({ where: { id: existing.id } }))!;
    } else {
      interview = await this.repo.save(this.repo.create({
        applicant_id: data.applicant_id,
        interview_date: data.interview_date,
        slot_time: data.slot_time,
        interviewer_name: data.interviewer_name,
        scheduled_by: data.scheduled_by,
        scheduled_at: new Date(),
      }));
    }
    await this.applicantRepo.update(applicant.id, { stage: 'interview_scheduled' });
    return interview;
  }

  async markNotified(id: string) {
    await this.repo.update(id, { candidate_notified: true, notified_at: new Date() });
    return this.repo.findOne({ where: { id } });
  }

  async markAttendance(id: string, attended: boolean) {
    const interview = await this.repo.findOne({ where: { id } });
    if (!interview) throw new NotFoundException('Interview not found');
    await this.repo.update(id, { attended });
    await this.applicantRepo.update(interview.applicant_id, { stage: 'interviewed' });
    return this.repo.findOne({ where: { id } });
  }

  async saveScores(id: string, scores: {
    written_marks?: number; written_max?: number;
    oral_marks?: number; oral_max?: number;
    demo_marks?: number; demo_max?: number;
    notes?: string;
  }) {
    await this.repo.update(id, scores);
    return this.repo.findOne({ where: { id } });
  }

  // Marks the interview result. On "selected": creates a login for the candidate
  // (role: teacher, is_inducting: true) and assigns every active induction video.
  async decide(id: string, result: 'selected' | 'rejected' | 'hold', email?: string) {
    const interview = await this.repo.findOne({ where: { id } });
    if (!interview) throw new NotFoundException('Interview not found');
    const applicant = await this.getApplicant(interview.applicant_id);

    await this.repo.update(id, { result });

    if (result === 'rejected') {
      await this.applicantRepo.update(applicant.id, { stage: 'rejected' });
      return { result, applicant_id: applicant.id };
    }
    if (result === 'hold') {
      return { result, applicant_id: applicant.id };
    }

    // Selected — create their account if one doesn't already exist yet
    let userId = applicant.user_id;
    let tempPassword: string | undefined;
    if (!userId) {
      const loginEmail = email || applicant.email;
      if (!loginEmail) throw new NotFoundException('No email on file for this candidate — add one before selecting');
      tempPassword = autoPassword(applicant.name || 'candidate');
      const created = await this.usersService.create({
        name: applicant.name || 'New Teacher',
        email: loginEmail,
        password: tempPassword,
        role: 'teacher',
        qualification: applicant.qualification,
        phone: applicant.contact_no,
        subjects: applicant.subject_applied_for ? [applicant.subject_applied_for] : undefined,
      } as any);
      userId = (created as any).id;
      await this.usersService.update(userId!, { is_inducting: true });
      await this.applicantRepo.update(applicant.id, { user_id: userId, stage: 'selected' });

      // Auto-assign every active induction video
      const videos = await this.videoRepo.find({ where: { is_active: true } });
      const now = new Date();
      for (const v of videos) {
        const dueAt = v.due_days ? new Date(now.getTime() + v.due_days * 86400000) : null;
        await this.progressRepo.save(this.progressRepo.create({
          user_id: userId!, video_id: v.id, assigned_at: now, due_at: dueAt,
        }));
      }
    } else {
      await this.applicantRepo.update(applicant.id, { stage: 'selected' });
    }

    // Auto-generate the appointment letter the moment they're selected
    const schoolName = process.env.SCHOOL_NAME || 'Wisdom School';
    const letter = await this.appointmentLetterService.generate(applicant, schoolName);
    await this.applicantRepo.update(applicant.id, { appointment_letter: letter });

    return { result, applicant_id: applicant.id, user_id: userId, temp_password: tempPassword };
  }
}
