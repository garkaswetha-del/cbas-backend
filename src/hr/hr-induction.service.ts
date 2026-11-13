import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HrInductionVideo } from './entities/hr-induction-video.entity';
import { HrInductionProgress } from './entities/hr-induction-progress.entity';
import { HrApplicant } from './entities/hr-applicant.entity';
import { UsersService } from '../users/users.service';

// A video counts as actually finished once this much of its real, distinct
// watched time has accumulated — not just "current position reached the end"
// (that's exactly what scrubbing to the end would otherwise satisfy).
const COMPLETE_THRESHOLD = 0.9;

@Injectable()
export class HrInductionService {
  constructor(
    @InjectRepository(HrInductionVideo)
    private videoRepo: Repository<HrInductionVideo>,
    @InjectRepository(HrInductionProgress)
    private progressRepo: Repository<HrInductionProgress>,
    @InjectRepository(HrApplicant)
    private applicantRepo: Repository<HrApplicant>,
    private usersService: UsersService,
  ) {}

  // ── Admin/AHM: manage the video library ──
  async listVideos() {
    return this.videoRepo.find({ order: { sort_order: 'ASC', created_at: 'ASC' } });
  }

  // Backfills this video to everyone already mid-induction — otherwise a candidate
  // selected before any videos existed (or before this one was added) would never
  // get it, since assignment normally only happens once, at selection time.
  async createVideo(data: Partial<HrInductionVideo>) {
    const video = await this.videoRepo.save(this.videoRepo.create(data));
    if (video.is_active) {
      const inducting = await this.usersService.findInducting();
      const now = new Date();
      for (const u of inducting) {
        const already = await this.progressRepo.findOne({ where: { user_id: u.id, video_id: video.id } });
        if (already) continue;
        const dueAt = video.due_days ? new Date(now.getTime() + video.due_days * 86400000) : null;
        await this.progressRepo.save(this.progressRepo.create({ user_id: u.id, video_id: video.id, assigned_at: now, due_at: dueAt }));
      }
    }
    return video;
  }

  async updateVideo(id: string, data: Partial<HrInductionVideo>) {
    await this.videoRepo.update(id, data);
    return this.videoRepo.findOne({ where: { id } });
  }

  // Creates a teacher login (is_inducting: true) and assigns every active induction
  // video on THIS backend — reusable both for local selections and for cross-branch
  // onboarding (called over HTTP by the HR-home backend when a candidate applied to
  // a different campus than the one hosting the shared HR module).
  async onboardTeacher(data: { name: string; email: string; qualification?: string; phone?: string; subjects?: string[] }) {
    const first = (data.name || 'candidate').trim().split(/\s+/)[0] || 'candidate';
    const tempPassword = first + Math.floor(1000 + Math.random() * 9000);
    const created = await this.usersService.create({
      name: data.name || 'New Teacher',
      email: data.email,
      password: tempPassword,
      role: 'teacher',
      qualification: data.qualification,
      phone: data.phone,
      subjects: data.subjects,
    } as any);
    const userId = (created as any).id;
    await this.usersService.update(userId, { is_inducting: true });

    const videos = await this.videoRepo.find({ where: { is_active: true } });
    const now = new Date();
    for (const v of videos) {
      const dueAt = v.due_days ? new Date(now.getTime() + v.due_days * 86400000) : null;
      await this.progressRepo.save(this.progressRepo.create({
        user_id: userId, video_id: v.id, assigned_at: now, due_at: dueAt,
      }));
    }
    return { user_id: userId, temp_password: tempPassword };
  }

  // ── Admin/AHM: oversight — everyone currently inducting, and how far along ──
  async progressOverview() {
    const rows = await this.progressRepo
      .createQueryBuilder('p')
      .leftJoinAndMapOne('p.video', HrInductionVideo, 'v', 'v.id = p.video_id')
      .orderBy('p.user_id', 'ASC')
      .getMany();
    return rows;
  }

  // ── Candidate: what they need to watch ──
  async myAssignments(user_id: string) {
    return this.progressRepo
      .createQueryBuilder('p')
      .leftJoinAndMapOne('p.video', HrInductionVideo, 'v', 'v.id = p.video_id')
      .where('p.user_id = :user_id', { user_id })
      .orderBy('v.sort_order', 'ASC')
      .getMany();
  }

  // Player reports position periodically. We only credit NEW territory (position
  // beyond what's already been reached), so re-watching the same minute twice
  // doesn't inflate progress, and jumping straight to the end only credits the
  // single instant jumped to — not the seconds skipped over.
  async reportProgress(user_id: string, video_id: string, currentPosition: number) {
    const progress = await this.progressRepo.findOne({ where: { user_id, video_id } });
    if (!progress) throw new NotFoundException('No induction assignment found for this video');
    const video = await this.videoRepo.findOne({ where: { id: video_id } });
    if (!video) throw new NotFoundException('Video not found');

    const prevMax = Number(progress.max_position_reached) || 0;
    const newMax = Math.max(prevMax, currentPosition);
    const newlyWatched = Math.max(0, newMax - prevMax);
    const watchedSeconds = Number(progress.watched_seconds) + newlyWatched;

    const completed = video.duration_seconds > 0 && watchedSeconds >= video.duration_seconds * COMPLETE_THRESHOLD;

    await this.progressRepo.update(progress.id, {
      max_position_reached: newMax,
      watched_seconds: watchedSeconds,
      completed,
      completed_at: completed && !progress.completed ? new Date() : progress.completed_at,
    });

    return this.progressRepo.findOne({ where: { id: progress.id } });
  }

  // All of a candidate's assigned videos complete?
  async isInductionComplete(user_id: string): Promise<boolean> {
    const rows = await this.progressRepo.find({ where: { user_id } });
    if (rows.length === 0) return false;
    return rows.every(r => r.completed);
  }

  // Admin action: finish onboarding — flips them out of induction into a normal
  // teacher login (they'll hit the usual self-mapping screen on next login).
  async markHired(user_id: string) {
    await this.usersService.update(user_id, { is_inducting: false });
    await this.applicantRepo.update({ user_id }, { stage: 'hired' });
    return { success: true };
  }
}
