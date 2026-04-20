import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum UserRole {
  SUPER_ADMIN = 'super_admin',
  PRINCIPAL = 'principal',
  ADMIN = 'admin',
  TEACHER = 'teacher',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ unique: true })
  email: string;

  @Column()
  password_hash: string;

  @Column({ nullable: true })
  password: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.TEACHER })
  role: UserRole;

  @Column({ nullable: true })
  assigned_class: string;

  @Column({ nullable: true })
  assigned_section: string;

  @Column({ type: 'simple-array', nullable: true })
  subjects: string[];

  @Column({ type: 'simple-array', nullable: true })
  assigned_classes: string[];

  @Column({ type: 'simple-array', nullable: true })
  assigned_sections: string[];

  @Column({ nullable: true })
  class_teacher_of: string;

  @Column({ nullable: true, type: 'text' })
  photo: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  qualification: string;

  @Column({ nullable: true })
  appraisal_qualification: string;

  @Column({ nullable: true })
  experience: string;

  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}