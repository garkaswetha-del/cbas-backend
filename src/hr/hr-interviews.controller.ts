import { Controller, Get, Post, Patch, Body, Param, Query } from '@nestjs/common';
import { HrInterviewsService } from './hr-interviews.service';

@Controller('hr/interviews')
export class HrInterviewsController {
  constructor(private readonly service: HrInterviewsService) {}

  @Get()
  findByDate(@Query('date') date?: string) {
    return this.service.findByDate(date);
  }

  @Get('counts-by-date')
  countsByDate() {
    return this.service.countsByDate();
  }

  @Get('applicant/:applicant_id')
  findByApplicant(@Param('applicant_id') applicant_id: string) {
    return this.service.findByApplicant(applicant_id);
  }

  @Post('schedule')
  schedule(@Body() body: { applicant_id: string; round: 'written' | 'oral' | 'demo'; interview_date: string; slot_time?: string; interviewer_name?: string; scheduled_by?: string }) {
    return this.service.schedule(body);
  }

  @Patch(':id/notified')
  markNotified(@Param('id') id: string, @Body() body: { round: 'written' | 'oral' | 'demo' }) {
    return this.service.markNotified(id, body.round);
  }

  @Patch(':id/attendance')
  markAttendance(@Param('id') id: string, @Body() body: { round: 'written' | 'oral' | 'demo'; attended: boolean }) {
    return this.service.markAttendance(id, body.round, body.attended);
  }

  @Patch(':id/proceed-anyway')
  setProceedAnyway(@Param('id') id: string, @Body() body: { round: 'written' | 'oral'; value: boolean }) {
    return this.service.setProceedAnyway(id, body.round, body.value);
  }

  @Patch(':id/scores')
  saveScores(@Param('id') id: string, @Body() body: any) {
    return this.service.saveScores(id, body);
  }

  @Patch(':id/decide')
  decide(@Param('id') id: string, @Body() body: { result: 'selected' | 'rejected' | 'hold'; email?: string }) {
    return this.service.decide(id, body.result, body.email);
  }
}
