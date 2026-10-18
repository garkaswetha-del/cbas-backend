import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateHrTables1797000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "hr_applicants" (
        "id"                   uuid          NOT NULL DEFAULT gen_random_uuid(),
        "name"                 varchar,
        "email"                varchar,
        "contact_no"           varchar,
        "address"              text,
        "locality"             varchar,
        "qualification"        varchar,
        "experience_years"     numeric(4,1),
        "experience_detail"    text,
        "skills"               text,
        "guardian_name"        varchar,
        "religion"             varchar,
        "caste"                varchar,
        "previous_salary"      numeric(10,2),
        "expected_salary"      numeric(10,2),
        "subject_applied_for"  varchar,
        "source_portal"        varchar,
        "resume_file"          text,
        "extra_json"           jsonb         NOT NULL DEFAULT '{}',
        "is_shortlisted"       boolean       NOT NULL DEFAULT false,
        "shortlisted_by"       varchar,
        "shortlisted_at"       TIMESTAMP,
        "shortlist_notes"      text,
        "stage"                varchar       NOT NULL DEFAULT 'applied',
        "user_id"              varchar,
        "created_at"           TIMESTAMP     NOT NULL DEFAULT now(),
        "updated_at"           TIMESTAMP     NOT NULL DEFAULT now(),
        CONSTRAINT "PK_hr_applicants" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_hr_applicants_stage" ON "hr_applicants" ("stage")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_hr_applicants_shortlisted" ON "hr_applicants" ("is_shortlisted")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "hr_interviews" (
        "id"                  uuid          NOT NULL DEFAULT gen_random_uuid(),
        "applicant_id"        uuid          NOT NULL,
        "interview_date"      date,
        "slot_time"           varchar,
        "interviewer_name"    varchar,
        "scheduled_by"        varchar,
        "scheduled_at"        TIMESTAMP,
        "candidate_notified"  boolean       NOT NULL DEFAULT false,
        "notified_at"         TIMESTAMP,
        "attended"            boolean,
        "written_marks"       numeric(6,2), "written_max" numeric(6,2),
        "oral_marks"          numeric(6,2), "oral_max"    numeric(6,2),
        "demo_marks"          numeric(6,2), "demo_max"    numeric(6,2),
        "result"              varchar       NOT NULL DEFAULT 'pending',
        "notes"               text,
        "created_at"          TIMESTAMP     NOT NULL DEFAULT now(),
        "updated_at"          TIMESTAMP     NOT NULL DEFAULT now(),
        CONSTRAINT "PK_hr_interviews" PRIMARY KEY ("id"),
        CONSTRAINT "FK_hr_interviews_applicant" FOREIGN KEY ("applicant_id") REFERENCES "hr_applicants"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_hr_interviews_date" ON "hr_interviews" ("interview_date")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_hr_interviews_applicant" ON "hr_interviews" ("applicant_id")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "hr_induction_videos" (
        "id"                uuid          NOT NULL DEFAULT gen_random_uuid(),
        "title"             varchar       NOT NULL,
        "description"       text,
        "video_url"         text          NOT NULL,
        "duration_seconds"  integer       NOT NULL DEFAULT 0,
        "sort_order"        integer       NOT NULL DEFAULT 0,
        "is_active"         boolean       NOT NULL DEFAULT true,
        "due_days"          integer,
        "created_at"        TIMESTAMP     NOT NULL DEFAULT now(),
        CONSTRAINT "PK_hr_induction_videos" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "hr_induction_progress" (
        "id"                     uuid          NOT NULL DEFAULT gen_random_uuid(),
        "user_id"                varchar       NOT NULL,
        "video_id"               uuid          NOT NULL,
        "watched_seconds"        numeric(8,1)  NOT NULL DEFAULT 0,
        "max_position_reached"   numeric(8,1)  NOT NULL DEFAULT 0,
        "completed"              boolean       NOT NULL DEFAULT false,
        "completed_at"           TIMESTAMP,
        "assigned_at"            TIMESTAMP     NOT NULL DEFAULT now(),
        "due_at"                 TIMESTAMP,
        "updated_at"             TIMESTAMP     NOT NULL DEFAULT now(),
        CONSTRAINT "PK_hr_induction_progress" PRIMARY KEY ("id"),
        CONSTRAINT "FK_hr_induction_progress_video" FOREIGN KEY ("video_id") REFERENCES "hr_induction_videos"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_hr_induction_progress" ON "hr_induction_progress" ("user_id", "video_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "hr_induction_progress"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "hr_induction_videos"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "hr_interviews"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "hr_applicants"`);
  }
}
