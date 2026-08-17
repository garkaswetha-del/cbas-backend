import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LearningModulesController } from './learning-modules.controller';
import { LearningModulesService } from './learning-modules.service';
import { TeacherModuleStep } from './entities/teacher-module-step.entity';
import { BaselineAssessment } from '../assessments/entities/baseline-assessment.entity/baseline-assessment.entity';

@Module({
  imports: [TypeOrmModule.forFeature([TeacherModuleStep, BaselineAssessment])],
  controllers: [LearningModulesController],
  providers: [LearningModulesService],
  exports: [LearningModulesService],
})
export class LearningModulesModule {}
