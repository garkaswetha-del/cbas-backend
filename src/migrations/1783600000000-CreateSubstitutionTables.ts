import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSubstitutionTables1783600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "substitution_teachers" (
        "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
        "name"       character varying        NOT NULL,
        "is_active"  boolean                  NOT NULL DEFAULT true,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_substitution_teachers" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_substitution_teachers_name" UNIQUE ("name")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "timetable_periods" (
        "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
        "teacher_id"  uuid                     NOT NULL,
        "day"         character varying        NOT NULL,
        "period"      integer                  NOT NULL,
        "raw"         text                     NOT NULL,
        "period_type" character varying        NOT NULL,
        "grades"      text,
        "classes"     text,
        "is_active"   boolean                  NOT NULL DEFAULT true,
        "created_at"  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_timetable_periods" PRIMARY KEY ("id"),
        CONSTRAINT "FK_timetable_periods_teacher" FOREIGN KEY ("teacher_id")
          REFERENCES "substitution_teachers" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_timetable_periods_teacher_id" ON "timetable_periods" ("teacher_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_timetable_periods_is_active"  ON "timetable_periods" ("is_active")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_timetable_periods_day"        ON "timetable_periods" ("day")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "permanent_exception_teachers" (
        "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
        "teacher_id" uuid                     NOT NULL,
        "is_active"  boolean                  NOT NULL DEFAULT true,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_permanent_exception_teachers" PRIMARY KEY ("id"),
        CONSTRAINT "FK_permanent_exception_teachers_teacher" FOREIGN KEY ("teacher_id")
          REFERENCES "substitution_teachers" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_permanent_exception_teachers_teacher_id" ON "permanent_exception_teachers" ("teacher_id")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "daily_absence_records" (
        "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
        "teacher_id" uuid                     NOT NULL,
        "date"       date                     NOT NULL,
        "status"     character varying        NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_daily_absence_records" PRIMARY KEY ("id"),
        CONSTRAINT "FK_daily_absence_records_teacher" FOREIGN KEY ("teacher_id")
          REFERENCES "substitution_teachers" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_daily_absence_records_date" ON "daily_absence_records" ("date")`);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION substitution_set_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = now();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    for (const table of ['substitution_teachers', 'timetable_periods', 'permanent_exception_teachers', 'daily_absence_records']) {
      await queryRunner.query(`
        DROP TRIGGER IF EXISTS "trg_${table}_updated_at" ON "${table}"
      `);
      await queryRunner.query(`
        CREATE TRIGGER "trg_${table}_updated_at"
        BEFORE UPDATE ON "${table}"
        FOR EACH ROW EXECUTE FUNCTION substitution_set_updated_at()
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "daily_absence_records"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "permanent_exception_teachers"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "timetable_periods"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "substitution_teachers"`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS substitution_set_updated_at()`);
  }
}
