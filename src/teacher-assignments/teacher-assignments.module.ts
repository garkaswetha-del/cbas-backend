import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TeacherAssignment } from './entities/teacher-assignment.entity';
import { TeacherAssignmentsService } from './teacher-assignments.service';
import { TeacherAssignmentsController } from './teacher-assignments.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TeacherAssignment])],
  controllers: [TeacherAssignmentsController],
  providers: [TeacherAssignmentsService],
  exports: [TeacherAssignmentsService],
})
export class TeacherAssignmentsModule {}
