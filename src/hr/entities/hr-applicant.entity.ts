import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

// Every field but the stage/shortlist bookkeeping is nullable — if a resume
// doesn't have it, we just leave it blank rather than blocking the row.
@Entity('hr_applicants')
export class HrApplicant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true }) name: string;
  @Column({ nullable: true }) email: string;
  @Column({ nullable: true }) contact_no: string;
  @Column({ nullable: true, type: 'text' }) address: string;
  @Column({ nullable: true }) locality: string;

  @Column({ nullable: true }) qualification: string;
  @Column({ type: 'decimal', precision: 4, scale: 1, nullable: true }) experience_years: number;
  @Column({ nullable: true, type: 'text' }) experience_detail: string;
  @Column({ nullable: true, type: 'text' }) skills: string;

  @Column({ nullable: true }) guardian_name: string;
  @Column({ nullable: true }) religion: string;
  @Column({ nullable: true }) caste: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true }) previous_salary: number;
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true }) expected_salary: number;
  @Column({ nullable: true }) subject_applied_for: string;

  @Column({ nullable: true }) source_portal: string;
  // data URI (same pattern the app already uses for photos) — survives redeploys, no object storage needed
  @Column({ nullable: true, type: 'text' }) resume_file: string;
  @Column({ type: 'jsonb', default: {} }) extra_json: Record<string, any>;

  @Column({ default: false }) is_shortlisted: boolean;
  @Column({ nullable: true }) shortlisted_by: string;
  @Column({ nullable: true, type: 'timestamp' }) shortlisted_at: Date | null;
  @Column({ nullable: true, type: 'text' }) shortlist_notes: string;

  // applied -> shortlisted -> interview_scheduled -> interviewed -> selected|rejected -> hired
  @Column({ default: 'applied' }) stage: string;
  // set once "Select" creates their induction/teacher login
  @Column({ nullable: true }) user_id: string;

  @CreateDateColumn() created_at: Date;
  @UpdateDateColumn() updated_at: Date;
}
