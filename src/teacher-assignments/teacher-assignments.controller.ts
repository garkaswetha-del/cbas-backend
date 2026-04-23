import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { TeacherAssignmentsService } from './teacher-assignments.service';

@Controller('teacher-assignments')
export class TeacherAssignmentsController {
  constructor(private readonly service: TeacherAssignmentsService) {}

  // GET /teacher-assignments?academic_year=2025-26
  @Get()
  findByYear(@Query('academic_year') academic_year: string) {
    return this.service.findByYear(academic_year || '2025-26');
  }

  // GET /teacher-assignments/history/:teacher_id
  @Get('history/:teacher_id')
  findHistory(@Param('teacher_id') teacher_id: string) {
    return this.service.findByTeacher(teacher_id);
  }

  // POST /teacher-assignments — create or update
  @Post()
  upsert(@Body() body: {
    teacher_id: string;
    academic_year: string;
    subjects: string[];
    assigned_classes: string[];
  }) {
    return this.service.upsert(body.teacher_id, body.academic_year, body.subjects || [], body.assigned_classes || []);
  }
}
