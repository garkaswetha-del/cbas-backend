import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn, Unique } from 'typeorm';

@Entity('baseline_participation')
@Unique(['academic_year'])
export class BaselineParticipation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 20 })
  academic_year: string;

  @Column({ type: 'simple-array' })
  participating_grades: string[];

  @UpdateDateColumn()
  updated_at: Date;
}
