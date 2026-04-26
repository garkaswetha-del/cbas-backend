import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HomeworkRecord } from './entities/homework-record.entity';
import { SectionsService } from '../sections/sections.service';

@Injectable()
export class HomeworkService {
  constructor(
    @InjectRepository(HomeworkRecord)
    private readonly homeworkRepo: Repository<HomeworkRecord>,
    private sectionsService: SectionsService,
  ) {}

  // Save a homework record
  async saveRecord(data: {
    teacher_id: string;
    teacher_name: string;
    grade: string;
    section: string;
    subject: string;
    academic_year: string;
    type: string;
    competency_id?: string;
    competency_name?: string;
    topic?: string;
    content_a?: string;
    content_m?: string;
    content_e?: string;
    content?: string;
    student_id?: string;
    student_name?: string;
  }) {
    const valid = await this.sectionsService.validate(data.grade, data.section, data.academic_year);
    if (!valid) throw new BadRequestException(`Section '${data.section}' does not exist for ${data.grade} in ${data.academic_year}`);
    const record = this.homeworkRepo.create(data);
    await this.homeworkRepo.save(record);
    return { success: true, record };
  }

  // Get all records for a teacher (current year)
  async getTeacherRecords(teacher_id: string, academic_year: string, subject?: string, type?: string) {
    const query = this.homeworkRepo.createQueryBuilder('h')
      .where('h.teacher_id = :teacher_id', { teacher_id })
      .andWhere('h.academic_year = :academic_year', { academic_year });
    if (subject) query.andWhere('h.subject = :subject', { subject });
    if (type) query.andWhere('h.type = :type', { type });
    query.orderBy('h.created_at', 'DESC');
    const records = await query.getMany();
    return { total: records.length, records };
  }

  // Get all records for a grade+section (for portfolio — all years)
  async getClassRecords(grade: string, section: string, subject?: string) {
    const query = this.homeworkRepo.createQueryBuilder('h')
      .where('h.grade = :grade', { grade })
      .andWhere('h.section = :section', { section });
    if (subject) query.andWhere('h.subject = :subject', { subject });
    query.orderBy('h.academic_year', 'ASC').addOrderBy('h.created_at', 'DESC');
    const records = await query.getMany();

    // Group by academic year
    const byYear: Record<string, any[]> = {};
    records.forEach(r => {
      if (!byYear[r.academic_year]) byYear[r.academic_year] = [];
      byYear[r.academic_year].push(r);
    });
    return { total: records.length, byYear };
  }

  // Get parent suggestions for a specific student (all years)
  async getStudentParentSuggestions(student_id: string, subject?: string) {
    const query = this.homeworkRepo.createQueryBuilder('h')
      .where('h.student_id = :student_id', { student_id })
      .andWhere('h.type = :type', { type: 'ParentSuggestion' });
    if (subject) query.andWhere('h.subject = :subject', { subject });
    query.orderBy('h.academic_year', 'ASC').addOrderBy('h.created_at', 'DESC');
    const records = await query.getMany();
    return { total: records.length, records };
  }

  // Delete a record
  async deleteRecord(id: string) {
    await this.homeworkRepo.delete(id);
    return { success: true };
  }
}
