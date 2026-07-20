import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { SowService } from './sow.service';

@Controller('sow')
export class SowController {
  constructor(private readonly service: SowService) {}

  @Get('all')
  getAllSOW(@Query('academic_year') academic_year: string) {
    return this.service.getAllSOW(academic_year);
  }

  @Get()
  getSOW(
    @Query('teacher_id') teacher_id: string,
    @Query('academic_year') academic_year: string,
    @Query('grade') grade: string,
    @Query('section') section: string,
    @Query('subject') subject: string,
  ) {
    return this.service.getSOW(teacher_id, academic_year, grade, section, subject);
  }

  @Post('block/save')
  saveBlock(@Body() body: { id: string; block_name: string }) {
    return this.service.saveBlock(body.id, body.block_name);
  }

  @Post('lp/save')
  saveLp(@Body() body: { id: string; lp_name: string }) {
    return this.service.saveLp(body.id, body.lp_name);
  }

  @Post('block/add')
  addBlock(@Body() body: { teacher_id: string; academic_year: string; grade: string; section: string; subject: string }) {
    return this.service.addBlock(body.teacher_id, body.academic_year, body.grade, body.section, body.subject);
  }

  @Delete('block/:id')
  deleteBlock(@Param('id') id: string) {
    return this.service.deleteBlock(id);
  }

  @Post('lp/add')
  addLp(@Body() body: { block_id: string }) {
    return this.service.addLp(body.block_id);
  }

  @Delete('lp/:id')
  deleteLp(@Param('id') id: string) {
    return this.service.deleteLp(id);
  }

  @Post('submit')
  submitSOW(@Body() body: { teacher_id: string; academic_year: string; grade: string; section: string; subject: string }) {
    return this.service.submitSOW(body.teacher_id, body.academic_year, body.grade, body.section, body.subject);
  }

  @Patch('review/:statusId')
  reviewSOW(
    @Param('statusId') statusId: string,
    @Body() body: { status: string; reviewed_by: string; block_comments?: { block_id: string; comment: string }[] },
  ) {
    return this.service.reviewSOW(statusId, body.status, body.reviewed_by, body.block_comments ?? []);
  }
}
