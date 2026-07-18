import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { CalendarService } from './calendar.service';

@Controller('calendar')
export class CalendarController {
  constructor(private readonly service: CalendarService) {}

  // ── Calendar events ──

  @Get()
  list(@Query('academic_year') academic_year: string) {
    return this.service.list(academic_year);
  }

  @Post()
  create(@Body() body: any) {
    return this.service.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  // ── Templates ──

  @Get('templates')
  listTemplates() {
    return this.service.listTemplates();
  }

  @Post('templates')
  createTemplate(@Body() body: any) {
    return this.service.createTemplate(body);
  }

  @Patch('templates/:id')
  updateTemplate(@Param('id') id: string, @Body() body: any) {
    return this.service.updateTemplate(id, body);
  }

  @Delete('templates/:id')
  removeTemplate(@Param('id') id: string) {
    return this.service.removeTemplate(id);
  }
}
