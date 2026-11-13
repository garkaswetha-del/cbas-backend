import { MigrationInterface, QueryRunner } from 'typeorm';

// Nullable/defaulted, additive — lets HR mark when a selected candidate has
// actually joined, separate from the interview "selected" decision, and gates
// manual appointment-letter generation on it.
export class AddJoiningToHrApplicants1802000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "hr_applicants" ADD COLUMN IF NOT EXISTS "joined" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      ALTER TABLE "hr_applicants" ADD COLUMN IF NOT EXISTS "joining_date" date
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "hr_applicants" DROP COLUMN IF EXISTS "joining_date"`);
    await queryRunner.query(`ALTER TABLE "hr_applicants" DROP COLUMN IF EXISTS "joined"`);
  }
}
