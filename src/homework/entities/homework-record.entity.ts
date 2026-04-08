import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('ai_homework_records')
export class HomeworkRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  teacher_id: string;

  @Column()
  teacher_name: string;

  @Column()
  grade: string;

  @Column()
  section: string;

  @Column()
  subject: string;

  @Column()
  academic_year: string;

  @Column()
  type: string; // AME | Practice | Assessment | Weekly | ParentSuggestion

  @Column({ nullable: true })
  competency_id: string;

  @Column({ nullable: true })
  competency_name: string;

  @Column({ nullable: true })
  topic: string;

  // AME content fields
  @Column({ type: 'text', nullable: true })
  content_a: string; // Above average

  @Column({ type: 'text', nullable: true })
  content_m: string; // Medium

  @Column({ type: 'text', nullable: true })
  content_e: string; // Emerging

  // Single content for non-AME types
  @Column({ type: 'text', nullable: true })
  content: string;

  // For parent suggestions only
  @Column({ nullable: true })
  student_id: string;

  @Column({ nullable: true })
  student_name: string;

  @CreateDateColumn()
  created_at: Date;
}
