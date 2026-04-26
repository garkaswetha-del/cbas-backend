import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { SectionsService } from './sections.service';

@Controller('sections')
export class SectionsController {
  constructor(private readonly sectionsService: SectionsService) {}

  /** GET /sections?grade=Grade 5&academic_year=2025-26 */
  @Get()
  findAll(
    @Query('grade') grade?: string,
    @Query('academic_year') academic_year?: string,
  ) {
    return this.sectionsService.findAll(grade, academic_year);
  }

  /** GET /sections/map?academic_year=2025-26 — returns { grade -> name[] } */
  @Get('map')
  getMap(@Query('academic_year') academic_year?: string) {
    return this.sectionsService.getAllMap(academic_year);
  }

  /** GET /sections/counts?academic_year=2025-26 — includes student_count per section */
  @Get('counts')
  getCounts(@Query('academic_year') academic_year?: string) {
    return this.sectionsService.getStudentCounts(academic_year || '2025-26');
  }

  /** POST /sections/seed — one-time migration from students table */
  @Post('seed')
  seed(@Body() body: { academic_year: string }) {
    return this.sectionsService.seed(body.academic_year || '2025-26');
  }

  /** POST /sections/normalize — uppercase all section strings everywhere */
  @Post('normalize')
  normalizeAll() {
    return this.sectionsService.normalizeAll();
  }

  /** POST /sections */
  @Post()
  create(@Body() body: { grade: string; name: string; academic_year: string }) {
    return this.sectionsService.create(body.grade, body.name, body.academic_year || '2025-26');
  }

  /** GET /sections/:id */
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.sectionsService.findOne(id);
  }

  /** PATCH /sections/:id/rename */
  @Patch(':id/rename')
  rename(@Param('id') id: string, @Body() body: { name: string }) {
    return this.sectionsService.rename(id, body.name);
  }

  /** PATCH /sections/:id/deactivate */
  @Patch(':id/deactivate')
  deactivate(@Param('id') id: string) {
    return this.sectionsService.deactivate(id);
  }

  /** PATCH /sections/:id/reactivate */
  @Patch(':id/reactivate')
  reactivate(@Param('id') id: string) {
    return this.sectionsService.reactivate(id);
  }

  /** DELETE /sections/:id */
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.sectionsService.remove(id);
  }
}
