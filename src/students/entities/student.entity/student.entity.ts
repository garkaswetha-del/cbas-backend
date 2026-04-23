import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('students')
export class Student {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  admission_no: string;

  @Column({ nullable: true })
  current_class: string;

  @Column({ nullable: true })
  section: string;

  @Column({ nullable: true })
  gender: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  dob: string;

  @Column({ nullable: true })
  admission_year: string;

  // Parent details
  @Column({ nullable: true })
  father_name: string;

  @Column({ nullable: true })
  mother_name: string;

  @Column({ nullable: true })
  parent_phone: string;

  @Column({ nullable: true })
  father_qualification: string;

  @Column({ nullable: true })
  mother_qualification: string;

  @Column({ nullable: true })
  father_working_status: string;

  @Column({ nullable: true })
  mother_working_status: string;

  @Column({ nullable: true })
  address: string;

  @Column({ default: true })
  is_active: boolean;

  @Column({ nullable: true })
  tc_date: string;

  @Column({ nullable: true })
  tc_reason: string;

  @Column({ nullable: true })
  graduation_year: string;

  @Column({ default: false })
  is_graduated: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}