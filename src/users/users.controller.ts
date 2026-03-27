import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { UsersService } from './users.service';
import { UserRole } from './entities/user.entity/user.entity';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // GET all users — optional role filter
  // Usage: GET /users or GET /users?role=teacher
  @Get()
  findAll(@Query('role') role?: UserRole) {
    return this.usersService.findAll(role);
  }

  // GET single user
  // Usage: GET /users/:id
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  // POST create user
  // Usage: POST /users
  @Post()
  create(@Body() body: {
    name: string;
    email: string;
    password: string;
    role: UserRole;
    assigned_class?: string;
    assigned_section?: string;
  }) {
    return this.usersService.create(body);
  }

  // PATCH update user
  // Usage: PATCH /users/:id
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.usersService.update(id, body);
  }

  // DELETE permanently
// Usage: DELETE /users/:id/permanent
@Delete(':id/permanent')
deletePermanently(@Param('id') id: string) {
  return this.usersService.delete(id);
}
}