import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn } from 'typeorm';

// Stores per-round thresholds and per-class lock state.
// grade='' + section='' → school-wide threshold record for that year/round
// grade+section set → lock record for that specific class
@Entity('baseline_settings')
export class BaselineConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  academic_year: string;

  @Column()
  round: string;

  @Column({ default: '' })
  grade: string;

  @Column({ default: '' })
  section: string;

  @Column({ type: 'float', default: 60 })
  gap_threshold: number;

  @Column({ type: 'float', default: 80 })
  promotion_threshold: number;

  @Column({ default: false })
  is_locked: boolean;

  @UpdateDateColumn()
  updated_at: Date;
}
