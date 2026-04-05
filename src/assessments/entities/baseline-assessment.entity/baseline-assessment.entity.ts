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

  @Column({ type: 'enum', enum: AssessmentSubject })
  subject: AssessmentSubject;

  @Column({ type: 'enum', enum: AssessmentStage })
  stage: AssessmentStage;

  @Column({ nullable: true })
  assessment_date: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  listening_score: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  speaking_score: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  reading_score: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  writing_score: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  operations_score: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  base10_score: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  measurement_score: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  geometry_score: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  literacy_total: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  numeracy_total: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  overall_score: number;

  @Column({ nullable: true })
  level: string;

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
