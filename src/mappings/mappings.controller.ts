import { Controller, Get, Post, Delete, Body, Param, Query } from '@nestjs/common';
import { MappingsService } from './mappings.service';

@Controller('mappings')
export class MappingsController {
  constructor(private readonly mappingsService: MappingsService) {}

  @Get('teachers')
  getAllTeachers(@Query('academic_year') ay: string) {
    return this.mappingsService.getAllTeachersWithMappings(ay);
  }

  @Get('teacher/:teacher_id')
  getTeacherMappings(
    @Param('teacher_id') id: string,
    @Query('academic_year') ay: string,
  ) {
    return this.mappingsService.getTeacherMappings(id, ay);
  }

  @Get('teacher/:teacher_id/dashboard')
  getTeacherDashboardMappings(
    @Param('teacher_id') id: string,
    @Query('academic_year') ay: string,
  ) {
    return this.mappingsService.getTeacherDashboardMappings(id, ay);
  }

  @Get('all')
  getAllMappings(@Query('academic_year') ay: string) {
    return this.mappingsService.getAllMappings(ay);
  }

  @Get('class-teacher')
  getClassTeacher(
    @Query('grade') grade: string,
    @Query('section') section: string,
    @Query('academic_year') ay: string,
  ) {
    return this.mappingsService.getClassTeacher(grade, section, ay);
  }

  @Get('teacher-sections/:teacher_id')
  getTeacherSections(
    @Param('teacher_id') id: string,
    @Query('academic_year') ay: string,
  ) {
    return this.mappingsService.getTeacherSections(id, ay);
  }

  @Post('save')
  saveMappings(@Body() body: any) {
    return this.mappingsService.saveTeacherMappings(body);
  }

  @Delete(':id')
  deleteMapping(@Param('id') id: string) {
    return this.mappingsService.deleteMapping(id);
  }

  @Post('login')
  login(@Body() body: { email: string; password: string; academic_year: string }) {
    return this.mappingsService.login(body.email, body.password, body.academic_year);
  }
}