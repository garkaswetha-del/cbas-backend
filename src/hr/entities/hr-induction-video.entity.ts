import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('hr_induction_videos')
export class HrInductionVideo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column() title: string;
  @Column({ nullable: true, type: 'text' }) description: string;
  // Direct playable file URL (mp4) — needs to be a real <video src>, not a YouTube/Vimeo
  // embed, so the player can track real watch position and block skip-ahead.
  @Column({ type: 'text' }) video_url: string;
  @Column({ default: 0 }) duration_seconds: number;
  @Column({ default: 0 }) sort_order: number;
  @Column({ default: true }) is_active: boolean;
  @Column({ nullable: true }) due_days: number;

  @CreateDateColumn() created_at: Date;
}
