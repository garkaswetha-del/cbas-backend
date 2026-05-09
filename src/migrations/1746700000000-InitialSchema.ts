import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Baseline migration — all tables already exist on Railway from synchronize:true.
 * This migration marks the starting point. Future entity changes get new migration files.
 */
export class InitialSchema1746700000000 implements MigrationInterface {
  public async up(_queryRunner: QueryRunner): Promise<void> {
    // Tables already exist — no action needed
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // No rollback for baseline
  }
}
