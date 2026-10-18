import { MigrationInterface, QueryRunner } from 'typeorm';

// Kept as its OWN migration, separate from CreateHrTables, on purpose: this one
// alters the existing, heavily-queried "users" table, so per this project's
// deploy rule it must be pushed and confirmed live BEFORE the code that adds
// "is_inducting" to the User entity / reads or writes it goes out. The HR
// tables migration (1797...) has no such constraint — those are brand-new
// tables nothing existing touches.
export class AddIsInductingToUsers1798000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_inducting" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "is_inducting"`);
  }
}
