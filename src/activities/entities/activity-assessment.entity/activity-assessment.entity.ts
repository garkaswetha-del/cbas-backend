import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('activity_assessments')
export class ActivityAssessment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  activity_id: string;

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

  // { competency_id: { rubric_index: marks_obtained } }
  // e.g. { "comp-uuid": { "0": 4, "1": 3, "2": 5 } }
  @Column({ type: 'jsonb', nullable: true, default: '{}' })
  competency_marks: object;

  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  total_marks_obtained: number;

  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true })
  percentage: number;

  // One of 8 levels based on percentage
  @Column({ nullable: true })
  level: string;

  @Column({ nullable: true })
  assessed_by: string;

  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
