import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { ActivitiesService } from './activities.service';
import { ActivitiesController } from './activities.controller';
import { Activity } from './entities/activity.entity/activity.entity';
import { ActivityAssessment } from './entities/activity-assessment.entity/activity-assessment.entity';
import { StudentCompetencyScore } from './entities/student-competency-score.entity/student-competency-score.entity';
import { CompetencyFramework } from '../competencies/entities/competency-framework.entity/competency-framework.entity';
import { Student } from '../students/entities/student.entity/student.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Activity, ActivityAssessment, StudentCompetencyScore, CompetencyFramework, Student]),
    MulterModule.register({ limits: { fileSize: 10 * 1024 * 1024 } }),
  ],
  providers: [ActivitiesService],
  controllers: [ActivitiesController],
  exports: [ActivitiesService],
})
export class ActivitiesModule {}