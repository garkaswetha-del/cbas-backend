import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('substitution_log')
export class SubstitutionLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  substitute_teacher_id: string;

  @Column()
  absent_teacher_id: string;

  @Column()
  date: string; // YYYY-MM-DD

  @Column()
  day: string; // Mo | Tu | We | Th | Fr | Sa

  @Column()
  period: number;

  @Column({ type: 'simple-array', nullable: true })
  grades: number[];

  @Column({ type: 'simple-array', nullable: true })
  classes: string[];

  @CreateDateColumn()
  created_at: Date;
}
