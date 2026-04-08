import { Controller, Get, Post, Delete, Body, Param, Query } from '@nestjs/common';
import { HomeworkService } from './homework.service';

@Controller('homework')
export class HomeworkController {
  constructor(private readonly homeworkService: HomeworkService) {}

  // Save a homework record
  @Post('save')
  saveRecord(@Body() body: any) {
    return this.homeworkService.saveRecord(body);
  }

  // Get teacher's own records
  @Get('teacher/:teacher_id')
  getTeacherRecords(
    @Param('teacher_id') teacher_id: string,
    @Query('academic_year') academic_year: string,
    @Query('subject') subject: string,
    @Query('type') type: string,
  ) {
    return this.homeworkService.getTeacherRecords(teacher_id, academic_year || '2025-26', subject, type);
  }

  // Get all records for a class (for portfolio)
  @Get('class/:grade/:section')
  getClassRecords(
    @Param('grade') grade: string,
    @Param('section') section: string,
    @Query('subject') subject: string,
  ) {
    return this.homeworkService.getClassRecords(
      decodeURIComponent(grade),
      decodeURIComponent(section),
      subject,
    );
  }

  // Get parent suggestions for a student
  @Get('student/:student_id/suggestions')
  getStudentSuggestions(
    @Param('student_id') student_id: string,
    @Query('subject') subject: string,
  ) {
    return this.homeworkService.getStudentParentSuggestions(student_id, subject);
  }

  // Delete a record
  @Delete(':id')
  deleteRecord(@Param('id') id: string) {
    return this.homeworkService.deleteRecord(id);
  }
}
