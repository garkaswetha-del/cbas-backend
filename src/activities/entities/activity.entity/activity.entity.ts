import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('activities')
export class Activity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column()
  subject: string;

  @Column({ type: 'simple-array', nullable: true })
  extra_subjects: string[];

  @Column()
  stage: string;

  @Column()
  grade: string;

  @Column()
  academic_year: string;

  @Column({ default: 'Individual' })
  activity_type: string;

  @Column({ nullable: true })
  activity_date: string;

  @Column({ nullable: true })
  section: string;

  // competency_mappings: array of competency IDs
  @Column({ type: 'jsonb', nullable: true })
  competency_mappings: string[];

  // rubrics: [{competency_id, competency_code, competency_name, rubric_items: [{name, max_marks}]}]
  @Column({ type: 'jsonb', nullable: true, default: '[]' })
  rubrics: object[];

  // total max marks across all competency rubric items
  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  total_max_marks: number;

  @Column({ nullable: true })
  created_by: string;

  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
