import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum UserRole {
  SUPER_ADMIN = 'super_admin',
  PRINCIPAL = 'principal',
  ADMIN = 'admin',
  TEACHER = 'teacher',
  AHM = 'ahm',
  OFFICE = 'office',
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

  @Column({ nullable: true, type: 'timestamp' })
  deactivated_at: Date | null;

  @Column({ nullable: true, type: 'timestamp' })
  last_login_at: Date | null;

  @Column({ default: false })
  credentials_shared: boolean;

  @Column({ select: false, nullable: true, default: false })
  over_salary_cap: boolean;

  // HR induction: true while a newly-selected candidate still has induction videos
  // to finish. Frontend routes them to an induction-only screen until this flips
  // false (on "Hire"), at which point they fall through to the normal teacher flow.
  // NOTE: only safe to read/write once migration 1798 (AddIsInductingToUsers) has
  // actually run on the target database — see that migration's comment.
  @Column({ nullable: true, default: false })
  is_inducting: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}