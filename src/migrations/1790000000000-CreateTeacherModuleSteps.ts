import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTeacherModuleSteps1790000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "teacher_module_steps" (
        "id"                  uuid         NOT NULL DEFAULT gen_random_uuid(),
        "teacher_id"          varchar      NOT NULL,
        "subject"             varchar      NOT NULL,
        "stage"               varchar      NOT NULL,
        "domain"              varchar      NOT NULL,
        "academic_year"       varchar,
        "step_learn_done"     boolean      NOT NULL DEFAULT false,
        "step_resources_done" boolean      NOT NULL DEFAULT false,
        "reflection_text"     text,
        "updated_at"          TIMESTAMP    NOT NULL DEFAULT now(),
        CONSTRAINT "PK_teacher_module_steps" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_teacher_module_steps"
      ON "teacher_module_steps" ("teacher_id", "subject", "stage", "domain", "academic_year")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_teacher_module_steps_teacher"
      ON "teacher_module_steps" ("teacher_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "teacher_module_steps"`);
  }
}
