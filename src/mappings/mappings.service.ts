import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TeacherMapping } from './entities/teacher-mapping.entity/teacher-mapping.entity';
import { User } from '../users/entities/user.entity/user.entity';
import { UserRole } from '../users/entities/user.entity/user.entity';
import { Student } from '../students/entities/student.entity/student.entity';

@Injectable()
export class MappingsService {
  constructor(
    @InjectRepository(TeacherMapping)
    private mappingRepo: Repository<TeacherMapping>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(Student)
    private studentRepo: Repository<Student>,
  ) {}

  private normalizeGrade(g: string): string {
    if (!g) return '';
    const s = g.trim();
    const lower = s.toLowerCase();
    if (lower === 'pre-kg' || lower === 'prekg' || lower === 'pkg') return 'Pre-KG';
    if (lower === 'lkg') return 'LKG';
    if (lower === 'ukg') return 'UKG';
    if (lower.startsWith('grade ')) return 'Grade ' + s.replace(/grade\s*/i, '').trim();
    const gMatch = s.match(/^[Gg](\d+)$/);
    if (gMatch) return 'Grade ' + gMatch[1];
    if (/^\d+$/.test(s)) return 'Grade ' + s;
    return s;
  }

  private normalizeSection(s: string): string {
    if (!s) return '';
    return s.trim().replace(/^\d+[-]\s*/i, '').trim();
  }

  private parseClassTeacherOf(raw: string, classes: string[]): { grade: string | null; section: string | null } {
    if (!raw) return { grade: null, section: null };
    const s = raw.trim();
    if (['-', '--', '---', 'none', 'no', ''].includes(s.toLowerCase())) return { grade: null, section: null };
    const cleaned = s.replace(/[-]\s*/g, ' ').trim();
    const parts = cleaned.split(' ').filter(Boolean);
    if (parts.length === 1) {
      if (classes.length === 1) return { grade: classes[0], section: parts[0] };
      return { grade: null, section: parts[0] };
    }
    if (parts.length === 2) return { grade: this.normalizeGrade(parts[0]), section: parts[1] };
    if (parts.length >= 3) return { grade: this.normalizeGrade(parts.slice(0, 2).join(' ')), section: parts.slice(2).join(' ') };
    return { grade: null, section: null };
  }

  async getAllTeachersWithMappings(academic_year: string) {
    const teachers = await this.userRepo.find({ where: { role: UserRole.TEACHER, is_active: true }, order: { name: 'ASC' } });
    const mappings = await this.mappingRepo.find({ where: { academic_year, is_active: true } });
    return teachers.map(t => ({ teacher_id: t.id, teacher_name: t.name, mappings: mappings.filter(m => m.teacher_id === t.id) }));
  }

  async getTeacherMappings(teacher_id: string, academic_year: string) {
    return this.mappingRepo.find({ where: { teacher_id, academic_year, is_active: true } });
  }

  async saveTeacherMappings(data: any) {
    await this.mappingRepo.update({ teacher_id: data.teacher_id, academic_year: data.academic_year }, { is_active: false });
    for (const m of data.mappings) {
      await this.mappingRepo.save(this.mappingRepo.create({ teacher_id: data.teacher_id, academic_year: data.academic_year, grade: m.grade, section: m.section, subject: m.subject, is_class_teacher: m.is_class_teacher || false, is_active: true }));
    }
    return { success: true };
  }

  async getTeacherSections(teacher_id: string, academic_year: string) {
    const mappings = await this.getTeacherMappings(teacher_id, academic_year);
    const sections = [...new Set(mappings.map(m => m.grade + '__' + m.section))];
    return sections.map(s => { const [grade, section] = s.split('__'); return { grade, section, is_class_teacher: mappings.some(m => m.grade === grade && m.section === section && m.is_class_teacher), subjects: mappings.filter(m => m.grade === grade && m.section === section && m.subject).map(m => m.subject) }; });
  }

  async getTeacherDashboardMappings(teacher_id: string, academic_year: string) {
    const user = await this.userRepo.findOne({ where: { id: teacher_id } });
    if (!user) return { teacher_id, academic_year, is_class_teacher: false, class_grade: null, class_section: null, mappings: [] };
    const classes: string[] = [...new Set((user.assigned_classes || []).filter(Boolean).map(c => this.normalizeGrade(c)).filter(Boolean))];
    const rawSections: string[] = (user.assigned_sections || []).filter(Boolean);
    let allSections = false;
    let sections: string[] = [];
    for (const s of rawSections) {
      if (s.toLowerCase().includes('all')) { allSections = true; break; }
      sections.push(this.normalizeSection(s));
    }
    sections = [...new Set(sections.filter(Boolean))];
    const subjects: string[] = (user.subjects || []).filter(Boolean);
    const { grade: class_grade, section: class_section } = this.parseClassTeacherOf(user.class_teacher_of || '', classes);
    const studentRows: any[] = await this.studentRepo.query('SELECT DISTINCT current_class as grade, section FROM students WHERE is_active = true');
    const validCombos: { grade: string; section: string }[] = [];
    const seen = new Set<string>();
    for (const row of studentRows) {
      const dbGrade = (row.grade || '').trim();
      const dbSection = (row.section || '').trim();
      if (!dbGrade || !dbSection) continue;
      const teachesGrade = classes.some(c => c.toLowerCase() === this.normalizeGrade(dbGrade).toLowerCase());
      if (!teachesGrade) continue;
      const teachesSection = allSections || sections.some(s => s.toLowerCase() === dbSection.toLowerCase());
      if (!teachesSection) continue;
      const key = dbGrade + '||' + dbSection;
      if (!seen.has(key)) { seen.add(key); validCombos.push({ grade: dbGrade, section: dbSection }); }
    }
    validCombos.sort((a, b) => a.grade !== b.grade ? a.grade.localeCompare(b.grade) : a.section.localeCompare(b.section));
    const mappings: any[] = [];
    const seenM = new Set<string>();
    for (const { grade, section } of validCombos) {
      const isCT = !!(class_grade && class_section && grade.toLowerCase() === class_grade.toLowerCase() && section.toLowerCase() === class_section.toLowerCase());
      if (subjects.length) {
        for (const subject of subjects) {
          const key = grade + '||' + section + '||' + subject;
          if (!seenM.has(key)) { seenM.add(key); mappings.push({ grade, section, subject, is_class_teacher: isCT }); }
        }
      } else {
        const key = grade + '||' + section + '||';
        if (!seenM.has(key)) { seenM.add(key); mappings.push({ grade, section, subject: null, is_class_teacher: isCT }); }
      }
    }
    return { teacher_id, academic_year, is_class_teacher: !!(class_grade && class_section), class_grade, class_section, mappings };
  }

  async getAllMappings(academic_year: string) {
    return this.mappingRepo.find({ where: { academic_year, is_active: true } });
  }

  async getClassTeachers(academic_year: string) {
    return this.mappingRepo.find({ where: { academic_year, is_class_teacher: true, is_active: true } });
  }

  async getClassTeacher(grade: string, section: string, academic_year: string) {
    const mapping = await this.mappingRepo.findOne({ where: { grade, section, academic_year, is_class_teacher: true, is_active: true } });
    if (!mapping) return null;
    const teacher = await this.userRepo.findOne({ where: { id: mapping.teacher_id } });
    return { mapping, teacher };
  }

  async deleteMapping(id: string) {
    return this.mappingRepo.delete(id);
  }

  async login(email: string, password: string, academic_year: string) {
    const user = await this.userRepo.findOne({ where: { email } });
    if (!user || user.password !== password) return null;
    return user;
  }
}
