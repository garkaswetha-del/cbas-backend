import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Unique } from 'typeorm';

@Entity('sections')
@Unique(['grade', 'name', 'academic_year'])
export class Section {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  grade: string;

  @Column()
  name: string;

  @Column({ default: '2025-26' })
  academic_year: string;

  @Column({ default: true })
  is_active: boolean;

  @Column({ default: 0 })
  display_order: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
