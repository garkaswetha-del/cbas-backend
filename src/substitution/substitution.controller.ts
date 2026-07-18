import { Controller, Get, Post, Delete, Body, Param, UploadedFile, UseInterceptors } from '@nestjs/common';
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
