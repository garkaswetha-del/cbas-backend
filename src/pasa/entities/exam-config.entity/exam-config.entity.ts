import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('exam_configs')
export class ExamConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  academic_year: string;

  @Column()
  exam_type: string; // FA1, FA2, SA1, SA2, Custom

  @Column()
  grade: string;

  @Column()
  section: string;

  @Column()
  subject: string;

  @Column()
  teacher_id: string;

  @Column()
  teacher_name: string;

  // Competency-mapped marks allocation
  // [{ competency_id, competency_code, competency_name, max_marks }]
  @Column({ type: 'jsonb', default: '[]' })
  competencies: object[];

  @Column({ type: 'decimal', precision: 6, scale: 2, default: 0 })
  total_marks: number;

  @Column({ nullable: true })
  exam_date: string;

  @Column({ nullable: true })
  description: string;

  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
