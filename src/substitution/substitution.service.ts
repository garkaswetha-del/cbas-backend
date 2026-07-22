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

  async allocate(
    day: string,
    date: string,
    absentTeacherIds: string[],
    tempUnavailableIds: string[],
  ) {
    const activePeriods = await this.periodRepo.find({
      where: { is_active: true },
      relations: ['teacher'],
    });

    const activeExceptions = await this.exceptionRepo.find({ where: { is_active: true } });
    const permanentExceptionIds = activeExceptions.map((e) => e.teacher_id);
    const excludedIds = new Set([...absentTeacherIds, ...permanentExceptionIds, ...tempUnavailableIds]);

    // Map: "teacherId:day:period" → period record (for fast free-slot lookup)
    const periodMap = new Map<string, TimetablePeriod>();
    for (const p of activePeriods) {
      periodMap.set(`${p.teacher_id}:${p.day}:${p.period}`, p);
    }

    // Build grade/class profiles per teacher (for matching quality scoring)
    const profiles = new Map<string, { grades: Set<number>; classes: Set<string> }>();
    for (const p of activePeriods) {
      if (p.period_type !== 'ACADEMIC') continue;
      if (!profiles.has(p.teacher_id)) profiles.set(p.teacher_id, { grades: new Set(), classes: new Set() });
      const prof = profiles.get(p.teacher_id)!;
      (p.grades ?? []).forEach((g) => prof.grades.add(Number(g)));
      (p.classes ?? []).forEach((c) => prof.classes.add(c));
    }

    const allTeacherIds = [...new Set(activePeriods.map((p) => p.teacher_id))];
    const candidateIds = allTeacherIds.filter((id) => !excludedIds.has(id));

    // Track how many substitute slots each candidate has been given today (load balance)
    const assignmentCount = new Map<string, number>();
    for (const id of candidateIds) assignmentCount.set(id, 0);

    const assignments: Array<{
      period: number;
      absent_teacher_id: string;
      absent_teacher_name: string;
      substitute_id: string | null;
      substitute_name: string | null;
      grades: number[];
      classes: string[];
      raw: string;
    }> = [];

    for (const absentId of absentTeacherIds) {
      const absentPeriods = activePeriods
        .filter((p) => p.teacher_id === absentId && p.day === (day as any) && p.raw !== 'FREE')
        .sort((a, b) => a.period - b.period);

      const absentTeacherName = activePeriods.find((p) => p.teacher_id === absentId)?.teacher?.name ?? absentId;

      for (const p of absentPeriods) {
        // Candidates who are FREE at this period
        const free = candidateIds.filter((cid) => {
          const cp = periodMap.get(`${cid}:${day}:${p.period}`);
          return cp && cp.raw === 'FREE';
        });

        if (free.length === 0) {
          assignments.push({
            period: p.period,
            absent_teacher_id: absentId,
            absent_teacher_name: absentTeacherName,
            substitute_id: null,
            substitute_name: null,
            grades: p.grades ?? [],
            classes: p.classes ?? [],
            raw: p.raw,
          });
          continue;
        }

        const periodGrades = new Set((p.grades ?? []).map(Number));
        const periodClasses = new Set(p.classes ?? []);

        // Score: grade match = 2, class match = 1, minus 0.1 per existing assignment (load balance)
        const scored = free.map((cid) => {
          const prof = profiles.get(cid) ?? { grades: new Set<number>(), classes: new Set<string>() };
          const gradeScore = [...periodGrades].some((g) => prof.grades.has(g)) ? 2 : 0;
          const classScore = [...periodClasses].some((c) => prof.classes.has(c)) ? 1 : 0;
          const loadPenalty = (assignmentCount.get(cid) ?? 0) * 0.1;
          return { cid, score: gradeScore + classScore - loadPenalty };
        });

        scored.sort((a, b) => b.score - a.score);
        const best = scored[0];

        assignmentCount.set(best.cid, (assignmentCount.get(best.cid) ?? 0) + 1);

        const subName = activePeriods.find((sp) => sp.teacher_id === best.cid)?.teacher?.name ?? best.cid;

        assignments.push({
          period: p.period,
          absent_teacher_id: absentId,
          absent_teacher_name: absentTeacherName,
          substitute_id: best.cid,
          substitute_name: subName,
          grades: p.grades ?? [],
          classes: p.classes ?? [],
          raw: p.raw,
        });
      }
    }

    assignments.sort((a, b) => a.period - b.period || a.absent_teacher_name.localeCompare(b.absent_teacher_name));

    const unresolved = assignments.filter((a) => !a.substitute_id);

    return { assignments, unresolved_count: unresolved.length };
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
