import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TeacherAssignment } from './entities/teacher-assignment.entity';

@Injectable()
export class TeacherAssignmentsService {
  constructor(
    @InjectRepository(TeacherAssignment)
    private repo: Repository<TeacherAssignment>,
  ) {}

  // Get all assignments for a given academic year (with teacher info)
  async findByYear(academic_year: string) {
    return this.repo.find({
      where: { academic_year },
      relations: ['teacher'],
      order: { created_at: 'ASC' },
    });
  }

  // Get all assignments for a specific teacher (history across all years)
  async findByTeacher(teacher_id: string) {
    return this.repo.find({
      where: { teacher_id },
      order: { academic_year: 'DESC' },
    });
  }

  // Get one assignment for a teacher+year
  async findOne(teacher_id: string, academic_year: string) {
    return this.repo.findOne({ where: { teacher_id, academic_year } });
  }

  // Create or update assignment for a teacher+year
  async upsert(teacher_id: string, academic_year: string, subjects: string[], assigned_classes: string[]) {
    const existing = await this.findOne(teacher_id, academic_year);
    if (existing) {
      await this.repo.update(existing.id, { subjects, assigned_classes });
      return this.repo.findOne({ where: { id: existing.id } });
    }
    const created = this.repo.create({ teacher_id, academic_year, subjects, assigned_classes });
    return this.repo.save(created);
  }

  // Delete all assignments for a teacher (used when teacher is permanently deleted)
  async deleteByTeacher(teacher_id: string) {
    await this.repo.delete({ teacher_id });
  }
}
