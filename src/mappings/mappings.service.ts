import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TeacherMapping } from './entities/teacher-mapping.entity/teacher-mapping.entity';
import { User } from '../users/entities/user.entity/user.entity';
import { UserRole } from '../users/entities/user.entity/user.entity';

@Injectable()
export class MappingsService {
  constructor(
    @InjectRepository(TeacherMapping)
    private mappingRepo: Repository<TeacherMapping>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
  ) {}

  // Get all teachers with their mappings
  async getAllTeachersWithMappings(academic_year: string) {
    const teachers = await this.userRepo.find({
        where: { role: UserRole.TEACHER, is_active: true },
        order: { name: 'ASC' },
    });

    const mappings = await this.mappingRepo.find({
      where: { academic_year, is_active: true },
      order: { grade: 'ASC', section: 'ASC' },
    });

    return teachers.map(t => ({
      id: t.id,
      name: t.name,
      email: t.email,
      mappings: mappings.filter(m => m.teacher_id === t.id),
    }));
  }

  // Get mappings for a specific teacher
  async getTeacherMappings(teacher_id: string, academic_year: string) {
    return this.mappingRepo.find({
      where: { teacher_id, academic_year, is_active: true },
      order: { grade: 'ASC', section: 'ASC', subject: 'ASC' },
    });
  }

  // Save mappings for a teacher (replace all)
  async saveTeacherMappings(data: {
    teacher_id: string;
    teacher_name: string;
    teacher_email: string;
    academic_year: string;
    mappings: {
      grade: string;
      section: string;
      subject?: string;
      is_class_teacher: boolean;
    }[];
  }) {
    // Deactivate existing mappings for this teacher
    await this.mappingRepo.update(
      { teacher_id: data.teacher_id, academic_year: data.academic_year },
      { is_active: false },
    );

    // Create new mappings
    const results: TeacherMapping[] = [];
    for (const m of data.mappings) {
      const mapping = this.mappingRepo.create({
        teacher_id: data.teacher_id,
        teacher_name: data.teacher_name,
        teacher_email: data.teacher_email,
        academic_year: data.academic_year,
        grade: m.grade,
        section: m.section,
        subject: m.subject || undefined,
        is_class_teacher: m.is_class_teacher,
        is_active: true,
      });
      results.push(await this.mappingRepo.save(mapping));
    }
    return results;
  }

  // Delete a single mapping
  async deleteMapping(id: string) {
    await this.mappingRepo.update(id, { is_active: false });
    return { success: true };
  }

  // Get class teacher for a section
  async getClassTeacher(grade: string, section: string, academic_year: string) {
    return this.mappingRepo.findOne({
      where: { grade, section, academic_year, is_class_teacher: true, is_active: true },
    });
  }

  // Get all sections a teacher is mapped to
  async getTeacherSections(teacher_id: string, academic_year: string) {
    const mappings = await this.mappingRepo.find({
      where: { teacher_id, academic_year, is_active: true },
    });
    const sections = [...new Set(mappings.map(m => `${m.grade}__${m.section}`))];
    return sections.map(s => {
      const [grade, section] = s.split('__');
      const isClassTeacher = mappings.some(m => m.grade === grade && m.section === section && m.is_class_teacher);
      const subjects = mappings.filter(m => m.grade === grade && m.section === section && m.subject).map(m => m.subject);
      return { grade, section, is_class_teacher: isClassTeacher, subjects };
    });
  }

  // Login — find user by email and password
  async login(email: string, password: string, academic_year: string) {
    const user = await this.userRepo.findOne({
      where: { email, is_active: true },
    });
    if (!user) return { success: false, message: 'User not found' };
    if (user.password_hash !== password) return { success: false, message: 'Invalid password' };

    const mappings = await this.getTeacherMappings(user.id, academic_year);
    const sections = await this.getTeacherSections(user.id, academic_year);

    return {
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      mappings,
      sections,
    };
  }

  // Get all mappings (for admin)
  async getAllMappings(academic_year: string) {
    return this.mappingRepo.find({
      where: { academic_year, is_active: true },
      order: { grade: 'ASC', section: 'ASC', teacher_name: 'ASC' },
    });
  }

  // Get structured mappings for Teacher Dashboard — reads from User entity
  async getTeacherDashboardMappings(teacher_id: string, academic_year: string) {
    const user = await this.userRepo.findOne({ where: { id: teacher_id } });
    if (!user) return { teacher_id, academic_year, is_class_teacher: false, class_grade: null, class_section: null, mappings: [] };

    const subjects: string[] = user.subjects || [];
    const classes: string[] = user.assigned_classes || [];
    const sections: string[] = user.assigned_sections || [];
    const classTeacherOf: string = user.class_teacher_of || '';

    // Parse class_teacher_of e.g. "Grade 5 Kaveri" → grade="Grade 5", section="Kaveri"
    let class_grade: string | null = null;
    let class_section: string | null = null;
    if (classTeacherOf) {
      // Try to extract last word as section, rest as grade
      const parts = classTeacherOf.trim().split(' ');
      if (parts.length >= 2) {
        class_section = parts[parts.length - 1];
        // Find matching grade from assigned_classes
        class_grade = classes.find(c => classTeacherOf.toLowerCase().includes(c.toLowerCase())) || parts.slice(0, -1).join(' ');
      }
    }

    // Build mappings: every combination of class × section × subject
    const mappings: any[] = [];
    const seen = new Set<string>();

    if (classes.length && sections.length) {
      for (const grade of classes) {
        for (const section of sections) {
          if (subjects.length) {
            for (const subject of subjects) {
              const key = `${grade}||${section}||${subject}`;
              if (!seen.has(key)) {
                seen.add(key);
                mappings.push({
                  grade,
                  section,
                  subject,
                  is_class_teacher: !!(class_grade && class_section &&
                    grade.toLowerCase().includes(class_grade.toLowerCase().replace('grade', '').trim()) &&
                    section === class_section),
                });
              }
            }
          } else {
            // No subjects — still show the grade/section combo
            const key = `${grade}||${section}||`;
            if (!seen.has(key)) {
              seen.add(key);
              mappings.push({ grade, section, subject: null, is_class_teacher: false });
            }
          }
        }
      }
    }

    return {
      teacher_id,
      academic_year,
      is_class_teacher: !!classTeacherOf,
      class_grade,
      class_section,
      mappings,
    };
  }
}