import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('hr_interviews')
export class HrInterview {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column() applicant_id: string;

  // Legacy single-round fields — kept for historical rows (backfilled into the
  // written_* fields below) but no longer written to by new code. Written/Oral/Demo
  // are often conducted on different days, so each now gets its own schedule.
  @Column({ type: 'date', nullable: true }) interview_date: string;
  @Column({ nullable: true }) slot_time: string;
  @Column({ nullable: true }) interviewer_name: string;
  @Column({ nullable: true }) scheduled_by: string;
  @Column({ nullable: true, type: 'timestamp' }) scheduled_at: Date | null;
  @Column({ default: false }) candidate_notified: boolean;
  @Column({ nullable: true, type: 'timestamp' }) notified_at: Date | null;
  @Column({ type: 'boolean', nullable: true }) attended: boolean | null;
  @Column({ nullable: true, type: 'text' }) notes: string;

  // ── Written round ──
  @Column({ type: 'date', nullable: true }) written_date: string;
  @Column({ nullable: true }) written_time: string;
  @Column({ nullable: true }) written_interviewer: string;
  @Column({ default: false }) written_notified: boolean;
  @Column({ nullable: true, type: 'timestamp' }) written_notified_at: Date | null;
  @Column({ type: 'boolean', nullable: true }) written_attended: boolean | null;
  @Column({ nullable: true, type: 'text' }) written_notes: string;
  // HR override to unlock Oral even though Written was marked absent
  @Column({ default: false }) written_proceed_anyway: boolean;
  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true }) written_marks: number;
  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true }) written_max: number;

  // ── Oral round ──
  @Column({ type: 'date', nullable: true }) oral_date: string;
  @Column({ nullable: true }) oral_time: string;
  @Column({ nullable: true }) oral_interviewer: string;
  @Column({ default: false }) oral_notified: boolean;
  @Column({ nullable: true, type: 'timestamp' }) oral_notified_at: Date | null;
  @Column({ type: 'boolean', nullable: true }) oral_attended: boolean | null;
  @Column({ nullable: true, type: 'text' }) oral_notes: string;
  // HR override to unlock Demo even though Oral was marked absent
  @Column({ default: false }) oral_proceed_anyway: boolean;
  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true }) oral_marks: number;
  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true }) oral_max: number;

  // ── Demo round ──
  @Column({ type: 'date', nullable: true }) demo_date: string;
  @Column({ nullable: true }) demo_time: string;
  @Column({ nullable: true }) demo_interviewer: string;
  @Column({ default: false }) demo_notified: boolean;
  @Column({ nullable: true, type: 'timestamp' }) demo_notified_at: Date | null;
  @Column({ type: 'boolean', nullable: true }) demo_attended: boolean | null;
  @Column({ nullable: true, type: 'text' }) demo_notes: string;
  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true }) demo_marks: number;
  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true }) demo_max: number;

  // pending -> selected | rejected | hold
  @Column({ default: 'pending' }) result: string;

  @CreateDateColumn() created_at: Date;
  @UpdateDateColumn() updated_at: Date;
}
