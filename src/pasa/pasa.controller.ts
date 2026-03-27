import { Controller, Get, Post, Body, Param, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PasaService } from './pasa.service';

@Controller('pasa')
export class PasaController {
  constructor(private readonly pasaService: PasaService) {}

  // ── CONFIG ──────────────────────────────────────────────────

  @Post('config')
  saveConfig(@Body() body: any) {
    return this.pasaService.saveExamConfig(body);
  }

  @Get('config')
  getConfig(
    @Query('academic_year') ay: string,
    @Query('exam_type') et: string,
    @Query('grade') grade: string,
  ) {
    return this.pasaService.getExamConfig(ay, et, grade);
  }

  @Get('exam-types')
  getExamTypes(
    @Query('academic_year') ay: string,
    @Query('grade') grade: string,
  ) {
    return this.pasaService.getExamTypes(ay, grade);
  }

  @Get('sections')
  getSections(
    @Query('academic_year') ay: string,
    @Query('grade') grade: string,
  ) {
    return this.pasaService.getSectionsForGrade(ay, grade);
  }

  @Get('subjects')
  getSubjects(
    @Query('academic_year') ay: string,
    @Query('exam_type') et: string,
    @Query('grade') grade: string,
  ) {
    return this.pasaService.getSubjectsForGradeExam(ay, et, grade);
  }

  // ── MARKS ───────────────────────────────────────────────────

  @Post('marks')
  saveMarks(@Body() body: any) {
    return this.pasaService.saveMarks(body);
  }

  @Get('marks/table')
  getMarksTable(
    @Query('academic_year') ay: string,
    @Query('exam_type') et: string,
    @Query('grade') grade: string,
    @Query('section') section: string,
  ) {
    return this.pasaService.getMarksTable(ay, et, grade, section);
  }

  // ── IMPORT ──────────────────────────────────────────────────

  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  importExcel(
    @UploadedFile() file: Express.Multer.File,
    @Body('academic_year') ay: string,
    @Body('exam_type') et: string,
  ) {
    return this.pasaService.importFromExcel(file.buffer, ay, et);
  }

  // ── ANALYSIS ────────────────────────────────────────────────

  @Get('analysis/section')
  getSectionAnalysis(
    @Query('academic_year') ay: string,
    @Query('exam_type') et: string,
    @Query('grade') grade: string,
    @Query('section') section: string,
  ) {
    return this.pasaService.getSectionAnalysis(ay, et, grade, section);
  }

  @Get('analysis/grade')
  getGradeAnalysis(
    @Query('academic_year') ay: string,
    @Query('exam_type') et: string,
    @Query('grade') grade: string,
  ) {
    return this.pasaService.getGradeAnalysis(ay, et, grade);
  }

  @Get('analysis/school')
  getSchoolAnalysis(
    @Query('academic_year') ay: string,
    @Query('exam_type') et: string,
  ) {
    return this.pasaService.getSchoolAnalysis(ay, et);
  }

  @Get('analysis/longitudinal')
  getLongitudinal(
    @Query('academic_year') ay: string,
    @Query('grade') grade: string,
    @Query('section') section: string,
  ) {
    return this.pasaService.getLongitudinalAnalysis(ay, grade, section);
  }

  @Get('analysis/student')
  getStudentAnalysis(
    @Query('academic_year') ay: string,
    @Query('student_name') student_name: string,
  ) {
    return this.pasaService.getStudentAnalysis(ay, decodeURIComponent(student_name));
  }

  @Get('search/students')
  searchStudents(
    @Query('academic_year') ay: string,
    @Query('q') q: string,
  ) {
    return this.pasaService.searchStudents(ay, q);
  }
@Get('alerts/decline')
  getConsecutiveDecline(@Query('academic_year') ay: string) {
    return this.pasaService.getConsecutiveDeclineStudents(ay || '2025-26');
  }
}