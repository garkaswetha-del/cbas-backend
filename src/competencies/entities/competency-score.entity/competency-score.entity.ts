import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Student } from '../../../students/entities/student.entity/student.entity';

@Entity('competency_scores')
export class CompetencyScore {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  student_id: string;

  @ManyToOne(() => Student)
  @JoinColumn({ name: 'student_id' })
  student: Student;

  @Column()
  competency_id: string;

  @Column()
  class: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  score: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  written_score: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  activity_score: number;

  @Column({ nullable: true })
  academic_year: string;

  @CreateDateColumn()
  calculated_at: Date;
}