import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BaselineController } from './baseline.controller';
import { BaselineService } from './baseline.service';
import { BaselineAssessment } from '../assessments/entities/baseline-assessment.entity/baseline-assessment.entity';
import { BaselineConfig } from '../assessments/entities/baseline-assessment.entity/baseline-config.entity';
import { Student } from '../students/entities/student.entity/student.entity';
import { User } from '../users/entities/user.entity/user.entity';
import { LearningLink } from '../assessments/entities/learning-link.entity/learning-link.entity';

@Module({
  imports: [TypeOrmModule.forFeature([BaselineAssessment, BaselineConfig, Student, User, LearningLink])],
  controllers: [BaselineController],
  providers: [BaselineService],
  exports: [BaselineService],
})
export class BaselineModule {}