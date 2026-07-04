import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn({ type: 'timestamptz' })
  timestamp: Date;

  @Column({ nullable: true })
  user_id: string;

  @Column({ nullable: true })
  user_name: string;

  @Column({ nullable: true })
  user_role: string;

  @Column()
  action: string;

  @Column({ nullable: true })
  resource_type: string;

  @Column({ nullable: true })
  resource_id: string;

  @Column({ type: 'jsonb', nullable: true })
  details: Record<string, any>;

  @Column({ nullable: true })
  ip_address: string;

  @Column({ default: 'success' })
  result: string;
}
