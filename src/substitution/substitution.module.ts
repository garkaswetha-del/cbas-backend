import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { Teacher } from './entities/teacher.entity';
import { TimetablePeriod } from './entities/timetable-period.entity';
import { PermanentExceptionTeacher } from './entities/permanent-exception-teacher.entity';
import { DailyAbsenceRecord } from './entities/daily-absence-record.entity';
import { SubstitutionLog } from './entities/substitution-log.entity';
import { SubstitutionService } from './substitution.service';
import { SubstitutionController } from './substitution.controller';
import { TimetableParserService } from './timetable-parser.service';
import { ValidationService } from './validation.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Teacher, TimetablePeriod, PermanentExceptionTeacher, DailyAbsenceRecord, SubstitutionLog]),
    HttpModule,
  ],
  controllers: [SubstitutionController],
  providers: [SubstitutionService, TimetableParserService, ValidationService],
  exports: [SubstitutionService],
})
export class SubstitutionModule {}
