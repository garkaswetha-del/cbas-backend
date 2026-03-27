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

  // { competency_id: 'beginning' | 'approaching' | 'meeting' | 'exceeding' }
  @Column({ type: 'jsonb', nullable: true })
  competency_ratings: object;

  @Column({ nullable: true })
  overall_rating: string;

  @Column({ nullable: true })
  assessed_by: string;

  @Column({ default: false })
  is_complete: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}