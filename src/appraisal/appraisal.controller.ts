import { Controller, Get, Post, Patch, Body, Param, Query } from '@nestjs/common';
import { AppraisalService } from './appraisal.service';

@Controller('appraisal')
export class AppraisalController {
  constructor(private readonly appraisalService: AppraisalService) {}

  // GET all teachers appraisals for table view
  // Usage: GET /appraisal?academic_year=2025-26
  @Get()
  getAllAppraisals(@Query('academic_year') academic_year: string) {
    return this.appraisalService.getAllAppraisals(academic_year || '2025-26');
  }

  // GET single teacher appraisal
  // Usage: GET /appraisal/teacher/:teacher_id?academic_year=2025-26
  @Get('teacher/:teacher_id')
  getTeacherAppraisal(
    @Param('teacher_id') teacher_id: string,
    @Query('academic_year') academic_year: string,
  ) {
    return this.appraisalService.getTeacherAppraisal(teacher_id, academic_year || '2025-26');
  }

  // GET shared appraisal by id (for teacher to view their own)
  // Usage: GET /appraisal/shared/:id
  @Get('shared/:id')
  getSharedAppraisal(@Param('id') id: string) {
    return this.appraisalService.getSharedAppraisal(id);
  }

  // POST save or update appraisal for one teacher
  // Usage: POST /appraisal/:teacher_id
  @Post(':teacher_id')
  saveAppraisal(
    @Param('teacher_id') teacher_id: string,
    @Body() body: any,
  ) {
    return this.appraisalService.saveAppraisal(teacher_id, body);
  }

  // PATCH share appraisal with teacher
  // Usage: PATCH /appraisal/share/:id
  @Patch('share/:id')
  shareAppraisal(@Param('id') id: string) {
    return this.appraisalService.shareAppraisal(id);
  }
}