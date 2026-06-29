import { Controller, Get, Post, Delete, Body, Param, Query } from '@nestjs/common';
import { MemosService } from './memos.service';

@Controller('memos')
export class MemosController {
  constructor(private memosService: MemosService) {}

  @Post()
  create(@Body() body: any) {
    return this.memosService.createMemo(body);
  }

  @Get()
  list(@Query('academic_year') academic_year?: string) {
    return this.memosService.listMemos(academic_year);
  }

  @Get('teacher')
  teacherMemos(
    @Query('teacher_id') teacher_id: string,
    @Query('academic_year') academic_year?: string,
  ) {
    return this.memosService.getTeacherMemos(teacher_id, academic_year);
  }

  @Post(':id/read')
  markRead(@Param('id') id: string, @Body() body: any) {
    return this.memosService.markRead(id, body.teacher_id, body.teacher_name);
  }

  @Get(':id/reads')
  getReads(@Param('id') id: string) {
    return this.memosService.getMemoReads(id);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.memosService.deleteMemo(id);
  }
}
