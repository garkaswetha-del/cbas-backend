import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { BaselineService } from './baseline.service';

@Controller('baseline')
export class BaselineController {
  constructor(private readonly baselineService: BaselineService) {}

  @Post('section')
  saveSectionBaseline(@Body() body: any) {
    return this.baselineService.saveSectionBaseline(body);
  }

  @Get('section')
  getSectionBaseline(
    @Query('grade') grade: string,
    @Query('section') section: string,
    @Query('academic_year') academic_year: string,
    @Query('round') round: string,
  ) {
    return this.baselineService.getSectionBaseline(grade, section, academic_year || '2025-26', round || 'baseline_1');
  }

  @Get('dashboard/school')
  getSchoolDashboard(
    @Query('academic_year') academic_year: string,
    @Query('round') round: string,
  ) {
    return this.baselineService.getSchoolDashboard(academic_year || '2025-26', round || 'baseline_1');
  }

  @Get('dashboard/grade/:grade')
  getGradeDashboard(
    @Param('grade') grade: string,
    @Query('academic_year') academic_year: string,
    @Query('round') round: string,
  ) {
    return this.baselineService.getGradeDashboard(grade, academic_year || '2025-26', round || 'baseline_1');
  }

  @Get('student/:student_id')
  getStudentBaseline(
    @Param('student_id') student_id: string,
    @Query('academic_year') academic_year: string,
  ) {
    return this.baselineService.getStudentBaseline(student_id, academic_year || '2025-26');
  }

  @Get('teacher/:teacher_id')
  getTeacherBaseline(
    @Param('teacher_id') teacher_id: string,
    @Query('academic_year') academic_year: string,
  ) {
    return this.baselineService.getTeacherBaseline(teacher_id, academic_year || '2025-26');
  }

  @Post('teacher')
  saveTeacherBaseline(@Body() body: any) {
    return this.baselineService.saveTeacherBaseline(body);
  }

  @Get('dashboard/teachers')
  getTeacherDashboard(
    @Query('academic_year') academic_year: string,
    @Query('round') round: string,
  ) {
    return this.baselineService.getTeacherDashboard(academic_year || '2025-26', round || 'baseline_1');
  }

  @Get('alerts/students')
  getConsecutiveDeclineStudents(@Query('academic_year') academic_year: string) {
    return this.baselineService.getConsecutiveDeclineStudents(academic_year);
  }

  @Get('alerts/teachers')
  getConsecutiveDeclineTeachers(@Query('academic_year') academic_year: string) {
    return this.baselineService.getConsecutiveDeclineTeachers(academic_year);
  }

  // ── Multi-round endpoints (Teacher entry) ─────────────────────

  @Get('section/rounds')
  getSectionRounds(
    @Query('grade') grade: string,
    @Query('section') section: string,
    @Query('academic_year') academic_year: string,
  ) {
    return this.baselineService.getSectionRounds(grade, section, academic_year || '2025-26');
  }

  @Post('section/round')
  saveSectionRound(@Body() body: any) {
    return this.baselineService.saveSectionRound(body);
  }

  @Get('student/:student_id/portfolio')
  getStudentPortfolioBaseline(@Param('student_id') student_id: string) {
    return this.baselineService.getStudentPortfolioBaseline(student_id);
  }

  @Get('student/:student_id/rounds')
  getStudentRounds(
    @Param('student_id') student_id: string,
    @Query('academic_year') academic_year: string,
  ) {
    return this.baselineService.getStudentRounds(student_id, academic_year || '2025-26');
  }

  @Post('recalculate')
  recalculateAll() {
    return this.baselineService.recalculateAll();
  }
}