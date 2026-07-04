import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';
import { Student } from './entities/student.entity/student.entity';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
  imports: [TypeOrmModule.forFeature([Student]), AuditLogModule],
  controllers: [StudentsController],
  providers: [StudentsService],
  exports: [StudentsService],
})
export class StudentsModule {}