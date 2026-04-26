import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum ObservationRating {
  NOT_DONE = 'not_done',
  ATTEMPTED = 'attempted',
  DONE = 'done',
  WELL_DONE = 'well_done',
}

@Entity('teacher_observations')
export class TeacherObservation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  teacher_name: string;

  @Column({ nullable: true })
  teacher_email: string;

  @Column()
  grade_observed: string;

  @Column({ nullable: true })
  section_observed: string;

  @Column()
  subject_observed: string;

  @Column({ nullable: true })
  block_number: string;

  @Column({ default: false })
  lesson_plan_available: boolean;

  @Column({ nullable: true })
  lesson_plan_name: string;

  @Column({ nullable: true })
  number_of_students: number;

  @Column({ default: false })
  classroom_norms_discussed: boolean;

  @Column()
  academic_year: string;

  @Column({ nullable: true })
  observation_date: string;

  @Column({ nullable: true })
  observed_by: string;

  // ── 8 Observation Criteria ─────────────────────────────
  // Ratings: not_done=0, attempted=1, done=2, well_done=3

  @Column({ default: 'not_done' })
  preparation: string;

  @Column({ default: 'not_done' })
  purposeful_class: string;

  @Column({ default: 'not_done' })
  action: string;

  @Column({ default: 'not_done' })
  analysis: string;

  @Column({ default: 'not_done' })
  application: string;

  @Column({ default: 'not_done' })
  assessment: string;

  @Column({ default: 'not_done' })
  super_teacher: string;

  @Column({ default: 'not_done' })
  high_energy: string;

  // ── Qualitative Feedback ──────────────────────────────

  @Column({ type: 'text', nullable: true })
  what_went_well: string;

  @Column({ type: 'text', nullable: true })
  what_could_be_better: string;

  @Column({ type: 'text', nullable: true })
  action_steps: string;

  // ── Computed scores (stored for fast queries) ─────────

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  total_score: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  percentage: number;

  @Column({ default: true })
  is_active: boolean;

  @Column({ default: false })
  is_shared: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
