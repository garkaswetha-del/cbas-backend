import { Controller, Get, Post, Put, Delete, Body, Param, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ActivitiesService } from './activities.service';

@Controller('activities')
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  // ── COMPETENCY MANAGEMENT ─────────────────────────────────────

  @Get('competencies')
  getCompetencies(@Query() query: any) {
    return this.activitiesService.getCompetencies(query);
  }

  @Get('competencies/stats')
  getCompetencyStats() {
    return this.activitiesService.getCompetencyStats();
  }

  @Post('competencies/import')
  @UseInterceptors(FileInterceptor('file'))
  importCompetencies(@UploadedFile() file: Express.Multer.File, @Body('subject') subject: string) {
    return this.activitiesService.importCompetenciesFromExcel(file.buffer, subject);
  }

  @Post('competencies')
  createCompetency(@Body() body: any) {
    return this.activitiesService.createCompetency(body);
  }

  @Get('competencies/:id')
  getCompetencyById(@Param('id') id: string) {
    return this.activitiesService.getCompetencyById(id);
  }

  @Put('competencies/:id')
  updateCompetency(@Param('id') id: string, @Body() body: any) {
    return this.activitiesService.updateCompetency(id, body);
  }

  @Delete('competencies/:id')
  deleteCompetency(@Param('id') id: string) {
    return this.activitiesService.deleteCompetency(id);
  }

  // ── ACTIVITY MANAGEMENT ───────────────────────────────────────

  @Post()
  createActivity(@Body() body: any) {
    return this.activitiesService.createActivity(body);
  }

  @Get()
  getActivities(@Query() query: any) {
    return this.activitiesService.getActivities(query);
  }

  @Get('subjects-for-grade/:grade')
  getSubjectsForGrade(@Param('grade') grade: string) {
    return this.activitiesService.getSubjectsForGrade(grade);
  }

  @Get(':id/marks')
  getMarksForActivity(
    @Param('id') id: string,
    @Query('academic_year') academic_year: string,
  ) {
    return this.activitiesService.getMarksForActivity(id, academic_year || '2025-26');
  }

  @Post(':id/marks')
  saveMarks(
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.activitiesService.saveMarks(id, body.academic_year || '2025-26', body.entries);
  }

  @Get(':id')
  getActivityById(@Param('id') id: string) {
    return this.activitiesService.getActivityById(id);
  }

  @Put(':id')
  updateActivity(@Param('id') id: string, @Body() body: any) {
    return this.activitiesService.updateActivity(id, body);
  }

  @Delete(':id')
  deleteActivity(@Param('id') id: string) {
    return this.activitiesService.deleteActivity(id);
  }

  // ── COVERAGE ─────────────────────────────────────────────────

  @Get('coverage/detail/:grade/:subject')
  getCoverageDetail(
    @Param('grade') grade: string,
    @Param('subject') subject: string,
    @Query('academic_year') academic_year: string,
  ) {
    return this.activitiesService.getCompetencyCoverageDetail(grade, subject, academic_year || '2025-26');
  }

  @Get('coverage/:grade/:subject')
  getCoverage(
    @Param('grade') grade: string,
    @Param('subject') subject: string,
    @Query('academic_year') academic_year: string,
  ) {
    return this.activitiesService.getCompetencyCoverage(grade, subject, academic_year || '2025-26');
  }

  // ── COMBINED MARKS TABLE ──────────────────────────────────────

  @Get('combined-marks/:grade/:section/:subject')
  getCombinedMarks(
    @Param('grade') grade: string,
    @Param('section') section: string,
    @Param('subject') subject: string,
    @Query('academic_year') academic_year: string,
  ) {
    return this.activitiesService.getCombinedMarks(grade, section, subject, academic_year || '2025-26');
  }

  // ── DASHBOARDS ───────────────────────────────────────────────

  @Get('dashboard/school')
  getSchoolDashboard(@Query('academic_year') academic_year: string) {
    return this.activitiesService.getSchoolDashboard(academic_year || '2025-26');
  }

  @Get('dashboard/grade/:grade')
  getGradeDashboard(
    @Param('grade') grade: string,
    @Query('academic_year') academic_year: string,
  ) {
    return this.activitiesService.getGradeDashboard(grade, academic_year || '2025-26');
  }

  @Get('dashboard/section/:grade/:section')
  getSectionDashboard(
    @Param('grade') grade: string,
    @Param('section') section: string,
    @Query('academic_year') academic_year: string,
  ) {
    return this.activitiesService.getSectionDashboard(grade, section, academic_year || '2025-26');
  }

  @Get('dashboard/student/:student_id')
  getStudentDashboard(
    @Param('student_id') student_id: string,
    @Query('academic_year') academic_year: string,
  ) {
    return this.activitiesService.getStudentDashboard(student_id, academic_year || '2025-26');
  }

  // ── ALERTS ───────────────────────────────────────────────────

  @Get('alerts/decline')
  getConsecutiveDecline(@Query('academic_year') academic_year: string) {
    return this.activitiesService.getConsecutiveDeclineStudents(academic_year || '2025-26');
  }
}