import { Module } from '@nestjs/common';
import { GradeSubjectsService } from './grade-subjects.service';
import { GradeSubjectsController } from './grade-subjects.controller';

@Module({
  controllers: [GradeSubjectsController],
  providers: [GradeSubjectsService],
  exports: [GradeSubjectsService],
})
export class GradeSubjectsModule {}
