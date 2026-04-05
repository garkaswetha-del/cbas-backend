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
      query.andWhere('LOWER(student.current_class) = LOWER(:grade)', { grade: filters.grade });
    }
    if (filters?.section) {
      query.andWhere('LOWER(student.section) = LOWER(:section)', { section: filters.section });
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

  // ── PROMOTION ────────────────────────────────────────────────
  // Grade order for promotion
  private readonly GRADE_ORDER = [
    'Pre-KG', 'LKG', 'UKG',
    'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5',
    'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10',
  ];

  private nextGrade(current: string): string | null {
    const idx = this.GRADE_ORDER.indexOf(current);
    if (idx === -1 || idx === this.GRADE_ORDER.length - 1) return null;
    return this.GRADE_ORDER[idx + 1];
  }

  // Preview: show what will happen when promoted
  async getPromotionPreview(grade: string, section: string) {
    const students = await this.studentRepo.find({
      where: { current_class: grade, section, is_active: true },
      order: { name: 'ASC' },
    });
    const next = this.nextGrade(grade);
    return {
      current_grade: grade,
      current_section: section,
      next_grade: next,
      student_count: students.length,
      students: students.map(s => ({
        id: s.id, name: s.name, admission_no: s.admission_no,
        current_class: s.current_class, current_section: s.section,
        promoted_to: next,
      })),
    };
  }

  // Execute promotion: move all students in a section to the next grade
  // new_section is required — class teacher assigns new section
  async promoteStudents(data: {
    grade: string;
    section: string;
    new_section: string;
    student_ids?: string[]; // if empty, promotes all in section
  }) {
    const next = this.nextGrade(data.grade);
    if (!next) return { error: `${data.grade} is the final grade. Cannot promote further.` };

    const query: any = { current_class: data.grade, section: data.section, is_active: true };
    const students = data.student_ids?.length
      ? await this.studentRepo.findByIds(data.student_ids)
      : await this.studentRepo.find({ where: query, order: { name: 'ASC' } });

    let promoted = 0;
    for (const student of students) {
      await this.studentRepo.update(student.id, {
        current_class: next,
        section: data.new_section,
      });
      promoted++;
    }

    return {
      success: true,
      promoted_count: promoted,
      from_grade: data.grade,
      from_section: data.section,
      to_grade: next,
      to_section: data.new_section,
      message: `${promoted} students promoted from ${data.grade} ${data.section} to ${next} ${data.new_section}`,
    };
  }

  // Get all sections for a grade (for promotion UI)
  async getSectionsForGrade(grade: string) {
    const students = await this.studentRepo.find({
      where: { current_class: grade, is_active: true },
    });
    const sections = [...new Set(students.map(s => s.section).filter(Boolean))].sort();
    return { grade, sections };
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