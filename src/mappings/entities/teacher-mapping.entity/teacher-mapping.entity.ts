import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('teacher_mappings')
export class TeacherMapping {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  teacher_id: string;

  @Column()
  teacher_name: string;

  @Column()
  teacher_email: string;

  @Column()
  academic_year: string;

  @Column()
  grade: string;

  @Column()
  section: string;

  @Column({ type: 'varchar', nullable: true })
subject: string;

  @Column({ default: false })
  is_class_teacher: boolean;

  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}