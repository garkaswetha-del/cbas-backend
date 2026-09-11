import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateGradeSubjectPriorMarks1795000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "grade_subject_prior_marks" (
        "id"                  uuid          NOT NULL DEFAULT gen_random_uuid(),
        "academic_year"       varchar       NOT NULL,
        "grade"               varchar       NOT NULL,
        "subject"             varchar       NOT NULL,
        "average_percentage"  numeric(5,2)  NOT NULL,
        "uploaded_by"         varchar,
        "created_at"          TIMESTAMP     NOT NULL DEFAULT now(),
        "updated_at"          TIMESTAMP     NOT NULL DEFAULT now(),
        CONSTRAINT "PK_grade_subject_prior_marks" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_grade_subject_prior_marks"
      ON "grade_subject_prior_marks" ("academic_year", "grade", LOWER(TRIM("subject")))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "grade_subject_prior_marks"`);
  }
}
