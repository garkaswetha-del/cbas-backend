import { MigrationInterface, QueryRunner } from 'typeorm';

// Adds two nullable columns to the existing hr_applicants table:
// - school_stage: Foundation/Preparatory/Middle/Secondary, used to scope
//   AI-generated NCF interview questions to the right level.
// - appointment_letter: base64 PDF (same data-URI storage pattern already
//   used for resume_file), auto-generated the moment a candidate is selected.
// Kept as its own migration per this project's deploy rule — push and confirm
// live before the code that reads/writes these columns goes out.
export class AddStageAndAppointmentLetterToHrApplicants1799000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "hr_applicants" ADD COLUMN IF NOT EXISTS "school_stage" character varying
    `);
    await queryRunner.query(`
      ALTER TABLE "hr_applicants" ADD COLUMN IF NOT EXISTS "appointment_letter" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "hr_applicants" DROP COLUMN IF EXISTS "school_stage"`);
    await queryRunner.query(`ALTER TABLE "hr_applicants" DROP COLUMN IF EXISTS "appointment_letter"`);
  }
}
