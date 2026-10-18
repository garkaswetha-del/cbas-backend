import { MigrationInterface, QueryRunner } from 'typeorm';

// Nullable, additive — lets one HR home (this backend) manage hiring for both
// campuses, tagging each applicant with which branch they applied to.
export class AddBranchToHrApplicants1801000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "hr_applicants" ADD COLUMN IF NOT EXISTS "branch" character varying
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "hr_applicants" DROP COLUMN IF EXISTS "branch"`);
  }
}
