import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('hr_interviews')
export class HrInterview {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column() applicant_id: string;

  @Column({ type: 'date', nullable: true }) interview_date: string;
  @Column({ nullable: true }) slot_time: string;
  @Column({ nullable: true }) interviewer_name: string;
  @Column({ nullable: true }) scheduled_by: string;
  @Column({ nullable: true, type: 'timestamp' }) scheduled_at: Date | null;

  @Column({ default: false }) candidate_notified: boolean;
  @Column({ nullable: true, type: 'timestamp' }) notified_at: Date | null;

  // null = interview day hasn't happened / not yet marked
  @Column({ type: 'boolean', nullable: true }) attended: boolean | null;

  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true }) written_marks: number;
  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true }) written_max: number;
  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true }) oral_marks: number;
  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true }) oral_max: number;
  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true }) demo_marks: number;
  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true }) demo_max: number;

  // pending -> selected | rejected | hold
  @Column({ default: 'pending' }) result: string;
  @Column({ nullable: true, type: 'text' }) notes: string;

  @CreateDateColumn() created_at: Date;
  @UpdateDateColumn() updated_at: Date;
}
