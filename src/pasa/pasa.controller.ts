import { Controller, Get, Post, Delete, Body, Param, Query } from '@nestjs/common';
import { PasaService } from './pasa.service';

@Controller('pasa')
export class PasaController {
  constructor(private readonly pasaService: PasaService) {}

  // ── EXAM CONFIG ──────────────────────────────────────────────

  @Post('config')
  saveExamConfig(@Body() body: any) {
    return this.pasaService.saveExamConfig(body);
  }

  @Get('config')
  getExamConfigs(
    @Query('teacher_id') teacher_id: string,
    @Query('academic_year') academic_year: string,
  ) {
    return this.pasaService.getExamConfigs(teacher_id, academic_year || '2025-26');
  }

  @Get('config/entry')
  getExamConfigForEntry(
    @Query('grade') grade: string,
    @Query('section') section: string,
    @Query('subject') subject: string,
    @Query('exam_type') exam_type: string,
    @Query('academic_year') academic_year: string,
  ) {
    return this.pasaService.getExamConfigForEntry(grade, section, subject, exam_type, academic_year || '2025-26');
  }

  @Get('config/section')
  getAllConfigsForSection(
    @Query('grade') grade: string,
    @Query('section') section: string,
    @Query('academic_year') academic_year: string,
  ) {
    return this.pasaService.getAllConfigsForGradeSection(grade, section, academic_year || '2025-26');
  }

  @Get('config/:id')
  getExamConfigById(@Param('id') id: string) {
    return this.pasaService.getExamConfigById(id);
  }

  @Delete('config/:id')
  deleteExamConfig(@Param('id') id: string) {
    return this.pasaService.deleteExamConfig(id);
  }

  // ── MARKS ENTRY ──────────────────────────────────────────────

  @Post('marks')
  saveMarks(@Body() body: any) {
    return this.pasaService.saveMarks(body);
  }

  @Get('marks/entry')
  getMarksForEntry(
    @Query('exam_config_id') exam_config_id: string,
    @Query('grade') grade: string,
    @Query('section') section: string,
  ) {
    return this.pasaService.getMarksForEntry(exam_config_id, grade, section);
  }

  @Get('marks/table')
  getMarksTable(
    @Query('grade') grade: string,
    @Query('section') section: string,
    @Query('exam_type') exam_type: string,
    @Query('academic_year') academic_year: string,
    @Query('subject') subject: string,
  ) {
    return this.pasaService.getMarksTable(grade, section, exam_type, academic_year || '2025-26', subject);
  }

  // ── STUDENT REPORT ───────────────────────────────────────────

  @Get('student/:student_id/report')
  getStudentReport(
    @Param('student_id') student_id: string,
    @Query('academic_year') academic_year: string,
    @Query('exam_type') exam_type: string,
  ) {
    return this.pasaService.getStudentExamReport(student_id, academic_year || '2025-26', exam_type);
  }

  // ── DASHBOARDS ───────────────────────────────────────────────

  @Get('dashboard/school')
  getSchoolDashboard(
    @Query('academic_year') academic_year: string,
    @Query('exam_type') exam_type: string,
  ) {
    return this.pasaService.getSchoolDashboard(academic_year || '2025-26', exam_type);
  }

  @Get('dashboard/grade/:grade')
  getGradeDashboard(
    @Param('grade') grade: string,
    @Query('academic_year') academic_year: string,
    @Query('exam_type') exam_type: string,
  ) {
    return this.pasaService.getGradeDashboard(grade, academic_year || '2025-26', exam_type);
  }

  @Get('dashboard/section')
  getSectionDashboard(
    @Query('grade') grade: string,
    @Query('section') section: string,
    @Query('academic_year') academic_year: string,
    @Query('exam_type') exam_type: string,
  ) {
    return this.pasaService.getSectionDashboard(grade, section, academic_year || '2025-26', exam_type);
  }

  // ── ALERTS ───────────────────────────────────────────────────

  @Get('alerts/decline')
  getDeclineAlerts(
    @Query('academic_year') academic_year: string,
    @Query('grade') grade: string,
    @Query('section') section: string,
  ) {
    return this.pasaService.getConsecutiveDeclineAlerts(academic_year || '2025-26', grade, section);
  }

  // ── EXAM TYPES ───────────────────────────────────────────────

  @Get('exam-types')
  getExamTypes(
    @Query('academic_year') academic_year: string,
    @Query('grade') grade: string,
  ) {
    return this.pasaService.getExamTypes(academic_year || '2025-26', grade);
  }

  // ── PORTFOLIO ────────────────────────────────────────────────

  @Get('portfolio/student/:student_id')
  getStudentPortfolio(
    @Param('student_id') student_id: string,
    @Query('subjects') subjects: string,
  ) {
    const subjectList = subjects ? subjects.split(',').map(s => s.trim()) : [];
    return this.pasaService.getStudentPortfolioPasa(student_id, subjectList);
  }

  // ── STUDENT ANALYSIS ─────────────────────────────────────────

  @Get('student/:student_id/analysis')
  getStudentAnalysis(
    @Param('student_id') student_id: string,
    @Query('academic_year') academic_year: string,
  ) {
    return this.pasaService.getStudentAnalysis(student_id, academic_year || '2025-26');
  }

  // ── LONGITUDINAL TREND ───────────────────────────────────────

  @Get('dashboard/trend')
  getLongitudinalTrend(
    @Query('grade') grade: string,
    @Query('section') section: string,
    @Query('academic_year') academic_year: string,
  ) {
    return this.pasaService.getLongitudinalTrend(grade, section, academic_year || '2025-26');
  }

  // ── ADVANCING / RETRACTING ───────────────────────────────────

  @Get('dashboard/advancing')
  getAdvancingRetracting(
    @Query('grade') grade: string,
    @Query('section') section: string,
    @Query('academic_year') academic_year: string,
    @Query('exam1') exam1: string,
    @Query('exam2') exam2: string,
  ) {
    return this.pasaService.getAdvancingRetracting(grade, section, academic_year || '2025-26', exam1, exam2);
  }

  // ── CLEAR DATA (Admin only) ───────────────────────────────────

  @Delete('clear-all')
  clearAllData() {
    return this.pasaService.clearAllPasaData();
  }
}