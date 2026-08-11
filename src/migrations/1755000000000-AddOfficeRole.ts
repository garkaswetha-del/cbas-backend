import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOfficeRole1755000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('users');
    if (!tableExists) return; // fresh DB — synchronize will create enum with 'office' included

    await queryRunner.query(
      `ALTER TYPE users_role_enum ADD VALUE IF NOT EXISTS 'office'`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL does not allow removing a value from an enum type
    // 'office' remains in the type but no code assigns it
  }
}
