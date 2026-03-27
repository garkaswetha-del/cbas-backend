import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('learning_links')
export class LearningLink {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  entity_type: string;

  @Column()
  entity_id: string;

  @Column({ nullable: true })
  entity_name: string;

  @Column()
  academic_year: string;

  @Column()
  subject: string;

  @Column()
  domain: string;

  @Column()
  level: string;

  @Column({ nullable: true })
  grade: string;

  @Column({ nullable: true })
  stage: string;

  @Column({ type: 'jsonb', nullable: true })
  links: object;

  @Column({ type: 'text', nullable: true })
  gap_description: string;

  @Column({ default: false })
  is_generated: boolean;

  @CreateDateColumn()
  generated_at: Date;
}