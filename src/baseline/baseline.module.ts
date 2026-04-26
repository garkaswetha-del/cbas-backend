import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BaselineController } from './baseline.controller';
import { BaselineService } from './baseline.service';
import { BaselineAssessment } from '../assessments/entities/baseline-assessment.entity/baseline-assessment.entity';
import { Student } from '../students/entities/student.entity/student.entity';
import { User } from '../users/entities/user.entity/user.entity';
import { LearningLink } from '../assessments/entities/learning-link.entity/learning-link.entity';
import { SectionsModule } from '../sections/sections.module';
import { BaselineConfigV2 } from './entities/baseline-config-v2.entity';

@Module({
  imports: [TypeOrmModule.forFeature([BaselineAssessment, Student, User, LearningLink, BaselineConfigV2]), SectionsModule],
  controllers: [BaselineController],
  providers: [BaselineService],
  exports: [BaselineService],
})
export class BaselineModule {}