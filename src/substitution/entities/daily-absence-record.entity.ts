import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Teacher } from './teacher.entity';

export enum AbsenceStatus {
  ABSENT = 'ABSENT',
  TEMP_UNAVAILABLE = 'TEMP_UNAVAILABLE',
}

@Entity('daily_absence_records')
export class DailyAbsenceRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  teacher_id: string;

  @ManyToOne(() => Teacher, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'teacher_id' })
  teacher: Teacher;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'enum', enum: AbsenceStatus })
  status: AbsenceStatus;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
