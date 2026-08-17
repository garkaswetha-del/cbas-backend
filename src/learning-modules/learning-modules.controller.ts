import { Controller, Get, Post, Param, Query, Body } from '@nestjs/common';
import { LearningModulesService } from './learning-modules.service';

@Controller('learning-modules')
export class LearningModulesController {
  constructor(private readonly service: LearningModulesService) {}

  @Get('teacher/:id')
  getModules(
    @Param('id') id: string,
    @Query('academic_year') academic_year: string,
  ) {
    return this.service.getModules(id, academic_year || '2025_26');
  }

  @Post('teacher/:id/step')
  saveStep(
    @Param('id') id: string,
    @Body() body: {
      subject: string;
      stage: string;
      domain: string;
      academic_year: string;
      step_learn_done?: boolean;
      step_resources_done?: boolean;
      reflection_text?: string;
    },
  ) {
    return this.service.saveStep({ teacher_id: id, ...body });
  }

  @Get('teacher/:id/stage-summary')
  getStageSummary(
    @Param('id') id: string,
    @Query('academic_year') academic_year: string,
  ) {
    return this.service.getStageSummary(id, academic_year || '2025_26');
  }
}
