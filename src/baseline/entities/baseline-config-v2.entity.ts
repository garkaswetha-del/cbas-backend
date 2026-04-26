import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn, Unique } from 'typeorm';

@Entity('baseline_configs_v2')
@Unique(['academic_year', 'round', 'grade', 'section'])
export class BaselineConfigV2 {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 20 })
  academic_year: string;

  @Column({ length: 20 })
  round: string;

  @Column({ length: 100, default: '' })
  grade: string;

  @Column({ length: 100, default: '' })
  section: string;

  @Column({ type: 'double precision', default: 60 })
  gap_threshold: number;

  @Column({ type: 'double precision', default: 80 })
  promotion_threshold: number;

  @Column({ default: false })
  is_locked: boolean;

  @UpdateDateColumn()
  updated_at: Date;
}
