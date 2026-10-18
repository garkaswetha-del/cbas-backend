import { Controller, Get, Post, Patch, Body, Param } from '@nestjs/common';
import { HrInductionService } from './hr-induction.service';

@Controller('hr/induction')
export class HrInductionController {
  constructor(private readonly service: HrInductionService) {}

  @Get('videos')
  listVideos() {
    return this.service.listVideos();
  }

  @Post('videos')
  createVideo(@Body() body: any) {
    return this.service.createVideo(body);
  }

  @Patch('videos/:id')
  updateVideo(@Param('id') id: string, @Body() body: any) {
    return this.service.updateVideo(id, body);
  }

  // Admin/AHM oversight — everyone currently inducting
  @Get('overview')
  progressOverview() {
    return this.service.progressOverview();
  }

  // Candidate's own login — what they're assigned
  @Get('my/:user_id')
  myAssignments(@Param('user_id') user_id: string) {
    return this.service.myAssignments(user_id);
  }

  @Post('progress')
  reportProgress(@Body() body: { user_id: string; video_id: string; position: number }) {
    return this.service.reportProgress(body.user_id, body.video_id, body.position);
  }

  @Get('complete/:user_id')
  async isComplete(@Param('user_id') user_id: string) {
    return { complete: await this.service.isInductionComplete(user_id) };
  }

  @Patch('hire/:user_id')
  markHired(@Param('user_id') user_id: string) {
    return this.service.markHired(user_id);
  }
}
