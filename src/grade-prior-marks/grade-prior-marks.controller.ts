import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { GradePriorMarksService } from './grade-prior-marks.service';

@Controller('grade-prior-marks')
export class GradePriorMarksController {
  constructor(private readonly service: GradePriorMarksService) {}

  // POST /grade-prior-marks/upload — admin/AHM Excel upload, one stage file at a time
  @Post('upload')
  upload(@Body() body: {
    academic_year: string;
    rows: { grade: string; subject: string; average_percentage: number }[];
    uploaded_by?: string;
  }) {
    return this.service.upload(body.rows || [], body.academic_year, body.uploaded_by);
  }

  // GET /grade-prior-marks?academic_year=2025-26 — admin/AHM view of what's on file
  @Get()
  listForYear(@Query('academic_year') academic_year: string) {
    return this.service.listForYear(academic_year);
  }

  // GET /grade-prior-marks/for-teacher/:teacher_id?academic_year=2026-27
  @Get('for-teacher/:teacher_id')
  forTeacher(@Param('teacher_id') teacher_id: string, @Query('academic_year') academic_year: string) {
    return this.service.forTeacher(teacher_id, academic_year);
  }
}
