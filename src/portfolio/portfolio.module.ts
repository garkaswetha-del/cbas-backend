import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PortfolioController } from './portfolio.controller';
import { PortfolioService } from './portfolio.service';
import { User } from '../users/entities/user.entity/user.entity';
import { TeacherAppraisal } from '../assessments/entities/teacher-appraisal.entity/teacher-appraisal.entity';
import { TeacherObservation } from '../observation/entities/teacher-observation.entity/teacher-observation.entity';
import { TeacherMapping } from '../mappings/entities/teacher-mapping.entity/teacher-mapping.entity';
import { ExamMarks } from '../pasa/entities/exam-marks.entity/exam-marks.entity';
import { BaselineAssessment } from '../assessments/entities/baseline-assessment.entity/baseline-assessment.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User, TeacherAppraisal, TeacherObservation, TeacherMapping, ExamMarks, BaselineAssessment,
    ]),
  ],
  controllers: [PortfolioController],
  providers: [PortfolioService],
})
export class PortfolioModule {}
