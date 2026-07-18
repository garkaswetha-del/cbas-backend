import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Teacher } from './entities/teacher.entity';
import { TimetablePeriod } from './entities/timetable-period.entity';
import { PermanentExceptionTeacher } from './entities/permanent-exception-teacher.entity';
import { AbsenceStatus, DailyAbsenceRecord } from './entities/daily-absence-record.entity';
import { TimetableParserService } from './timetable-parser.service';
import { ValidationService, PeriodRecord, TeacherProfile } from './validation.service';

@Injectable()
export class SubstitutionService {
  constructor(
    @InjectRepository(Teacher) private teacherRepo: Repository<Teacher>,
    @InjectRepository(TimetablePeriod) private periodRepo: Repository<TimetablePeriod>,
    @InjectRepository(PermanentExceptionTeacher) private exceptionRepo: Repository<PermanentExceptionTeacher>,
    @InjectRepository(DailyAbsenceRecord) private absenceRepo: Repository<DailyAbsenceRecord>,
    private readonly parser: TimetableParserService,
    private readonly validation: ValidationService,
  ) {}

  // Upload + parse a timetable PDF, replacing the currently active batch
  async uploadTimetable(fileBuffer: Buffer, fileName: string) {
    const parsed = await this.parser.parse(fileBuffer, fileName);

    const teacherIdByName = new Map<string, string>();

    for (const name of parsed.teachers) {
      let teacher = await this.teacherRepo.findOne({ where: { name } });
      if (!teacher) {
        teacher = await this.teacherRepo.save(this.teacherRepo.create({ name }));
      }
      teacherIdByName.set(name, teacher.id);
    }

    await this.periodRepo.update({ is_active: true }, { is_active: false });

    const newPeriods = parsed.periods.map((p) =>
      this.periodRepo.create({
        teacher_id: teacherIdByName.get(p.teacher_name),
        day: p.day as TimetablePeriod['day'],
        period: p.period,
        raw: p.raw,
        period_type: p.type as TimetablePeriod['period_type'],
        grades: p.grades,
        classes: p.classes,
        is_active: true,
      }),
    );

    await this.periodRepo.save(newPeriods);

    return {
      teacherCount: parsed.teachers.length,
      periodCount: newPeriods.length,
      uploadedAt: new Date(),
    };
  }

  async getTimetableStatus() {
    const activeCount = await this.periodRepo.count({ where: { is_active: true } });

    if (activeCount === 0) {
      return { hasActiveTimetable: false, uploadedAt: null, teacherCount: 0, periodCount: 0 };
    }

    const latest = await this.periodRepo.findOne({
      where: { is_active: true },
      order: { created_at: 'DESC' },
    });

    const distinctTeachers = await this.periodRepo
      .createQueryBuilder('p')
      .select('DISTINCT p.teacher_id', 'teacher_id')
      .where('p.is_active = true')
      .getRawMany();

    return {
      hasActiveTimetable: true,
      uploadedAt: latest?.created_at ?? null,
      teacherCount: distinctTeachers.length,
      periodCount: activeCount,
    };
  }

  async getTeachers() {
    const distinct = await this.periodRepo
      .createQueryBuilder('p')
      .select('DISTINCT p.teacher_id', 'teacher_id')
      .where('p.is_active = true')
      .getRawMany();

    const teacherIds = distinct.map((row) => row.teacher_id);
    if (teacherIds.length === 0) return [];

    return this.teacherRepo
      .createQueryBuilder('t')
      .where('t.id IN (:...teacherIds)', { teacherIds })
      .orderBy('t.name', 'ASC')
      .getMany();
  }

  async getPermanentExceptions() {
    return this.exceptionRepo.find({
      where: { is_active: true },
      relations: ['teacher'],
    });
  }

  async addPermanentException(teacherId: string) {
    const existing = await this.exceptionRepo.findOne({ where: { teacher_id: teacherId } });

    if (existing) {
      await this.exceptionRepo.update(existing.id, { is_active: true });
      return this.exceptionRepo.findOne({ where: { id: existing.id } });
    }

    return this.exceptionRepo.save(this.exceptionRepo.create({ teacher_id: teacherId }));
  }

  async removePermanentException(teacherId: string) {
    await this.exceptionRepo.update({ teacher_id: teacherId }, { is_active: false });
  }

  async validate(
    day: string,
    date: string,
    absentTeacherIds: string[],
    tempUnavailableIds: string[],
  ) {
    await this.absenceRepo.delete({ date });

    const records = [
      ...absentTeacherIds.map((teacher_id) =>
        this.absenceRepo.create({ teacher_id, date, status: AbsenceStatus.ABSENT }),
      ),
      ...tempUnavailableIds.map((teacher_id) =>
        this.absenceRepo.create({ teacher_id, date, status: AbsenceStatus.TEMP_UNAVAILABLE }),
      ),
    ];

    if (records.length > 0) {
      await this.absenceRepo.save(records);
    }

    const activePeriods = await this.periodRepo.find({
      where: { is_active: true },
      relations: ['teacher'],
    });

    const periods: PeriodRecord[] = activePeriods.map((p) => ({
      teacherId: p.teacher_id,
      teacherName: p.teacher?.name ?? '',
      day: p.day,
      period: p.period,
      raw: p.raw,
      grades: p.grades ?? [],
      classes: p.classes ?? [],
    }));

    const profiles = new Map<string, TeacherProfile>();

    for (const p of activePeriods) {
      if (p.period_type !== 'ACADEMIC') continue;

      if (!profiles.has(p.teacher_id)) {
        profiles.set(p.teacher_id, { grades: new Set(), classes: new Set() });
      }

      const profile = profiles.get(p.teacher_id)!;
      (p.grades ?? []).forEach((g) => profile.grades.add(g));
      (p.classes ?? []).forEach((c) => profile.classes.add(c));
    }

    const activeExceptions = await this.exceptionRepo.find({ where: { is_active: true } });
    const permanentExceptionIds = activeExceptions.map((e) => e.teacher_id);

    const issues = this.validation.validateRuleInputs(
      periods,
      profiles,
      day,
      absentTeacherIds,
      permanentExceptionIds,
      tempUnavailableIds,
    );

    return { issues, hasBlockingErrors: this.validation.hasBlockingErrors(issues) };
  }
}
