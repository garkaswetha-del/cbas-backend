import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { GradeSubjectGoalsService } from './grade-subject-goals.service';

@Controller('grade-subject-goals')
export class GradeSubjectGoalsController {
  constructor(private readonly service: GradeSubjectGoalsService) {}

  // POST /grade-subject-goals — teacher saves one goal (this year's or next year's)
  @Post()
  upsertGoal(@Body() body: { academic_year: string; grade: string; subject: string; goal_percentage: number; set_by?: string }) {
    return this.service.upsertGoal(body.academic_year, body.grade, body.subject, body.goal_percentage, body.set_by);
  }

  // GET /grade-subject-goals/for-teacher/:teacher_id?academic_year=2026-27
  @Get('for-teacher/:teacher_id')
  forTeacher(@Param('teacher_id') teacher_id: string, @Query('academic_year') academic_year: string) {
    return this.service.forTeacher(teacher_id, academic_year);
  }

  // GET /grade-subject-goals/summary?academic_year=2026-27&grades=Grade 1,Grade 2
  // Cumulative view — admin omits `grades` (sees everything), AHM passes their stage's grades.
  @Get('summary')
  summary(@Query('academic_year') academic_year: string, @Query('grades') grades?: string) {
    const gradeList = grades ? grades.split(',').map(g => g.trim()).filter(Boolean) : undefined;
    return this.service.summary(academic_year, gradeList);
  }
}
