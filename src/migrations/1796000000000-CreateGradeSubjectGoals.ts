import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateGradeSubjectGoals1796000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "grade_subject_goals" (
        "id"                uuid          NOT NULL DEFAULT gen_random_uuid(),
        "academic_year"     varchar       NOT NULL,
        "grade"              varchar       NOT NULL,
        "subject"            varchar       NOT NULL,
        "goal_percentage"    numeric(5,2)  NOT NULL,
        "set_by"             varchar,
        "created_at"         TIMESTAMP     NOT NULL DEFAULT now(),
        "updated_at"         TIMESTAMP     NOT NULL DEFAULT now(),
        CONSTRAINT "PK_grade_subject_goals" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_grade_subject_goals"
      ON "grade_subject_goals" ("academic_year", "grade", LOWER(TRIM("subject")))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "grade_subject_goals"`);
  }
}
