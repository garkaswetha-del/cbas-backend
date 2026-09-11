import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GradePriorMarks } from './entities/grade-prior-marks.entity';
import { GradeSubjectGoal } from './entities/grade-subject-goal.entity';
import { TeacherMapping } from '../mappings/entities/teacher-mapping.entity/teacher-mapping.entity';
import { GradePriorMarksService } from './grade-prior-marks.service';
import { GradePriorMarksController } from './grade-prior-marks.controller';
import { GradeSubjectGoalsService } from './grade-subject-goals.service';
import { GradeSubjectGoalsController } from './grade-subject-goals.controller';
import { GradeSubjectsModule } from '../grade-subjects/grade-subjects.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([GradePriorMarks, GradeSubjectGoal, TeacherMapping]),
    GradeSubjectsModule,
  ],
  controllers: [GradePriorMarksController, GradeSubjectGoalsController],
  providers: [GradePriorMarksService, GradeSubjectGoalsService],
})
export class GradePriorMarksModule {}
