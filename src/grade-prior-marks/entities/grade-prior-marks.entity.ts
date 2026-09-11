import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

// One row per (academic_year, grade, subject) — the grade-level average final-exam
// percentage for that year, imported from admin/AHM's Excel upload. Not student-level
// data; this is the single grade-wide number the school already has for that combo.
@Entity('grade_subject_prior_marks')
export class GradePriorMarks {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // The academic year these marks are FROM (e.g. a 2025-26 final-exam upload has
  // academic_year = '2025-26' here, regardless of which year it's later looked up from).
  @Column()
  academic_year: string;

  @Column()
  grade: string;

  @Column()
  subject: string;

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  average_percentage: number;

  @Column({ nullable: true })
  uploaded_by: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
