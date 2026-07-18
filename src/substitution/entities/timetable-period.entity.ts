import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Teacher } from './teacher.entity';

export enum TimetableDay {
  MO = 'Mo',
  TU = 'Tu',
  WE = 'We',
  TH = 'Th',
  FR = 'Fr',
  SA = 'Sa',
}

export enum PeriodType {
  ACADEMIC = 'ACADEMIC',
  CCA = 'CCA',
}

@Entity('timetable_periods')
export class TimetablePeriod {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  teacher_id: string;

  @ManyToOne(() => Teacher, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'teacher_id' })
  teacher: Teacher;

  @Column({ type: 'enum', enum: TimetableDay })
  day: TimetableDay;

  @Column()
  period: number;

  @Column({ type: 'text' })
  raw: string;

  @Column({ type: 'enum', enum: PeriodType })
  period_type: PeriodType;

  @Column({ type: 'simple-array', nullable: true })
  grades: number[];

  @Column({ type: 'simple-array', nullable: true })
  classes: string[];

  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
