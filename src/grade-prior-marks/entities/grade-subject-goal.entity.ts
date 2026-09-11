import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

// One row per (academic_year, grade, subject) — a target percentage set by whichever
// teacher currently teaches that grade+subject. "This year's goal" and "next year's
// goal" (for the same cohort moving up) are both just rows here, tagged with their
// own target academic_year — set together, from the same screen, at the same time.
@Entity('grade_subject_goals')
export class GradeSubjectGoal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  academic_year: string;

  @Column()
  grade: string;

  @Column()
  subject: string;

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  goal_percentage: number;

  @Column({ nullable: true })
  set_by: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
