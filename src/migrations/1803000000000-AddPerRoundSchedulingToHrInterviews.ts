import { MigrationInterface, QueryRunner } from 'typeorm';

// Written/Oral/Demo are often conducted on different days, so each interview round
// gets its own schedule/notify/attendance/notes instead of one shared set of fields.
// Additive only — legacy interview_date/slot_time/interviewer_name/candidate_notified/
// notified_at/attended/notes columns are kept, and backfilled into written_* so
// already-conducted interviews aren't orphaned.
export class AddPerRoundSchedulingToHrInterviews1803000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const rounds = ['written', 'oral', 'demo'];
    for (const r of rounds) {
      await queryRunner.query(`ALTER TABLE "hr_interviews" ADD COLUMN IF NOT EXISTS "${r}_date" date`);
      await queryRunner.query(`ALTER TABLE "hr_interviews" ADD COLUMN IF NOT EXISTS "${r}_time" character varying`);
      await queryRunner.query(`ALTER TABLE "hr_interviews" ADD COLUMN IF NOT EXISTS "${r}_interviewer" character varying`);
      await queryRunner.query(`ALTER TABLE "hr_interviews" ADD COLUMN IF NOT EXISTS "${r}_notified" boolean NOT NULL DEFAULT false`);
      await queryRunner.query(`ALTER TABLE "hr_interviews" ADD COLUMN IF NOT EXISTS "${r}_notified_at" timestamp`);
      await queryRunner.query(`ALTER TABLE "hr_interviews" ADD COLUMN IF NOT EXISTS "${r}_attended" boolean`);
      await queryRunner.query(`ALTER TABLE "hr_interviews" ADD COLUMN IF NOT EXISTS "${r}_notes" text`);
    }
    await queryRunner.query(`ALTER TABLE "hr_interviews" ADD COLUMN IF NOT EXISTS "written_proceed_anyway" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "hr_interviews" ADD COLUMN IF NOT EXISTS "oral_proceed_anyway" boolean NOT NULL DEFAULT false`);

    // Backfill: treat every already-recorded single-round interview as "Written"
    await queryRunner.query(`
      UPDATE "hr_interviews" SET
        "written_date" = "interview_date",
        "written_time" = "slot_time",
        "written_interviewer" = "interviewer_name",
        "written_notified" = "candidate_notified",
        "written_notified_at" = "notified_at",
        "written_attended" = "attended",
        "written_notes" = "notes"
      WHERE "interview_date" IS NOT NULL AND "written_date" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const rounds = ['written', 'oral', 'demo'];
    for (const r of rounds) {
      await queryRunner.query(`ALTER TABLE "hr_interviews" DROP COLUMN IF EXISTS "${r}_date"`);
      await queryRunner.query(`ALTER TABLE "hr_interviews" DROP COLUMN IF EXISTS "${r}_time"`);
      await queryRunner.query(`ALTER TABLE "hr_interviews" DROP COLUMN IF EXISTS "${r}_interviewer"`);
      await queryRunner.query(`ALTER TABLE "hr_interviews" DROP COLUMN IF EXISTS "${r}_notified"`);
      await queryRunner.query(`ALTER TABLE "hr_interviews" DROP COLUMN IF EXISTS "${r}_notified_at"`);
      await queryRunner.query(`ALTER TABLE "hr_interviews" DROP COLUMN IF EXISTS "${r}_attended"`);
      await queryRunner.query(`ALTER TABLE "hr_interviews" DROP COLUMN IF EXISTS "${r}_notes"`);
    }
    await queryRunner.query(`ALTER TABLE "hr_interviews" DROP COLUMN IF EXISTS "written_proceed_anyway"`);
    await queryRunner.query(`ALTER TABLE "hr_interviews" DROP COLUMN IF EXISTS "oral_proceed_anyway"`);
  }
}
