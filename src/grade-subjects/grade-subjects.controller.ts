import { Controller, Get, Post, Delete, Body, Param } from '@nestjs/common';
import { GradeSubjectsService } from './grade-subjects.service';

@Controller('grade-subjects')
export class GradeSubjectsController {
  constructor(private readonly service: GradeSubjectsService) {}

  @Get()
  getAll() {
    return this.service.getAll();
  }

  @Get('list')
  getWithIds() {
    return this.service.getWithIds();
  }

  @Post()
  add(@Body() body: { grade: string; subject: string }) {
    return this.service.add(body.grade, body.subject);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
