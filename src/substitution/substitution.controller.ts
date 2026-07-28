import { Controller, Get, Post, Delete, Body, Param, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SubstitutionService } from './substitution.service';

@Controller('substitution')
export class SubstitutionController {
  constructor(private readonly service: SubstitutionService) {}

  // POST /substitution/timetable/upload
  @Post('timetable/upload')
  @UseInterceptors(FileInterceptor('file'))
  uploadTimetable(@UploadedFile() file: Express.Multer.File) {
    return this.service.uploadTimetable(file.buffer, file.originalname);
  }

  // GET /substitution/timetable/status
  @Get('timetable/status')
  getTimetableStatus() {
    return this.service.getTimetableStatus();
  }

  // GET /substitution/debug?day=Fr  — shows what's actually stored per teacher for a given day
  @Get('debug')
  debugTimetable(@Query('day') day: string) {
    return this.service.debugTimetable(day ?? 'Fr');
  }

  // GET /substitution/timetable/teacher?teacher_id=xxx
  @Get('timetable/teacher')
  getTimetableForTeacher(@Query('teacher_id') teacherId: string) {
    return this.service.getTimetableForTeacher(teacherId);
  }

  // GET /substitution/history/summary?from=&to=
  @Get('history/summary')
  getSubstitutionSummary(@Query('from') from: string, @Query('to') to: string) {
    return this.service.getSubstitutionSummary(from, to);
  }

  // GET /substitution/history/log?from=&to=&substitute_teacher_id=&date=
  @Get('history/log')
  getSubstitutionLog(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('substitute_teacher_id') substituteTeacherId?: string,
    @Query('date') date?: string,
  ) {
    return this.service.getSubstitutionLog(from, to, substituteTeacherId, date);
  }

  // GET /substitution/teachers
  @Get('teachers')
  getTeachers() {
    return this.service.getTeachers();
  }

  // GET /substitution/permanent-exceptions
  @Get('permanent-exceptions')
  getPermanentExceptions() {
    return this.service.getPermanentExceptions();
  }

  // POST /substitution/permanent-exceptions
  @Post('permanent-exceptions')
  addPermanentException(@Body() body: { teacher_id: string }) {
    return this.service.addPermanentException(body.teacher_id);
  }

  // DELETE /substitution/permanent-exceptions/:teacher_id
  @Delete('permanent-exceptions/:teacher_id')
  removePermanentException(@Param('teacher_id') teacher_id: string) {
    return this.service.removePermanentException(teacher_id);
  }

  // POST /substitution/manual-assign
  @Post('manual-assign')
  manualAssign(@Body() body: {
    date: string; day: string; period: number;
    absent_teacher_id: string; substitute_teacher_id: string;
  }) {
    return this.service.manualAssign(body);
  }

  // POST /substitution/allocate
  @Post('allocate')
  allocate(@Body() body: {
    day: string;
    date: string;
    absent_teacher_ids: string[];
    temp_unavailable_teacher_ids: string[];
    on_duty_teacher_ids?: string[];
  }) {
    return this.service.allocate(
      body.day,
      body.date,
      body.absent_teacher_ids || [],
      body.temp_unavailable_teacher_ids || [],
      body.on_duty_teacher_ids || [],
    );
  }

  // POST /substitution/validate
  @Post('validate')
  validate(@Body() body: {
    day: string;
    date: string;
    absent_teacher_ids: string[];
    temp_unavailable_teacher_ids: string[];
  }) {
    return this.service.validate(
      body.day,
      body.date,
      body.absent_teacher_ids || [],
      body.temp_unavailable_teacher_ids || [],
    );
  }
}
