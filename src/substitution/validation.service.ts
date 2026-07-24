import { Injectable } from '@nestjs/common';

export type IssueSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  severity: IssueSeverity;
  code: string;
  message: string;
  context: Record<string, unknown>;
}

export interface PeriodRecord {
  teacherId: string;
  teacherName: string;
  day: string;
  period: number;
  raw: string;
  grades: number[];
  classes: string[];
}

export interface TeacherProfile {
  grades: Set<number>;
  classes: Set<string>;
}

const SEVERITY_ORDER: Record<IssueSeverity, number> = { error: 0, warning: 1, info: 2 };

@Injectable()
export class ValidationService {
  checkDuplicateEntries(absentTeacherIds: string[], tempUnavailableIds: string[]): ValidationIssue[] {
    const overlap = absentTeacherIds.filter((id) => tempUnavailableIds.includes(id));

    return [...new Set(overlap)].map((teacherId) => ({
      severity: 'error',
      code: 'DUPLICATE_ENTRY',
      message: `Teacher is listed as both Absent and Temporarily Unavailable. Remove them from one of the two lists.`,
      context: { teacherId },
    }));
  }

  checkEmptyAbsentList(absentTeacherIds: string[]): ValidationIssue[] {
    if (absentTeacherIds.length > 0) return [];

    return [
      {
        severity: 'info',
        code: 'EMPTY_ABSENT_LIST',
        message: 'No teachers are marked absent today.',
        context: {},
      },
    ];
  }

  checkFullyExcludedGradesAndClasses(
    profiles: Map<string, TeacherProfile>,
    excludedTeacherIds: Set<string>,
  ): ValidationIssue[] {
    const gradeToTeachers = new Map<number, Set<string>>();
    const classToTeachers = new Map<string, Set<string>>();

    for (const [teacherId, profile] of profiles) {
      for (const grade of profile.grades) {
        if (!gradeToTeachers.has(grade)) gradeToTeachers.set(grade, new Set());
        gradeToTeachers.get(grade)!.add(teacherId);
      }

      for (const cls of profile.classes) {
        if (!classToTeachers.has(cls)) classToTeachers.set(cls, new Set());
        classToTeachers.get(cls)!.add(teacherId);
      }
    }

    const issues: ValidationIssue[] = [];

    for (const [grade, teacherIds] of gradeToTeachers) {
      if (teacherIds.size > 0 && [...teacherIds].every((id) => excludedTeacherIds.has(id))) {
        issues.push({
          severity: 'info',
          code: 'GRADE_FULLY_EXCLUDED',
          message: `No teacher who normally covers Grade ${grade} is available today. A substitute from a different grade may be assigned instead.`,
          context: { grade, teacherIds: [...teacherIds] },
        });
      }
    }

    for (const [cls, teacherIds] of classToTeachers) {
      if (teacherIds.size > 0 && [...teacherIds].every((id) => excludedTeacherIds.has(id))) {
        issues.push({
          severity: 'info',
          code: 'CLASS_FULLY_EXCLUDED',
          message: `No teacher who normally covers class '${cls}' is available today. A substitute from another class may be assigned instead.`,
          context: { class: cls, teacherIds: [...teacherIds] },
        });
      }
    }

    return issues;
  }

  checkPeriodCoverage(
    periods: PeriodRecord[],
    day: string,
    absentTeacherIds: string[],
    excludedTeacherIds: Set<string>,
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    const periodsByTeacherDay = new Map<string, PeriodRecord[]>();
    for (const p of periods) {
      if (p.day !== day) continue;
      const key = p.teacherId;
      if (!periodsByTeacherDay.has(key)) periodsByTeacherDay.set(key, []);
      periodsByTeacherDay.get(key)!.push(p);
    }

    const candidateIds = [...new Set(periods.map((p) => p.teacherId))].filter(
      (id) => !excludedTeacherIds.has(id),
    );

    for (const absentId of absentTeacherIds) {
      const absentPeriods = (periodsByTeacherDay.get(absentId) || []).filter((p) => p.raw !== 'FREE');

      for (const p of absentPeriods) {
        const hasSubstitute = candidateIds.some((candidateId) =>
          periods.some(
            (cp) =>
              cp.teacherId === candidateId && cp.day === day && cp.period === p.period && cp.raw === 'FREE',
          ),
        );

        if (!hasSubstitute) {
          issues.push({
            severity: 'error',
            code: 'NO_SUBSTITUTE_AVAILABLE',
            message: `No eligible substitute is free for ${p.teacherName} on ${day} Period ${p.period}.`,
            context: { teacherId: absentId, teacherName: p.teacherName, day, period: p.period },
          });
        }
      }
    }

    return issues;
  }

  validateRuleInputs(
    periods: PeriodRecord[],
    profiles: Map<string, TeacherProfile>,
    day: string,
    absentTeacherIds: string[],
    permanentExceptionIds: string[],
    tempUnavailableIds: string[],
  ): ValidationIssue[] {
    const excludedTeacherIds = new Set([
      ...absentTeacherIds,
      ...permanentExceptionIds,
      ...tempUnavailableIds,
    ]);

    const issues: ValidationIssue[] = [
      ...this.checkDuplicateEntries(absentTeacherIds, tempUnavailableIds),
      ...this.checkEmptyAbsentList(absentTeacherIds),
      ...this.checkFullyExcludedGradesAndClasses(profiles, excludedTeacherIds),
      ...this.checkPeriodCoverage(periods, day, absentTeacherIds, excludedTeacherIds),
    ];

    return issues.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  }

  hasBlockingErrors(issues: ValidationIssue[]): boolean {
    return issues.some((issue) => issue.severity === 'error');
  }
}
