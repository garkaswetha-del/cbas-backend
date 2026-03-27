import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('student_competency_scores')
export class StudentCompetencyScore {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  student_id: string;

  @Column({ nullable: true })
  student_name: string;

  @Column({ nullable: true })
  grade: string;

  @Column({ nullable: true })
  section: string;

  @Column()
  academic_year: string;

  @Column()
  subject: string;

  @Column()
  competency_id: string;

  @Column({ nullable: true })
  competency_code: string;

  @Column({ nullable: true })
  competency_name: string;

  @Column({ nullable: true })
  domain: string;

  @Column({ nullable: true })
  stage: string;

  // best score across all activities: beginning/approaching/meeting/exceeding
  @Column({ nullable: true })
  best_rating: string;

  // numeric equivalent: 1/2/3/4
  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  best_score: number;

  // all activity ratings history
  @Column({ type: 'jsonb', nullable: true })
  rating_history: object;

  @Column({ default: 0 })
  attempt_count: number;

  @Column({ nullable: true })
  last_activity_id: string;

  @UpdateDateColumn()
  last_updated: Date;

  @CreateDateColumn()
  created_at: Date;
}