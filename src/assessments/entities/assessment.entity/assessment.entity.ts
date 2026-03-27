import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Student } from '../../../students/entities/student.entity/student.entity';

export enum AssessmentType {
  WRITTEN = 'written',
  ACTIVITY = 'activity',
}

export enum QualitativeRating {
  BEST = 'best',
  NEAR_TO_BEST = 'near_to_best',
  GOOD = 'good',
  NEAR_TO_GOOD = 'near_to_good',
  OKAY = 'okay',
  SATISFACTORY = 'satisfactory',
  NOT_SATISFIED = 'not_satisfied',
}

@Entity('assessments')
export class Assessment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  student_id: string;

  @ManyToOne(() => Student)
  @JoinColumn({ name: 'student_id' })
  student: Student;

  @Column({ type: 'enum', enum: AssessmentType })
  type: AssessmentType;

  @Column()
  exam_name: string;

  @Column()
  competency_id: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  marks_obtained: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  max_marks: number;

  @Column({ type: 'enum', enum: QualitativeRating, nullable: true })
  qualitative_rating: QualitativeRating;

  @Column()
  class_at_time: string;

  @Column({ type: 'date' })
  date: Date;

  @CreateDateColumn()
  created_at: Date;
}