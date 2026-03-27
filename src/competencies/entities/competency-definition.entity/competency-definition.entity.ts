import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export enum CompetencyDomain {
  DOMAIN_1 = 'domain_1',
  DOMAIN_2 = 'domain_2',
  DOMAIN_3 = 'domain_3',
  DOMAIN_4 = 'domain_4',
  DOMAIN_5 = 'domain_5',
}

export enum CompetencyStage {
  FOUNDATION = 'foundation',
  PREPARATORY = 'preparatory',
  MIDDLE = 'middle',
  SECONDARY = 'secondary',
}

@Entity('competency_definitions')
export class CompetencyDefinition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: CompetencyDomain })
  domain: CompetencyDomain;

  @Column({ type: 'enum', enum: CompetencyStage })
  stage: CompetencyStage;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ nullable: true })
  domain_name: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 50 })
  gap_threshold: number;

  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;
}