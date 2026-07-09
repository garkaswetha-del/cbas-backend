import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { Student } from './student.entity/student.entity';

@Entity('student_enrollments')
@Unique(['student_id', 'academic_year'])
export class StudentEnrollment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  student_id: string;

  @ManyToOne(() => Student, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'student_id' })
  student: Student;

  @Column()
  academic_year: string;

  @Column({ nullable: true })
  class: string;

  @Column({ nullable: true })
  section: string;

  @CreateDateColumn()
  created_at: Date;
}
