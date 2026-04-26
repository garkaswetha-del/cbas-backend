import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { ObservationService } from './observation.service';

@Controller('observation')
export class ObservationController {
  constructor(private readonly observationService: ObservationService) {}

  @Get('teachers')
  getTeachers() {
    return this.observationService.getTeachers();
  }

  @Post()
  createObservation(@Body() body: any) {
    return this.observationService.createObservation(body);
  }

  @Get()
  getObservations(@Query() query: any) {
    return this.observationService.getObservations(query);
  }

  @Get('dashboard')
  getDashboard(@Query('academic_year') academic_year: string) {
    return this.observationService.getDashboard(academic_year || '2025-26');
  }

  @Get('teacher/:name')
  getTeacherDetail(
    @Param('name') name: string,
    @Query('academic_year') academic_year: string,
  ) {
    return this.observationService.getTeacherDetail(
      decodeURIComponent(name), academic_year || '2025-26'
    );
  }

  @Get('shared')
  getSharedObservations(@Query('teacher_email') teacher_email: string) {
    return this.observationService.getSharedObservations(teacher_email);
  }

  @Get(':id')
  getObservationById(@Param('id') id: string) {
    return this.observationService.getObservationById(id);
  }

  @Put(':id')
  updateObservation(@Param('id') id: string, @Body() body: any) {
    return this.observationService.updateObservation(id, body);
  }

  @Patch(':id/share')
  shareObservation(@Param('id') id: string, @Body() body: { is_shared: boolean }) {
    return this.observationService.shareObservation(id, body.is_shared);
  }

  @Delete(':id')
  deleteObservation(@Param('id') id: string) {
    return this.observationService.deleteObservation(id);
  }
}