import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('exam_marks')
export class ExamMarks {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  student_id: string;

  @Column()
  student_name: string;

  @Column({ nullable: true })
  roll_number: string;

  @Column()
  grade: string;

  @Column()
  section: string;

  @Column()
  academic_year: string;

  @Column()
  exam_type: string;

  @Column()
  subject: string;

  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true })
  marks_obtained: number | null;

  @Column({ type: 'decimal', precision: 6, scale: 2, default: 100 })
  max_marks: number;

  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true })
  percentage: number | null;

  @Column({ default: false })
  is_absent: boolean;

  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}