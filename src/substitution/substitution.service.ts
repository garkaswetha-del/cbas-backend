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

  async debugTimetable(day: string) {
    const periods = await this.periodRepo.find({
      where: { is_active: true },
      relations: ['teacher'],
      order: { period: 'ASC' },
    });

    const onDay = periods.filter((p) => p.day === (day as any));

    // Group by teacher
    const byTeacher: Record<string, {
      name: string;
      periodsOnDay: { period: number; raw: string; grades: number[]; classes: string[]; period_type: string }[];
      gradesInProfile: number[];
    }> = {};

    for (const p of onDay) {
      const tid = p.teacher_id;
      if (!byTeacher[tid]) {
        byTeacher[tid] = { name: p.teacher?.name ?? tid, periodsOnDay: [], gradesInProfile: [] };
      }
      byTeacher[tid].periodsOnDay.push({
        period: p.period,
        raw: p.raw,
        grades: p.grades ?? [],
        classes: p.classes ?? [],
        period_type: p.period_type,
      });
    }

    // Load section→grade mapping (same as allocate)
    let sectionRowsDebug: { name: string; grade: string }[] = await this.logRepo.manager.query(
      `SELECT DISTINCT name, grade FROM sections WHERE is_active = true AND name IS NOT NULL AND grade IS NOT NULL`,
    );
    if (sectionRowsDebug.length === 0) {
      sectionRowsDebug = await this.logRepo.manager.query(
        `SELECT DISTINCT section AS name, grade FROM teacher_mappings WHERE is_active = true AND section IS NOT NULL AND grade IS NOT NULL`,
      );
    }
    const sectionToGradeDebug = new Map<string, number>();
    for (const row of sectionRowsDebug) {
      const g = parseInt(row.grade.replace(/[^0-9]/g, ''), 10);
      if (!isNaN(g) && g > 0) sectionToGradeDebug.set(row.name.trim().toUpperCase(), g);
    }

    // Build grade profiles (same logic as allocate, with enrichment)
    for (const p of periods) {
      if (p.raw === 'FREE') continue;
      const entry = byTeacher[p.teacher_id];
      if (entry) {
        let grades = (p.grades ?? []).map(Number);
        if (grades.length === 0) {
          for (const cls of (p.classes ?? [])) {
            const g = sectionToGradeDebug.get(cls.trim().toUpperCase());
            if (g !== undefined && !grades.includes(g)) grades.push(g);
          }
        }
        grades.forEach((g) => { if (!entry.gradesInProfile.includes(g)) entry.gradesInProfile.push(g); });
      }
    }

    return {
      day,
      teacherCount: Object.keys(byTeacher).length,
      teachers: Object.entries(byTeacher)
        .sort(([, a], [, b]) => a.name.localeCompare(b.name))
        .map(([tid, data]) => ({
          id: tid,
          name: data.name,
          periodsOnDay: data.periodsOnDay.sort((a, b) => a.period - b.period),
          gradesInProfile: data.gradesInProfile.sort((a, b) => a - b),
          stage: data.gradesInProfile.some(g => [3,4,5].includes(g)) ? 'Preparatory'
               : data.gradesInProfile.some(g => [6,7,8].includes(g)) ? 'Middle'
               : data.gradesInProfile.some(g => [9,10].includes(g)) ? 'Secondary'
               : 'Unknown',
        })),
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

    // ── Section → grade mapping from the sections table ───────────────────────
    // The timetable parser stores section names (e.g. ASTEROID) in `classes` but
    // often leaves `grades` empty. We resolve the grade from the sections table.
    let sectionRows: { name: string; grade: string }[] = await this.logRepo.manager.query(
      `SELECT DISTINCT name, grade FROM sections WHERE is_active = true AND name IS NOT NULL AND grade IS NOT NULL`,
    );
    if (sectionRows.length === 0) {
      // Fallback: teacher_mappings if sections table is not yet seeded
      sectionRows = await this.logRepo.manager.query(
        `SELECT DISTINCT section AS name, grade FROM teacher_mappings WHERE is_active = true AND section IS NOT NULL AND grade IS NOT NULL`,
      );
    }
    const sectionToGrade = new Map<string, number>();
    for (const row of sectionRows) {
      const gradeNum = parseInt(row.grade.replace(/[^0-9]/g, ''), 10);
      if (!isNaN(gradeNum) && gradeNum > 0) {
        sectionToGrade.set(row.name.trim().toUpperCase(), gradeNum);
      }
    }

    // Enrich a grades array using section names when grades array is empty
    const enrichGrades = (grades: number[], classes: string[]): number[] => {
      if (grades.length > 0) return grades;
      const enriched: number[] = [];
      for (const cls of (classes ?? [])) {
        const g = sectionToGrade.get(cls.trim().toUpperCase());
        if (g !== undefined && !enriched.includes(g)) enriched.push(g);
      }
      return enriched;
    };

    // ── Grade/class profiles — use enriched grades so stage detection works ───
    const profiles = new Map<string, { grades: Set<number>; classes: Set<string> }>();
    for (const p of activePeriods) {
      if (p.raw === 'FREE') continue;
      if (!profiles.has(p.teacher_id)) profiles.set(p.teacher_id, { grades: new Set(), classes: new Set() });
      const prof = profiles.get(p.teacher_id)!;
      const grades = enrichGrades((p.grades ?? []).map(Number), p.classes ?? []);
      grades.forEach((g) => prof.grades.add(g));
      (p.classes ?? []).forEach((c) => prof.classes.add(c));
    }

    const allTeacherIds = [...new Set(activePeriods.map((p) => p.teacher_id))];
    const candidateIds = allTeacherIds.filter((id) => !excludedIds.has(id));

    // Which teachers have at least one record on this day (guards against marking
    // a teacher free on a day they don't work at all)
    const teachersOnThisDay = new Set<string>(
      activePeriods.filter((p) => p.day === (day as any)).map((p) => p.teacher_id),
    );

    // ── Section-overlap scoring ───────────────────────────────────────────────
    // How many sections does candidate C share with absent teacher A?
    // (higher = better match; 0 = no shared sections = cross-section fallback)
    const sectionOverlap = (candidateId: string, absentId: string): number => {
      const absentClasses  = profiles.get(absentId)?.classes  ?? new Set<string>();
      const candidateClasses = profiles.get(candidateId)?.classes ?? new Set<string>();
      let count = 0;
      for (const cls of absentClasses) { if (candidateClasses.has(cls)) count++; }
      return count;
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

    const debugLog: Array<{
      absent: string;
      period: number;
      absentClasses: string[];
      freePool: { name: string; classes: string[]; overlap: number; weeklyLoad: number }[];
      chosen: string | null;
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

        // ── Step 2: rank free candidates by section overlap then fair distribution ──
        const scored = free.map((cid) => ({
          cid,
          name:        activePeriods.find((sp) => sp.teacher_id === cid)?.teacher?.name ?? cid,
          classes:     [...(profiles.get(cid)?.classes ?? [])],
          overlap:     sectionOverlap(cid, absentId),
          weeklyLoad:  (historyMap.get(cid) ?? 0) + (runSubCount.get(cid) ?? 0),
        }));
        scored.sort((a, b) =>
          b.overlap !== a.overlap ? b.overlap - a.overlap : a.weeklyLoad - b.weeklyLoad,
        );

        debugLog.push({
          absent: absentTeacherName,
          period: p.period,
          absentClasses: [...(profiles.get(absentId)?.classes ?? [])],
          freePool: scored.map(({ name, classes, overlap, weeklyLoad }) => ({ name, classes, overlap, weeklyLoad })),
          chosen: free.length === 0 ? null : scored[0]?.name ?? null,
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

        const best         = scored[0];
        const bestId       = best.cid;
        const isCrossStage = best.overlap === 0;

        // Track for cap and fair-distribution in subsequent periods this run
        runSubCount.set(bestId, (runSubCount.get(bestId) ?? 0) + 1);

        const subName = activePeriods.find((sp) => sp.teacher_id === bestId)?.teacher?.name ?? bestId;
        const regularPeriodsToday = regularPeriodsOnDay.get(bestId) ?? 0;

        const reason = isCrossStage
          ? `No section-matched teacher free — cross-section assigned`
          : `Section match (${best.overlap} shared) · fair distribution`;

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

    return { assignments: finalAssignments, unresolved_count: finalAssignments.filter((a) => !a.substitute_id).length, _debug: debugLog };
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
