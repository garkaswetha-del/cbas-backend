import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
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
import { LearningModulesModule } from './learning-modules/learning-modules.module';
import { TeacherModuleStep } from './learning-modules/entities/teacher-module-step.entity';
import { ActivitiesModule } from './activities/activities.module';
import { ObservationModule } from './observation/observation.module';
import { PasaModule } from './pasa/pasa.module';
import { ExamConfig } from './pasa/entities/exam-config.entity/exam-config.entity';
import { ExamMarks } from './pasa/entities/exam-marks.entity/exam-marks.entity';
import { MappingsModule } from './mappings/mappings.module';
import { TeacherMapping } from './mappings/entities/teacher-mapping.entity/teacher-mapping.entity';
import { HomeworkRecord } from './homework/entities/homework-record.entity';
import { HomeworkModule } from './homework/homework.module';
import { TeacherAssignment } from './teacher-assignments/entities/teacher-assignment.entity';
import { TeacherAssignmentsModule } from './teacher-assignments/teacher-assignments.module';
import { Section } from './sections/entities/section.entity';
import { SectionsModule } from './sections/sections.module';
import { BaselineConfigV2 } from './baseline/entities/baseline-config-v2.entity';
import { BaselineParticipation } from './baseline/entities/baseline-participation.entity';
import { PortfolioModule } from './portfolio/portfolio.module';
import { MemosModule } from './memos/memos.module';
import { AuditLog } from './audit-log/entities/audit-log.entity';
import { AuditLogModule } from './audit-log/audit-log.module';
import { AuditLogInterceptor } from './audit-log/audit-log.interceptor';
import { Teacher } from './substitution/entities/teacher.entity';
import { TimetablePeriod } from './substitution/entities/timetable-period.entity';
import { PermanentExceptionTeacher } from './substitution/entities/permanent-exception-teacher.entity';
import { DailyAbsenceRecord } from './substitution/entities/daily-absence-record.entity';
import { SubstitutionModule } from './substitution/substitution.module';
import { CalendarModule } from './calendar/calendar.module';
import { SowModule } from './sow/sow.module';
import { GradeSubjectsModule } from './grade-subjects/grade-subjects.module';
import { LessonPlansModule } from './lesson-plans/lesson-plans.module';
import { GradePriorMarksModule } from './grade-prior-marks/grade-prior-marks.module';
import { GradePriorMarks } from './grade-prior-marks/entities/grade-prior-marks.entity';
import { GradeSubjectGoal } from './grade-prior-marks/entities/grade-subject-goal.entity';
import { HrModule } from './hr/hr.module';
import { HrApplicant } from './hr/entities/hr-applicant.entity';
import { HrInterview } from './hr/entities/hr-interview.entity';
import { HrInductionVideo } from './hr/entities/hr-induction-video.entity';
import { HrInductionProgress } from './hr/entities/hr-induction-progress.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService): TypeOrmModuleOptions => {
        const databaseUrl = config.get<string>('DATABASE_URL');
        const entities = [
          Student, User, Assessment, CompetencyScore, AiOutput,
          CompetencyDefinition, TeacherAppraisal, CompetencyFramework,
          BaselineAssessment, LearningLink, Activity, ActivityAssessment,
          StudentCompetencyScore, TeacherObservation, ExamConfig, ExamMarks,
          TeacherMapping, HomeworkRecord, TeacherAssignment, Section, BaselineConfigV2, BaselineParticipation,
          AuditLog,
          Teacher, TimetablePeriod, PermanentExceptionTeacher, DailyAbsenceRecord,
          TeacherModuleStep, GradePriorMarks, GradeSubjectGoal,
          HrApplicant, HrInterview, HrInductionVideo, HrInductionProgress,
        ];
        const syncSchema = config.get<string>('TYPEORM_SYNC') === 'true';
        // Defaults to true everywhere (unchanged production behavior). Set
        // TYPEORM_MIGRATIONS_RUN=false only for bootstrapping a brand-new, empty
        // database locally with TYPEORM_SYNC=true — migrations run BEFORE
        // synchronize (see typeorm's DataSource.initialize()), and the oldest
        // migration here assumes the base schema already exists from a prior
        // synchronize:true era, so migrations alone cannot build a schema from
        // nothing. Never disable this against a real/shared database.
        const migrationsRun = config.get<string>('TYPEORM_MIGRATIONS_RUN') !== 'false';
        if (databaseUrl) {
          return {
            type: 'postgres',
            url: databaseUrl,
            ssl: { rejectUnauthorized: false },
            extra: { max: 40 },
            entities,
            synchronize: syncSchema,
            migrationsRun,
            migrations: [__dirname + '/migrations/*.js'],
            logging: false,
          };
        }
        return {
          type: 'postgres',
          host: config.get<string>('DB_HOST'),
          port: +(config.get<string>('DB_PORT') ?? 5432),
          username: config.get<string>('DB_USERNAME'),
          password: config.get<string>('DB_PASSWORD'),
          database: config.get<string>('DB_NAME'),
          entities,
          synchronize: syncSchema,
          migrationsRun,
          migrations: [__dirname + '/migrations/*.js'],
          logging: false,
        };
      },
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
    LearningModulesModule,
    ActivitiesModule,
    ObservationModule,
    PasaModule,
    MappingsModule,
    HomeworkModule,
    TeacherAssignmentsModule,
    SectionsModule,
    PortfolioModule,
    MemosModule,
    AuditLogModule,
    SubstitutionModule,
    CalendarModule,
    SowModule,
    GradeSubjectsModule,
    LessonPlansModule,
    GradePriorMarksModule,
    HrModule,
  ],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: AuditLogInterceptor },
  ],
})
export class AppModule {}