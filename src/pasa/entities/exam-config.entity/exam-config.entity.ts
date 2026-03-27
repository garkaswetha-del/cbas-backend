import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('exam_configs')
export class ExamConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  academic_year: string;

  @Column()
  exam_type: string; // PA1, PA2, SA1, PA3, PA4, SA2, custom

  @Column()
  grade: string;

  @Column()
  subject: string;

  @Column({ type: 'decimal', precision: 6, scale: 2, default: 100 })
  max_marks: number;

  @Column({ nullable: true })
  exam_date: string;

  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}