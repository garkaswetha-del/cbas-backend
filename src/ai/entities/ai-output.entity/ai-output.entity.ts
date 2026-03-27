import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Student } from '../../../students/entities/student.entity/student.entity';

export enum AiOutputType {
  HOMEWORK = 'homework',
  ASSESSMENT = 'assessment',
  LEARNING_RESOURCE = 'learning_resource',
}

@Entity('ai_outputs')
export class AiOutput {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  student_id: string;

  @ManyToOne(() => Student)
  @JoinColumn({ name: 'student_id' })
  student: Student;

  @Column({ type: 'enum', enum: AiOutputType })
  type: AiOutputType;

  @Column({ type: 'text' })
  content: string;

  @Column({ nullable: true })
  competency_id: string;

  @Column({ nullable: true })
  class_at_time: string;

  @Column({ default: false })
  is_read: boolean;

  @CreateDateColumn()
  generated_at: Date;
}