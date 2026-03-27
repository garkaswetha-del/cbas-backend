import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { Student } from './entities/student.entity/student.entity';

@Injectable()
export class StudentsService {
  constructor(
    @InjectRepository(Student)
    private studentRepo: Repository<Student>,
  ) {}

  // Get all students with optional filters
  async findAll(filters?: {
    grade?: string;
    section?: string;
    search?: string;
  }) {
    const query = this.studentRepo.createQueryBuilder('student')
      .where('student.is_active = :active', { active: true });

    if (filters?.grade) {
      query.andWhere('student.current_class = :grade', { grade: filters.grade });
    }
    if (filters?.section) {
      query.andWhere('student.section = :section', { section: filters.section });
    }
    if (filters?.search) {
      query.andWhere('student.name ILIKE :search', { search: `%${filters.search}%` });
    }

    return query.orderBy('student.current_class', 'ASC')
      .addOrderBy('student.section', 'ASC')
      .addOrderBy('student.name', 'ASC')
      .getMany();
  }

  // Get single student
  async findOne(id: string) {
    const student = await this.studentRepo.findOne({ where: { id } });
    if (!student) throw new NotFoundException('Student not found');
    return student;
  }

  // Create single student
  async create(data: Partial<Student>) {
    const student = this.studentRepo.create(data);
    return this.studentRepo.save(student);
  }

  // Bulk import students
  async bulkImport(students: Partial<Student>[]) {
    const results = { success: 0, failed: 0, errors: [] as string[] };
    for (const s of students) {
      try {
        const existing = await this.studentRepo.findOne({
          where: { name: s.name, current_class: s.current_class, section: s.section }
        });
        if (!existing) {
          await this.studentRepo.save(this.studentRepo.create(s));
          results.success++;
        } else {
          results.failed++;
          results.errors.push(`${s.name} already exists`);
        }
      } catch (e) {
        results.failed++;
        results.errors.push(`${s.name}: ${e.message}`);
      }
    }
    return results;
  }

  // Update student
  async update(id: string, data: Partial<Student>) {
    await this.studentRepo.update(id, data);
    return this.findOne(id);
  }

  // Bulk update by name match (for when new Excel arrives)
  async bulkUpdate(students: Partial<Student>[]) {
    const results = { success: 0, failed: 0 };
    for (const s of students) {
      try {
        const existing = await this.studentRepo.findOne({
          where: { name: s.name, current_class: s.current_class }
        });
        if (existing) {
          await this.studentRepo.update(existing.id, s);
          results.success++;
        } else {
          results.failed++;
        }
      } catch {
        results.failed++;
      }
    }
    return results;
  }

  // Delete student (TC)
  async delete(id: string) {
    await this.studentRepo.update(id, { is_active: false });
    return { message: 'Student removed (TC)' };
  }

  // Permanently delete
  async deletePermanently(id: string) {
    await this.studentRepo.delete(id);
    return { message: 'Student permanently deleted' };
  }

  // Get stats
  async getStats() {
    const total = await this.studentRepo.count({ where: { is_active: true } });
    const byGrade = await this.studentRepo
      .createQueryBuilder('student')
      .select('student.current_class', 'grade')
      .addSelect('COUNT(*)', 'count')
      .where('student.is_active = :active', { active: true })
      .groupBy('student.current_class')
      .orderBy('student.current_class', 'ASC')
      .getRawMany();
    return { total, byGrade };
  }
}