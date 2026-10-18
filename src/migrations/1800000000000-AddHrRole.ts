import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHrRole1800000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('users');
    if (!tableExists) return; // fresh DB — synchronize will create enum with 'hr' included

    await queryRunner.query(
      `ALTER TYPE users_role_enum ADD VALUE IF NOT EXISTS 'hr'`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL does not allow removing a value from an enum type
    // 'hr' remains in the type but no code assigns it
  }
}
