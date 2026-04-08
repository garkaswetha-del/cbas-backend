import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Student } from './students/entities/student.entity/student.entity';
import { User } from './users/entities/user.entity/user.entity';
import { Assessment } from './assessments/entities/assessment.entity/assessment.entity';
import { CompetencyScore } from './competencies/entities/competency-score.entity/competency-score.entity';
import { AiOutput } from './ai/entities/ai-output.entity/ai-output.entity';
import { CompetencyDefinition } from './competencies/entities/competency-definition.entity/competency-definition.entity';
import { TeacherAppraisal } from './assessments/entities/teacher-appraisal.entity/teacher-appraisal.entity';
import { CompetencyFramework } from './competencies/entities/competency-framework.entity/competency-framework.entity';
import { BaselineAssessment } from './assessments/entities/baseline-assessment.entity/baseline-assessment.entity';
import { LearningLink } from './assessments/entities/learning-link.entity/learning-link.entity';
import { Activity } from './activities/entities/activity.entity/activity.entity';
import { ActivityAssessment } from './activities/entities/activity-assessment.entity/activity-assessment.entity';
import { StudentCompetencyScore } from './activities/entities/student-competency-score.entity/student-competency-score.entity';
import { TeacherObservation } from './observation/entities/teacher-observation.entity/teacher-observation.entity';
import { AuthModule } from './auth/auth.module';
import { StudentsModule } from './students/students.module';
import { AssessmentsModule } from './assessments/assessments.module';
import { CompetenciesModule } from './competencies/competencies.module';
import { AiModule } from './ai/ai.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { ReportsModule } from './reports/reports.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { AppraisalModule } from './appraisal/appraisal.module';
import { UsersModule } from './users/users.module';
import { BaselineModule } from './baseline/baseline.module';
import { LearningLinksModule } from './learning-links/learning-links.module';
import { ActivitiesModule } from './activities/activities.module';
import { ObservationModule } from './observation/observation.module';
import { PasaModule } from './pasa/pasa.module';
import { ExamConfig } from './pasa/entities/exam-config.entity/exam-config.entity';
import { ExamMarks } from './pasa/entities/exam-marks.entity/exam-marks.entity';
import { MappingsModule } from './mappings/mappings.module';
import { TeacherMapping } from './mappings/entities/teacher-mapping.entity/teacher-mapping.entity';
import { HomeworkRecord } from './homework/entities/homework-record.entity';
import { HomeworkModule } from './homework/homework.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DB_HOST'),
        port: +(config.get<number>('DB_PORT') ?? 5432),
        username: config.get('DB_USERNAME'),
        password: config.get('DB_PASSWORD'),
        database: config.get('DB_NAME'),
        entities: [
          Student,
          User,
          Assessment,
          CompetencyScore,
          AiOutput,
          CompetencyDefinition,
          TeacherAppraisal,
          CompetencyFramework,
          BaselineAssessment,
          LearningLink,
          Activity,
          ActivityAssessment,
          StudentCompetencyScore,
          TeacherObservation,
          ExamConfig,
          ExamMarks,
          TeacherMapping,
          HomeworkRecord,
        ],
        synchronize: true,
        logging: true,
      }),
      inject: [ConfigService],
    }),
    AuthModule,
    StudentsModule,
    AssessmentsModule,
    CompetenciesModule,
    AiModule,
    AnalyticsModule,
    ReportsModule,
    SchedulerModule,
    AppraisalModule,
    UsersModule,
    BaselineModule,
    LearningLinksModule,
    ActivitiesModule,
    ObservationModule,
    PasaModule,
    MappingsModule,
    HomeworkModule,
  ],
})
export class AppModule {}