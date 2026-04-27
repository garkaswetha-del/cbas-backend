import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('stats')
  getStats() {
    return this.usersService.getStats();
  }

  @Get('inactive')
  findInactive() {
    return this.usersService.findInactive();
  }

  /** GET /users/me?email=teacher@school.com — returns fresh user profile from DB */
  @Get('me')
  getMe(@Query('email') email: string) {
    return this.usersService.getMe(email);
  }

  @Get()
  findAll(
    @Query('role') role?: string,
    @Query('subject') subject?: string,
    @Query('grade') grade?: string,
    @Query('qualification') qualification?: string,
  ) {
    return this.usersService.findAll({ role, subject, grade, qualification });
  }

  @Post('normalize-qualifications')
  normalizeQualifications() {
    return this.usersService.normalizeQualifications();
  }

  @Post('login')
  login(@Body() body: { email: string; password: string }) {
    return this.usersService.login(body.email, body.password);
  }

  @Post()
  create(@Body() body: any) {
    return this.usersService.create(body);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id/deactivate')
  deactivate(@Param('id') id: string) {
    return this.usersService.deactivate(id);
  }

  @Patch(':id/reactivate')
  reactivate(@Param('id') id: string) {
    return this.usersService.reactivate(id);
  }

  @Patch(':id/reset-password')
  resetPassword(@Param('id') id: string, @Body() body: { password: string }) {
    return this.usersService.resetPassword(id, body.password);
  }

  @Patch(':id/mark-shared')
  markShared(@Param('id') id: string) {
    return this.usersService.markShared(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.usersService.update(id, body);
  }

  @Delete(':id/permanent')
  deletePermanently(@Param('id') id: string) {
    return this.usersService.delete(id);
  }
}
