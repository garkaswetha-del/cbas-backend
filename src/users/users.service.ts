import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from './entities/user.entity/user.entity';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
  ) {}

  async findAll(role?: string) {
    if (role) {
      return this.userRepo.find({
        where: { role: role as UserRole, is_active: true },
        order: { name: 'ASC' },
      });
    }
    return this.userRepo.find({ order: { name: 'ASC' } });
  }

  async findOne(id: string) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findByEmail(email: string) {
    return this.userRepo.findOne({ where: { email } });
  }

  async create(data: {
    name: string;
    email: string;
    password: string;
    role?: string;
    assigned_class?: string;
    assigned_section?: string;
    subjects?: string[];
    assigned_classes?: string[];
    assigned_sections?: string[];
    class_teacher_of?: string;
    photo?: string;
    phone?: string;
    qualification?: string;
    experience?: string;
  }) {
    const existing = await this.userRepo.findOne({ where: { email: data.email } });
    if (existing) throw new ConflictException('Email already exists');

    const password_hash = await bcrypt.hash(data.password, 10);
    const user = this.userRepo.create({
      name: data.name,
      email: data.email,
      password_hash,
      password: data.password,
      role: (data.role as UserRole) || UserRole.TEACHER,
      assigned_class: data.assigned_class,
      assigned_section: data.assigned_section,
      subjects: data.subjects || [],
      assigned_classes: data.assigned_classes || [],
      assigned_sections: data.assigned_sections || [],
      class_teacher_of: data.class_teacher_of,
      photo: data.photo,
      phone: data.phone,
      qualification: data.qualification,
      experience: data.experience,
    });
    const saved = await this.userRepo.save(user);
    const { password_hash: _, ...result } = saved;
    return result;
  }

  async update(id: string, data: any) {
    const user = await this.findOne(id);

    if (data.password && data.password.trim() !== '') {
      data.password_hash = await bcrypt.hash(data.password, 10);
    } else {
      delete data.password;
    }

    // Handle arrays — TypeORM simple-array needs clean arrays
    if (data.subjects && !Array.isArray(data.subjects)) data.subjects = [data.subjects];
    if (data.assigned_classes && !Array.isArray(data.assigned_classes)) data.assigned_classes = [data.assigned_classes];
    if (data.assigned_sections && !Array.isArray(data.assigned_sections)) data.assigned_sections = [data.assigned_sections];

    await this.userRepo.update(id, data);
    return this.findOne(id);
  }

  async deactivate(id: string) {
    await this.userRepo.update(id, { is_active: false });
    return { message: 'User deactivated' };
  }

  async delete(id: string) {
    await this.userRepo.delete(id);
    return { message: 'User deleted permanently' };
  }
}