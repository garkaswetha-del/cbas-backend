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

    // ── Grade/class profiles — built from ALL period types, not just ACADEMIC ──
    // (if the parser stores teaching periods as CCA or another type, we still
    //  want those grades to count toward stage membership)
    const profiles = new Map<string, { grades: Set<number>; classes: Set<string> }>();
    for (const p of activePeriods) {
      if (p.raw === 'FREE') continue; // free slots carry no grade info
      if (!profiles.has(p.teacher_id)) profiles.set(p.teacher_id, { grades: new Set(), classes: new Set() });
      const prof = profiles.get(p.teacher_id)!;
      (p.grades ?? []).forEach((g) => prof.grades.add(Number(g)));
      (p.classes ?? []).forEach((c) => prof.classes.add(c));
    }

    const allTeacherIds = [...new Set(activePeriods.map((p) => p.teacher_id))];
    const candidateIds = allTeacherIds.filter((id) => !excludedIds.has(id));

    // Which teachers have at least one record on this day (guards against marking
    // a teacher free on a day they don't work at all)
    const teachersOnThisDay = new Set<string>(
      activePeriods.filter((p) => p.day === (day as any)).map((p) => p.teacher_id),
    );

    // ── Stage definitions ─────────────────────────────────────────────────────
    const STAGE_MAP: Record<string, Set<number>> = {
      Preparatory: new Set([3, 4, 5]),
      Middle:      new Set([6, 7, 8]),
      Secondary:   new Set([9, 10]),
    };

    // Which stage does a set of period grades belong to? (first match wins)
    const getStage = (grades: Set<number>): string | null => {
      for (const [name, gradeSet] of Object.entries(STAGE_MAP)) {
        for (const g of grades) { if (gradeSet.has(g)) return name; }
      }
      return null;
    };

    // Does a teacher's profile overlap with the given stage?
    const teacherInStage = (tid: string, stageName: string): boolean => {
      const prof = profiles.get(tid);
      if (!prof) return false;
      const stageGrades = STAGE_MAP[stageName];
      if (!stageGrades) return false;
      for (const g of prof.grades) { if (stageGrades.has(g)) return true; }
      return false;
    };

    // ── Fair-distribution history (last 7 days) ───────────────────────────────
    const termStart = new Date();
    termStart.setDate(termStart.getDate() - 7);
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

    // ── Max-periods cap (Rule 10) ─────────────────────────────────────────────
    const MAX_DAILY_PERIODS = 7;
    const regularPeriodsOnDay = new Map<string, number>();
    for (const tid of allTeacherIds) {
      regularPeriodsOnDay.set(
        tid,
        activePeriods.filter((sp) => sp.teacher_id === tid && sp.day === (day as any) && sp.raw !== 'FREE').length,
      );
    }

    // Substitution count accumulated in THIS run (so fair-distribution stays fair within a single run)
    const runSubCount = new Map<string, number>();

    // ── Allocation loop ───────────────────────────────────────────────────────
    const assignments: Array<{
      period: number;
      absent_teacher_id: string;
      absent_teacher_name: string;
      substitute_id: string | null;
      substitute_name: string | null;
      substitute_regular_periods: number;
      grades: number[];
      classes: string[];
      raw: string;
      reason: string;
      cross_stage: boolean;
    }> = [];

    for (const absentId of absentTeacherIds) {
      const absentPeriods = activePeriods
        .filter((p) => p.teacher_id === absentId && p.day === (day as any) && p.raw !== 'FREE')
        .sort((a, b) => a.period - b.period);

      const absentTeacherName =
        activePeriods.find((p) => p.teacher_id === absentId)?.teacher?.name ?? absentId;

      for (const p of absentPeriods) {
        // ── Step 1: eligible pool — free at this slot AND under daily cap ──
        // A teacher is FREE at (day, period) if:
        //   a) they work this day (have at least one record on this day), AND
        //   b) they have no record for this specific period (parser skips empty slots)
        //      OR their record explicitly says 'FREE'
        const free = candidateIds.filter((cid) => {
          if (!teachersOnThisDay.has(cid)) return false; // doesn't work this day
          const cp = periodMap.get(`${cid}:${day}:${p.period}`);
          const isFree = !cp || cp.raw === 'FREE';
          if (!isFree) return false;
          const regular = regularPeriodsOnDay.get(cid) ?? 0;
          const subs    = runSubCount.get(cid) ?? 0;
          return regular + subs < MAX_DAILY_PERIODS;
        });

        if (free.length === 0) {
          assignments.push({
            period: p.period, absent_teacher_id: absentId,
            absent_teacher_name: absentTeacherName,
            substitute_id: null, substitute_name: null,
            substitute_regular_periods: 0,
            grades: p.grades ?? [], classes: p.classes ?? [], raw: p.raw,
            reason: 'No substitute available',
            cross_stage: false,
          });
          continue;
        }

        const periodGrades = new Set((p.grades ?? []).map(Number));
        const periodStage  = getStage(periodGrades);

        // ── Step 2: prefer same-stage candidates ──
        const sameStage  = periodStage ? free.filter((cid) => teacherInStage(cid, periodStage)) : [];
        const pool       = sameStage.length > 0 ? sameStage : free;
        const isCrossStage = sameStage.length === 0 && free.length > 0;

        // ── Step 3: fair distribution — pick teacher with fewest total subs ──
        // total = term history + subs already assigned in this run
        pool.sort((a, b) => {
          const totalA = (historyMap.get(a) ?? 0) + (runSubCount.get(a) ?? 0);
          const totalB = (historyMap.get(b) ?? 0) + (runSubCount.get(b) ?? 0);
          return totalA - totalB;
        });
        const bestId = pool[0];

        // Track for cap and fair-distribution in subsequent periods this run
        runSubCount.set(bestId, (runSubCount.get(bestId) ?? 0) + 1);

        const subName = activePeriods.find((sp) => sp.teacher_id === bestId)?.teacher?.name ?? bestId;
        const regularPeriodsToday = regularPeriodsOnDay.get(bestId) ?? 0;

        const reason = isCrossStage
          ? `No ${periodStage ?? 'same-stage'} teacher free — cross-stage assigned`
          : `${periodStage ?? 'Stage'} stage · fair distribution`;

        assignments.push({
          period: p.period, absent_teacher_id: absentId,
          absent_teacher_name: absentTeacherName,
          substitute_id: bestId, substitute_name: subName,
          substitute_regular_periods: regularPeriodsToday,
          grades: p.grades ?? [], classes: p.classes ?? [], raw: p.raw,
          reason,
          cross_stage: isCrossStage,
        });
      }
    }

    assignments.sort(
      (a, b) => a.absent_teacher_name.localeCompare(b.absent_teacher_name) || a.period - b.period,
    );

    // ── Compute how many substitution periods each sub has been given in this run ──
    const subCountInRun = new Map<string, number>();
    for (const a of assignments) {
      if (a.substitute_id) {
        subCountInRun.set(a.substitute_id, (subCountInRun.get(a.substitute_id) ?? 0) + 1);
      }
    }
    const finalAssignments = assignments.map((a) => ({
      ...a,
      substitute_subs_today: a.substitute_id ? (subCountInRun.get(a.substitute_id) ?? 0) : 0,
    }));

    // ── Persist to substitution_log (replace today's entries for these absences) ──
    for (const absentId of absentTeacherIds) {
      await this.logRepo.manager.query(
        `DELETE FROM substitution_log WHERE date = $1 AND absent_teacher_id = $2`,
        [date, absentId],
      );
    }
    for (const a of finalAssignments.filter((x) => x.substitute_id !== null)) {
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

    return { assignments: finalAssignments, unresolved_count: finalAssignments.filter((a) => !a.substitute_id).length };
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
