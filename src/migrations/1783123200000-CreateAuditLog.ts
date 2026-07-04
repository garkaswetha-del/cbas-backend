import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuditLog1783123200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "audit_logs" (
        "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
        "timestamp"     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "user_id"       character varying,
        "user_name"     character varying,
        "user_role"     character varying,
        "action"        character varying        NOT NULL,
        "resource_type" character varying,
        "resource_id"   character varying,
        "details"       jsonb,
        "ip_address"    character varying,
        "result"        character varying        NOT NULL DEFAULT 'success',
        CONSTRAINT "PK_audit_logs" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_audit_logs_timestamp" ON "audit_logs" ("timestamp")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_audit_logs_user_id"   ON "audit_logs" ("user_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_audit_logs_action"    ON "audit_logs" ("action")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs"`);
  }
}
