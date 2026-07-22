import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { SowService } from './sow.service';

@Controller('sow')
export class SowController {
  constructor(private readonly svc: SowService) {}

  // ── Curriculum ─────────────────────────────────────────────────────────────

  @Get('curriculum')
  getCurriculum(
    @Query('academic_year') ay: string,
    @Query('grade') grade: string,
    @Query('subject') subject: string,
  ) { return this.svc.getCurriculum(ay, grade, subject); }

  @Post('curriculum/block/save')
  saveCurriculumBlock(@Body() b: { id: string; block_name: string }) {
    return this.svc.saveCurriculumBlock(b.id, b.block_name);
  }

  @Post('curriculum/lp/save')
  saveCurriculumLp(@Body() b: { id: string; lp_name: string }) {
    return this.svc.saveCurriculumLp(b.id, b.lp_name);
  }

  @Post('curriculum/block/add')
  addCurriculumBlock(@Body() b: { academic_year: string; grade: string; subject: string; item_type?: string }) {
    return this.svc.addCurriculumBlock(b.academic_year, b.grade, b.subject, b.item_type);
  }

  @Delete('curriculum/block/:id')
  deleteCurriculumBlock(@Param('id') id: string) {
    return this.svc.deleteCurriculumBlock(id);
  }

  @Post('curriculum/lp/add')
  addCurriculumLp(@Body() b: { block_id: string; item_type?: string }) {
    return this.svc.addCurriculumLp(b.block_id, b.item_type);
  }

  @Delete('curriculum/lp/:id')
  deleteCurriculumLp(@Param('id') id: string) {
    return this.svc.deleteCurriculumLp(id);
  }

  @Post('curriculum/import')
  importCurriculum(@Body() body: {
    academic_year: string;
    rows: Array<{ grade: string; subject: string; type: string; number: number; name: string; parent: string }>;
  }) { return this.svc.importCurriculum(body.academic_year, body.rows); }

  // ── Schedule ───────────────────────────────────────────────────────────────

  @Get('schedule')
  getSchedule(
    @Query('teacher_id') tid: string,
    @Query('academic_year') ay: string,
    @Query('grade') grade: string,
    @Query('section') section: string,
    @Query('subject') subject: string,
    @Query('month') month: string,
  ) { return this.svc.getSchedule(tid, ay, grade, section, subject, month); }

  @Post('schedule/save')
  saveScheduleEntry(@Body() body: any) {
    return this.svc.saveScheduleEntry(body);
  }

  @Post('schedule/done')
  toggleDone(@Body() b: { id: string; done: boolean }) {
    return this.svc.toggleDone(b.id, b.done);
  }

  @Delete('schedule/:id')
  deleteScheduleEntry(@Param('id') id: string) {
    return this.svc.deleteScheduleEntry(id);
  }

  // ── Admin / AHM ────────────────────────────────────────────────────────────

  @Get('all')
  getAllSOW(@Query('academic_year') ay: string) {
    return this.svc.getAllSOW(ay);
  }

  @Get('teacher-schedule')
  getTeacherSchedule(
    @Query('teacher_id') tid: string,
    @Query('academic_year') ay: string,
    @Query('grade') grade: string,
    @Query('section') section: string,
    @Query('subject') subject: string,
  ) { return this.svc.getTeacherSchedule(tid, ay, grade, section, subject); }

  // ── Status ─────────────────────────────────────────────────────────────────

  @Post('submit')
  submitSOW(@Body() b: { teacher_id: string; academic_year: string; grade: string; section: string; subject: string }) {
    return this.svc.submitSOW(b.teacher_id, b.academic_year, b.grade, b.section, b.subject);
  }

  @Patch('review/:statusId')
  reviewSOW(@Param('statusId') sid: string, @Body() b: { status: string; reviewed_by: string }) {
    return this.svc.reviewSOW(sid, b.status, b.reviewed_by);
  }
}
