import { Controller, Get, Post, Patch, Body, Param, Query, UseInterceptors, UploadedFiles } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { HrApplicantsService } from './hr-applicants.service';

@Controller('hr/applicants')
export class HrApplicantsController {
  constructor(private readonly service: HrApplicantsService) {}

  @Get()
  findAll(@Query('stage') stage?: string, @Query('shortlisted') shortlisted?: string, @Query('search') search?: string) {
    return this.service.findAll({ stage, shortlisted, search });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  // AI-generated, NCF-aligned interview questions scoped to this candidate's subject + stage
  @Get(':id/interview-questions')
  getInterviewQuestions(@Param('id') id: string) {
    return this.service.getInterviewQuestions(id);
  }

  @Post()
  create(@Body() body: any) {
    return this.service.create(body);
  }

  @Post('bulk')
  bulkCreate(@Body() body: { rows: any[] }) {
    return this.service.bulkCreate(body.rows || []);
  }

  // The real intake path — one or more resume files (PDF/DOCX), parsed with Groq
  @Post('upload-resumes')
  @UseInterceptors(FilesInterceptor('files', 20))
  uploadResumes(@UploadedFiles() files: Express.Multer.File[]) {
    return this.service.uploadResumes(files || []);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.service.update(id, body);
  }

  @Patch(':id/shortlist')
  setShortlist(@Param('id') id: string, @Body() body: { is_shortlisted: boolean; shortlisted_by?: string; shortlist_notes?: string }) {
    return this.service.setShortlist(id, body.is_shortlisted, body.shortlisted_by, body.shortlist_notes);
  }
}
