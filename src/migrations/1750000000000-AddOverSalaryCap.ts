import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOverSalaryCap1750000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('users');
    if (!tableExists) return; // fresh DB — synchronize will create the column via entity
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "over_salary_cap" boolean NOT NULL DEFAULT false`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "over_salary_cap"`);
  }
}
