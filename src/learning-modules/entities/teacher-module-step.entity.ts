import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity('teacher_module_steps')
export class TeacherModuleStep {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  teacher_id: string;

  @Column()
  subject: string; // 'literacy' | 'numeracy'

  @Column()
  stage: string; // 'foundation' | 'preparatory' | 'middle' | 'secondary'

  @Column()
  domain: string; // 'Listening' | 'Speaking' | 'Reading' | 'Writing' | 'Operations' | 'Base 10' | 'Measurement' | 'Geometry'

  @Column({ nullable: true })
  academic_year: string;

  @Column({ default: false })
  step_learn_done: boolean;

  @Column({ default: false })
  step_resources_done: boolean;

  @Column({ type: 'text', nullable: true })
  reflection_text: string;

  @UpdateDateColumn()
  updated_at: Date;
}
