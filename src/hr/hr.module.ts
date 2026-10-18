import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HrApplicant } from './entities/hr-applicant.entity';
import { HrInterview } from './entities/hr-interview.entity';
import { HrInductionVideo } from './entities/hr-induction-video.entity';
import { HrInductionProgress } from './entities/hr-induction-progress.entity';
import { HrApplicantsService } from './hr-applicants.service';
import { HrApplicantsController } from './hr-applicants.controller';
import { HrInterviewsService } from './hr-interviews.service';
import { HrInterviewsController } from './hr-interviews.controller';
import { HrInductionService } from './hr-induction.service';
import { HrInductionController } from './hr-induction.controller';
import { HrResumeParserService } from './hr-resume-parser.service';
import { HrIntakeService } from './hr-intake.service';
import { HrIntakeController } from './hr-intake.controller';
import { HrAppointmentLetterService } from './hr-appointment-letter.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([HrApplicant, HrInterview, HrInductionVideo, HrInductionProgress]),
    UsersModule,
  ],
  controllers: [HrApplicantsController, HrInterviewsController, HrInductionController, HrIntakeController],
  providers: [HrApplicantsService, HrInterviewsService, HrInductionService, HrResumeParserService, HrIntakeService, HrAppointmentLetterService],
})
export class HrModule {}
