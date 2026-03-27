import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { StudentsService } from './students.service';

@Controller('students')
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  // GET all students with filters
  // Usage: GET /students?grade=Grade 9&section=HIMALAYA&search=ram
  @Get()
  findAll(
    @Query('grade') grade?: string,
    @Query('section') section?: string,
    @Query('search') search?: string,
  ) {
    return this.studentsService.findAll({ grade, section, search });
  }

  // GET stats
  // Usage: GET /students/stats
  @Get('stats')
  getStats() {
    return this.studentsService.getStats();
  }

  // GET single student
  // Usage: GET /students/:id
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.studentsService.findOne(id);
  }

  // POST create single student
  // Usage: POST /students
  @Post()
  create(@Body() body: any) {
    return this.studentsService.create(body);
  }

  // POST bulk import
  // Usage: POST /students/bulk-import
  @Post('bulk-import')
  bulkImport(@Body() body: { students: any[] }) {
    return this.studentsService.bulkImport(body.students);
  }

  // POST bulk update (for new Excel with more data)
  // Usage: POST /students/bulk-update
  @Post('bulk-update')
  bulkUpdate(@Body() body: { students: any[] }) {
    return this.studentsService.bulkUpdate(body.students);
  }

  // PATCH update student
  // Usage: PATCH /students/:id
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.studentsService.update(id, body);
  }

  // DELETE student (TC)
  // Usage: DELETE /students/:id
  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.studentsService.delete(id);
  }

  // DELETE permanently
  // Usage: DELETE /students/:id/permanent
  @Delete(':id/permanent')
  deletePermanently(@Param('id') id: string) {
    return this.studentsService.deletePermanently(id);
  }
}