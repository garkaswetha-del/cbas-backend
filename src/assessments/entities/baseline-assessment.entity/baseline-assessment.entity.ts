import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum EntityType {
  STUDENT = 'student',
  TEACHER = 'teacher',
}

export enum AssessmentRound {
  ROUND_1  = 'baseline_1',
  ROUND_2  = 'baseline_2',
  ROUND_3  = 'baseline_3',
  ROUND_4  = 'baseline_4',
  ROUND_5  = 'baseline_5',
  ROUND_6  = 'baseline_6',
  ROUND_7  = 'baseline_7',
  ROUND_8  = 'baseline_8',
  ROUND_9  = 'baseline_9',
  ROUND_10 = 'baseline_10',
}

export enum AssessmentSubject {
  LITERACY = 'literacy',
  NUMERACY = 'numeracy',
}

export enum AssessmentStage {
  FOUNDATION  = 'foundation',
  PREPARATORY = 'preparatory',
  MIDDLE      = 'middle',
  SECONDARY   = 'secondary',
}

@Entity('baseline_assessments')
export class BaselineAssessment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: EntityType })
  entity_type: EntityType;

  @Column()
  entity_id: string;

  @Column({ nullable: true })
  entity_name: string;

  @Column({ nullable: true })
  grade: string;

  @Column({ nullable: true })
  section: string;

  @Column()
  academic_year: string;

  @Column({ type: 'enum', enum: AssessmentRound })
  round: AssessmentRound;

  @Column({ type: 'enum', enum: AssessmentSubject, nullable: true })
  subject: AssessmentSubject;

  @Column({ type: 'enum', enum: AssessmentStage, nullable: true })
  stage: AssessmentStage;

  @Column({ nullable: true })
  assessment_date: string;

  // Raw marks as entered: { "Listening": 5, "Speaking": 11, ... }
  @Column({ type: 'jsonb', nullable: true })
  literacy_scores: Record<string, number>;

  // Raw marks: { "Operations": 12.5, "Data Handling": 8, ... }
  @Column({ type: 'jsonb', nullable: true })
  numeracy_scores: Record<string, number>;

  // Max marks for this round: { "Listening": 7, "Operations": 25, ... }
  @Column({ type: 'jsonb', nullable: true })
  max_marks: Record<string, number>;

  // Calculated %: { "Listening": 71.43, "Speaking": 73.33, ... }
  @Column({ type: 'jsonb', nullable: true })
  literacy_pct: Record<string, number>;

  // Calculated %: { "Operations": 50.0, "Base 10": 80.0, ... }
  @Column({ type: 'jsonb', nullable: true })
  numeracy_pct: Record<string, number>;

  // avg of literacy domain percentages
  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  literacy_total: number;

  // avg of numeracy domain percentages
  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  numeracy_total: number;

  // avg of literacy_total + numeracy_total
  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  overall_score: number;

  @Column({ nullable: true })
  level: string;

  // { literacy: ["Listening", "Writing"], numeracy: ["Operations"] }
  @Column({ type: 'jsonb', nullable: true })
  gaps: object;

  @Column({ default: false })
  promoted: boolean;

  @Column({ nullable: true })
  promoted_to_stage: string;

  @Column({ nullable: true })
  created_by: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
