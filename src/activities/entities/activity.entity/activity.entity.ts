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

  @Column()
  stage: string;

  @Column()
  grade: string;

  @Column()
  academic_year: string;

  @Column({ default: 'observation' })
  activity_type: string;

  @Column({ nullable: true })
  activity_date: string;

  @Column({ nullable: true })
  section: string;

  @Column({ type: 'jsonb', nullable: true })
  competency_mappings: string[];

  @Column({ nullable: true })
  created_by: string;

  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}