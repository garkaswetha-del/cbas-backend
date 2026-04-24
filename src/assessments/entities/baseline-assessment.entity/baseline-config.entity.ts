import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn, Unique } from 'typeorm';

@Entity('baseline_configs')
@Unique(['academic_year', 'round', 'grade', 'section'])
export class BaselineConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  academic_year: string;

  @Column()
  round: string;

  // null = school-wide threshold record; set = class-specific lock record
  @Column({ nullable: true })
  grade: string | null;

  @Column({ nullable: true })
  section: string | null;

  // thresholds (only meaningful when grade+section are null)
  @Column({ type: 'float', default: 60 })
  gap_threshold: number;

  @Column({ type: 'float', default: 80 })
  promotion_threshold: number;

  @Column({ default: false })
  is_locked: boolean;

  @UpdateDateColumn()
  updated_at: Date;
}
