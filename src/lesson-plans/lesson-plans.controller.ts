import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { LessonPlansService } from './lesson-plans.service';

@Controller('lesson-plans')
export class LessonPlansController {
  constructor(private readonly svc: LessonPlansService) {}

  // ── Teaching Profile ──────────────────────────────────────────────────────

  @Get('profile/:teacher_id')
  getProfile(@Param('teacher_id') tid: string) {
    return this.svc.getProfile(tid);
  }

  @Post('profile/:teacher_id')
  saveProfile(@Param('teacher_id') tid: string, @Body() body: any) {
    return this.svc.saveProfile(tid, body);
  }

  // ── NCERT Library ─────────────────────────────────────────────────────────

  @Get('ncert/meta')
  getAllChapterMeta() {
    return this.svc.getAllChapterMeta();
  }

  @Get('ncert/chapters')
  getChapters(@Query('grade') grade: string, @Query('subject') subject: string) {
    return this.svc.getChapters(grade, subject);
  }

  @Post('ncert/upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadChapter(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: any,
  ) {
    const contentText = await this.svc.parsePdfBuffer(file.buffer);
    return this.svc.uploadChapter({
      grade: body.grade,
      subject: body.subject,
      chapter_number: parseInt(body.chapter_number, 10),
      chapter_name: body.chapter_name,
      content_text: contentText,
      uploaded_by: body.uploaded_by || '',
    });
  }

  @Delete('ncert/:id')
  deleteChapter(@Param('id') id: string) {
    return this.svc.deleteChapter(id);
  }

  // ── Lesson Plans ──────────────────────────────────────────────────────────

  @Get('all')
  getAllLessonPlans(
    @Query('academic_year') ay: string,
    @Query('grade') grade: string,
    @Query('status') status: string,
  ) {
    return this.svc.getAllLessonPlans(ay, grade, status);
  }

  @Get()
  getLessonPlans(
    @Query('teacher_id') tid: string,
    @Query('academic_year') ay: string,
  ) {
    return this.svc.getLessonPlans(tid, ay);
  }

  @Get(':id')
  getLessonPlan(@Param('id') id: string) {
    return this.svc.getLessonPlan(id);
  }

  @Post()
  createLessonPlan(@Body() body: any) {
    return this.svc.createLessonPlan(body);
  }

  @Patch(':id')
  updateLessonPlan(@Param('id') id: string, @Body() body: any) {
    return this.svc.updateLessonPlan(id, body);
  }

  @Post(':id/submit')
  submitLessonPlan(@Param('id') id: string) {
    return this.svc.submitLessonPlan(id);
  }

  @Delete(':id')
  deleteLessonPlan(@Param('id') id: string) {
    return this.svc.deleteLessonPlan(id);
  }

  // ── Comments ──────────────────────────────────────────────────────────────

  @Post(':id/comments')
  addComment(@Param('id') id: string, @Body() body: any) {
    return this.svc.addComment(id, body);
  }

  // ── AI Generation ─────────────────────────────────────────────────────────

  @Post('ai/generate')
  generateLessonPlan(@Body() body: any) {
    return this.svc.generateLessonPlan(body);
  }

  @Post('ai/suggest-lp-count')
  suggestLpCount(@Body() body: { grade: string; subject: string; chapter_name: string }) {
    return this.svc.suggestLpCount(body);
  }

  @Post('ai/generate-chapter')
  generateChapterPlans(@Body() body: any) {
    return this.svc.generateChapterPlans(body);
  }

  @Post(':id/generate-worksheet')
  generateWorksheet(@Param('id') id: string) {
    return this.svc.generateWorksheet(id);
  }

  @Post(':id/generate-homework')
  generateHomework(@Param('id') id: string) {
    return this.svc.generateHomework(id);
  }

  // ── Reflections ───────────────────────────────────────────────────────────

  @Post('reflections/save')
  saveReflection(@Body() body: any) {
    return this.svc.saveReflection(body);
  }

  @Get('reflections/all')
  getAllReflections(
    @Query('date_from') from: string,
    @Query('date_to') to: string,
  ) {
    return this.svc.getAllReflections(from, to);
  }

  @Get('reflections/:teacher_id')
  getReflections(
    @Param('teacher_id') tid: string,
    @Query('month') month: string,
  ) {
    return this.svc.getReflections(tid, month);
  }
}
