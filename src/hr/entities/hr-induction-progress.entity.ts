import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity('hr_induction_progress')
export class HrInductionProgress {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column() user_id: string;
  @Column() video_id: string;

  // Real cumulative distinct-seconds watched — NOT just "current position", so
  // skipping to the end doesn't count as having watched what was skipped.
  @Column({ type: 'decimal', precision: 8, scale: 1, default: 0 }) watched_seconds: number;
  @Column({ type: 'decimal', precision: 8, scale: 1, default: 0 }) max_position_reached: number;
  @Column({ default: false }) completed: boolean;
  @Column({ nullable: true, type: 'timestamp' }) completed_at: Date | null;

  @Column({ type: 'timestamp' }) assigned_at: Date;
  @Column({ nullable: true, type: 'timestamp' }) due_at: Date | null;

  @UpdateDateColumn() updated_at: Date;
}
