import { DataSource, DataSourceOptions } from 'typeorm';
import * as dotenv from 'dotenv';

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
import { ExamConfig } from './pasa/entities/exam-config.entity/exam-config.entity';
import { ExamMarks } from './pasa/entities/exam-marks.entity/exam-marks.entity';
import { TeacherMapping } from './mappings/entities/teacher-mapping.entity/teacher-mapping.entity';
import { HomeworkRecord } from './homework/entities/homework-record.entity';
import { TeacherAssignment } from './teacher-assignments/entities/teacher-assignment.entity';
import { Section } from './sections/entities/section.entity';
import { BaselineConfigV2 } from './baseline/entities/baseline-config-v2.entity';
import { BaselineParticipation } from './baseline/entities/baseline-participation.entity';

dotenv.config();

const entities = [
  Student, User, Assessment, CompetencyScore, AiOutput,
  CompetencyDefinition, TeacherAppraisal, CompetencyFramework,
  BaselineAssessment, LearningLink, Activity, ActivityAssessment,
  StudentCompetencyScore, TeacherObservation, ExamConfig, ExamMarks,
  TeacherMapping, HomeworkRecord, TeacherAssignment, Section,
  BaselineConfigV2, BaselineParticipation,
];

const migrations = ['src/migrations/*.ts'];

const databaseUrl = process.env.DATABASE_URL;

const options: DataSourceOptions = databaseUrl
  ? {
      type: 'postgres',
      url: databaseUrl,
      ssl: { rejectUnauthorized: false },
      entities,
      migrations,
      synchronize: false,
    }
  : {
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: +(process.env.DB_PORT ?? 5432),
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      entities,
      migrations,
      synchronize: false,
    };

export default new DataSource(options);
