import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { StudentsService } from './students.service';
import { AuditLogService } from '../audit-log/audit-log.service';

@Controller('students')
export class StudentsController {
  constructor(
    private readonly studentsService: StudentsService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Get()
  findAll(
    @Query('grade') grade?: string,
    @Query('section') section?: string,
    @Query('search') search?: string,
    @Query('include_inactive') include_inactive?: string,
    @Query('academic_year') academic_year?: string,
  ) {
    return this.studentsService.findAll({ grade, section, search, include_inactive: include_inactive === 'true', academic_year });
  }

  @Get('stats')
  getStats() {
    return this.studentsService.getStats();
  }

  @Get('tc-register')
  getTCRegister() {
    return this.studentsService.getTCRegister();
  }

  // GET all defined sections across all grades
  @Get('sections/all')
  getAllSections() {
    return this.studentsService.getAllSections();
  }

  // GET sections for a grade
  @Get('sections/:grade')
  getSectionsForGrade(@Param('grade') grade: string) {
    return this.studentsService.getSectionsForGrade(grade);
  }

  // POST add new section to a grade
  @Post('sections')
  addSection(@Body() body: { grade: string; section: string }) {
    return this.studentsService.addSection(body.grade, body.section);
  }

  // DELETE remove section from a grade
  @Delete('sections/:grade/:section')
  removeSection(@Param('grade') grade: string, @Param('section') section: string) {
    return this.studentsService.removeSection(grade, section);
  }

  // GET promotion preview
  @Get('promotion/preview')
  getPromotionPreview(
    @Query('grade') grade: string,
    @Query('section') section: string,
  ) {
    return this.studentsService.getPromotionPreview(grade, section);
  }

  // POST execute promotion
  @Post('promotion/execute')
  promoteStudents(@Body() body: {
    grade: string;
    section: string;
    new_section: string;
    student_ids?: string[];
  }) {
    return this.studentsService.promoteStudents(body);
  }

  // POST batch promotion — each student gets their own target section
  @Post('promotion/execute-batch')
  promoteStudentsBatch(@Body() body: {
    from_grade: string;
    assignments: { student_id: string; to_section: string }[];
  }) {
    return this.studentsService.promoteStudentsBatch(body);
  }

  // POST graduate Grade 10 students
  @Post('graduation/execute')
  graduateStudents(@Body() body: {
    grade: string;
    section: string;
    student_ids?: string[];
    graduation_year: string;
  }) {
    return this.studentsService.graduateStudents(body);
  }

  // GET alumni (graduated students)
  @Get('alumni')
  getAlumni(@Query('graduation_year') graduation_year?: string) {
    return this.studentsService.getAlumni(graduation_year);
  }

  @Get('parent-analytics')
  getParentAnalytics(
    @Query('grade') grade?: string,
    @Query('section') section?: string,
  ) {
    return this.studentsService.getParentAnalytics({ grade, section });
  }

  @Post('parent-bulk-update')
  bulkUpdateParentData(@Body() body: { records: any[] }) {
    return this.studentsService.bulkUpdateParentData(body.records);
  }

  @Post('bulk-import')
  async bulkImport(@Body() body: { students: any[]; importedBy?: string; academic_year?: string }) {
    const result = await this.studentsService.bulkImport(body.students, body.academic_year);
    this.auditLogService.log({
      user_name:     body.importedBy ?? 'Admin',
      action:        'STUDENT_IMPORT',
      resource_type: 'students',
      details: {
        created:      result.created,
        updated:      result.updated,
        errors_count: result.errors.length,
        errors:       result.errors.slice(0, 10),
      },
      result: result.errors.length > 0 ? 'partial' : 'success',
    });
    return result;
  }

  @Post('bulk-update')
  bulkUpdate(@Body() body: { students: any[] }) {
    return this.studentsService.bulkUpdate(body.students);
  }

  @Post()
  create(@Body() body: any) {
    return this.studentsService.create(body);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.studentsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.studentsService.update(id, body);
  }

  @Patch(':id/tc')
  issueTC(
    @Param('id') id: string,
    @Body() body: { tc_date: string; tc_reason?: string },
  ) {
    return this.studentsService.issueTC(id, body.tc_date, body.tc_reason);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.studentsService.delete(id);
  }

  @Post('admin-truncate-all')
  async adminTruncateAll() {
    return this.studentsService.truncateAllStudents();
  }

  @Delete(':id/permanent')
  deletePermanently(@Param('id') id: string) {
    return this.studentsService.deletePermanently(id);
  }
}