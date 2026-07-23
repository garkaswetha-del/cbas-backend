import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Teacher } from './entities/teacher.entity';
import { TimetablePeriod } from './entities/timetable-period.entity';
import { PermanentExceptionTeacher } from './entities/permanent-exception-teacher.entity';
import { AbsenceStatus, DailyAbsenceRecord } from './entities/daily-absence-record.entity';
import { SubstitutionLog } from './entities/substitution-log.entity';
import { TimetableParserService } from './timetable-parser.service';
import { ValidationService, PeriodRecord, TeacherProfile } from './validation.service';

@Injectable()
export class SubstitutionService implements OnModuleInit {
  constructor(
    @InjectRepository(Teacher) private teacherRepo: Repository<Teacher>,
    @InjectRepository(TimetablePeriod) private periodRepo: Repository<TimetablePeriod>,
    @InjectRepository(PermanentExceptionTeacher) private exceptionRepo: Repository<PermanentExceptionTeacher>,
    @InjectRepository(DailyAbsenceRecord) private absenceRepo: Repository<DailyAbsenceRecord>,
    @InjectRepository(SubstitutionLog) private logRepo: Repository<SubstitutionLog>,
    private readonly parser: TimetableParserService,
    private readonly validation: ValidationService,
  ) {}

  async onModuleInit() {
    // synchronize: false globally — create table manually so it exists before any query
    await this.logRepo.manager.query(`
      CREATE TABLE IF NOT EXISTS substitution_log (
        id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        substitute_teacher_id VARCHAR NOT NULL,
        absent_teacher_id     VARCHAR NOT NULL,
        date                  VARCHAR(10) NOT NULL,
        day                   VARCHAR(5)  NOT NULL,
        period                INTEGER     NOT NULL,
        grades                TEXT,
        classes               TEXT,
        created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await this.logRepo.manager.query(
      `CREATE INDEX IF NOT EXISTS idx_sub_log_date    ON substitution_log(date)`,
    );
    await this.logRepo.manager.query(
      `CREATE INDEX IF NOT EXISTS idx_sub_log_teacher ON substitution_log(substitute_teacher_id)`,
    );
  }

  // Minimum grade distance between a period's grades and a teacher's grade profile.
  // Returns 0 if same grade, 1 if one grade apart, etc. 999 if either set is empty.
  private minGradeDistance(periodGrades: Set<number>, teacherGrades: Set<number>): number {
    if (periodGrades.size === 0 || teacherGrades.size === 0) return 999;
    let min = Infinity;
    for (const pg of periodGrades) {
      for (const tg of teacherGrades) {
        const d = Math.abs(pg - tg);
        if (d < min) min = d;
      }
    }
    return min;
  }

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

    // ── Hard constraint setup ─────────────────────────────────────────────────
    const activeExceptions = await this.exceptionRepo.find({ where: { is_active: true } });
    const permanentExceptionIds = activeExceptions.map((e) => e.teacher_id);
    // Rules 2, 3, 4 — excluded from candidacy entirely
    const excludedIds = new Set([...absentTeacherIds, ...permanentExceptionIds, ...tempUnavailableIds]);

    // Rule 1 — fast free-slot lookup: "teacherId:day:period" → period record
    const periodMap = new Map<string, TimetablePeriod>();
    for (const p of activePeriods) {
      periodMap.set(`${p.teacher_id}:${p.day}:${p.period}`, p);
    }

    // ── Grade/class profiles (rules 5 & 6) ───────────────────────────────────
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

    // ── Rule 7 — load balancing: term history (last 90 days) ─────────────────
    const termStart = new Date();
    termStart.setDate(termStart.getDate() - 90);
    const termStartStr = termStart.toISOString().slice(0, 10);
    const historyCounts: { tid: string; cnt: string }[] = await this.logRepo.manager.query(
      `SELECT substitute_teacher_id AS tid, COUNT(*)::text AS cnt
       FROM substitution_log WHERE date >= $1
       GROUP BY substitute_teacher_id`,
      [termStartStr],
    );
    const historyMap = new Map<string, number>(
      historyCounts.map((r) => [r.tid, parseInt(r.cnt, 10)]),
    );

    // ── Rules 8 & 9 — today's existing log (for consecutive + concentration) ──
    const todayLog: { substitute_teacher_id: string; period: number }[] =
      await this.logRepo.manager.query(
        `SELECT substitute_teacher_id, period FROM substitution_log WHERE date = $1`,
        [date],
      );
    // teacher_id → set of periods already assigned today (from previous runs)
    const todayLogPeriods = new Map<string, Set<number>>();
    for (const log of todayLog) {
      if (!todayLogPeriods.has(log.substitute_teacher_id)) {
        todayLogPeriods.set(log.substitute_teacher_id, new Set());
      }
      todayLogPeriods.get(log.substitute_teacher_id)!.add(log.period);
    }

    // teacher_id → set of periods assigned in THIS run (built up as we go)
    const runPeriods = new Map<string, Set<number>>();

    // ── Allocation loop ───────────────────────────────────────────────────────
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

      const absentTeacherName =
        activePeriods.find((p) => p.teacher_id === absentId)?.teacher?.name ?? absentId;

      for (const p of absentPeriods) {
        // Rule 1: must be free at this (day, period)
        const free = candidateIds.filter((cid) => {
          const cp = periodMap.get(`${cid}:${day}:${p.period}`);
          return cp && cp.raw === 'FREE';
        });

        if (free.length === 0) {
          assignments.push({
            period: p.period, absent_teacher_id: absentId,
            absent_teacher_name: absentTeacherName,
            substitute_id: null, substitute_name: null,
            grades: p.grades ?? [], classes: p.classes ?? [], raw: p.raw,
          });
          continue;
        }

        const periodGrades = new Set((p.grades ?? []).map(Number));
        const periodClasses = new Set(p.classes ?? []);

        const scored = free.map((cid) => {
          const prof = profiles.get(cid) ?? { grades: new Set<number>(), classes: new Set<string>() };

          // Rules 5 & 6: grade proximity score (0 = 4+ grades away, up to 2 = same grade)
          const dist = this.minGradeDistance(periodGrades, prof.grades);
          const gradeScore = periodGrades.size > 0 ? Math.max(0, 2 - dist * 0.5) : 0;

          // Class match bonus
          const classScore = [...periodClasses].some((c) => prof.classes.has(c)) ? 1 : 0;

          // Rule 7: term history penalty (−0.05 per past substitution this term)
          const historyPenalty = (historyMap.get(cid) ?? 0) * 0.05;

          // All periods this teacher is doing today (log + current run)
          const allTodayPeriods = new Set([
            ...(todayLogPeriods.get(cid) ?? new Set()),
            ...(runPeriods.get(cid) ?? new Set()),
          ]);

          // Rule 9: today concentration penalty (−0.3 per assignment already today)
          const concentrationPenalty = allTodayPeriods.size * 0.3;

          // Rule 8: consecutive period penalty (−0.5 if adjacent period already assigned)
          const consecutivePenalty =
            allTodayPeriods.has(p.period - 1) || allTodayPeriods.has(p.period + 1) ? 0.5 : 0;

          return {
            cid,
            score: gradeScore + classScore - historyPenalty - concentrationPenalty - consecutivePenalty,
          };
        });

        scored.sort((a, b) => b.score - a.score);
        const best = scored[0];

        // Track this assignment for Rules 8 & 9 in subsequent periods
        if (!runPeriods.has(best.cid)) runPeriods.set(best.cid, new Set());
        runPeriods.get(best.cid)!.add(p.period);

        const subName =
          activePeriods.find((sp) => sp.teacher_id === best.cid)?.teacher?.name ?? best.cid;

        assignments.push({
          period: p.period, absent_teacher_id: absentId,
          absent_teacher_name: absentTeacherName,
          substitute_id: best.cid, substitute_name: subName,
          grades: p.grades ?? [], classes: p.classes ?? [], raw: p.raw,
        });
      }
    }

    assignments.sort(
      (a, b) => a.period - b.period || a.absent_teacher_name.localeCompare(b.absent_teacher_name),
    );

    // ── Persist to substitution_log (replace today's entries for these absences) ──
    for (const absentId of absentTeacherIds) {
      await this.logRepo.manager.query(
        `DELETE FROM substitution_log WHERE date = $1 AND absent_teacher_id = $2`,
        [date, absentId],
      );
    }
    for (const a of assignments.filter((x) => x.substitute_id !== null)) {
      await this.logRepo.manager.query(
        `INSERT INTO substitution_log
           (substitute_teacher_id, absent_teacher_id, date, day, period, grades, classes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          a.substitute_id,
          a.absent_teacher_id,
          date,
          day,
          a.period,
          a.grades.length > 0 ? a.grades.join(',') : null,
          a.classes.length > 0 ? a.classes.join(',') : null,
        ],
      );
    }

    return { assignments, unresolved_count: assignments.filter((a) => !a.substitute_id).length };
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
