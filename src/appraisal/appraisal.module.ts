import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppraisalController } from './appraisal.controller';
import { AppraisalService } from './appraisal.service';
import { TeacherAppraisal } from '../assessments/entities/teacher-appraisal.entity/teacher-appraisal.entity';
import { User } from '../users/entities/user.entity/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([TeacherAppraisal, User])],
  controllers: [AppraisalController],
  providers: [AppraisalService],
  exports: [AppraisalService],
})
export class AppraisalModule {}