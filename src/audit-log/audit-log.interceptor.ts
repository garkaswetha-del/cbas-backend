import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable, tap, catchError, throwError } from 'rxjs';
import { AuditLogService } from './audit-log.service';

// Priority-ordered: more specific patterns first
const ACTION_PATTERNS: Array<{ method: string; pattern: RegExp; action: string }> = [
  // Auth
  { method: 'POST',  pattern: /^\/users\/login$/,                           action: 'LOGIN' },
  { method: 'POST',  pattern: /^\/users\/logout$/,                          action: 'LOGOUT' },

  // Appraisal
  { method: 'PATCH', pattern: /^\/appraisal\/share\//,                      action: 'APPRAISAL_SHARED' },
  { method: 'PATCH', pattern: /^\/appraisal\/unshare\//,                    action: 'APPRAISAL_UNSHARED' },
  { method: 'POST',  pattern: /^\/appraisal\//,                             action: 'APPRAISAL_SUBMITTED' },

  // Baseline
  { method: 'POST',  pattern: /^\/baseline\/section\/round/,                action: 'BASELINE_ROUND_SAVED' },
  { method: 'POST',  pattern: /^\/baseline\/section/,                       action: 'BASELINE_SECTION_SAVED' },
  { method: 'POST',  pattern: /^\/baseline\/teacher/,                       action: 'BASELINE_TEACHER_SAVED' },
  { method: 'POST',  pattern: /^\/baseline\/participation/,                 action: 'BASELINE_PARTICIPATION_SET' },
  { method: 'DELETE',pattern: /^\/baseline\/assessment\//,                  action: 'BASELINE_DELETED' },
  { method: 'DELETE',pattern: /^\/baseline\/section/,                       action: 'BASELINE_SECTION_DELETED' },

  // Observations
  { method: 'POST',  pattern: /^\/observation$/,                            action: 'OBSERVATION_CREATED' },
  { method: 'PUT',   pattern: /^\/observation\//,                           action: 'OBSERVATION_UPDATED' },
  { method: 'PATCH', pattern: /^\/observation\/.*\/share/,                  action: 'OBSERVATION_SHARED' },
  { method: 'DELETE',pattern: /^\/observation\//,                           action: 'OBSERVATION_DELETED' },

  // Mappings
  { method: 'POST',  pattern: /^\/mappings\/save$/,                         action: 'MAPPING_SAVED' },
  { method: 'DELETE',pattern: /^\/mappings\//,                              action: 'MAPPING_DELETED' },

  // Students
  { method: 'POST',  pattern: /^\/students\/promotion\/execute-batch/,      action: 'STUDENT_PROMOTED_BATCH' },
  { method: 'POST',  pattern: /^\/students\/promotion\/execute/,            action: 'STUDENT_PROMOTED' },
  { method: 'POST',  pattern: /^\/students\/graduation\/execute/,           action: 'STUDENT_GRADUATED' },
  { method: 'POST',  pattern: /^\/students\/bulk-import/,                   action: 'STUDENT_IMPORT' },
  { method: 'POST',  pattern: /^\/students\/bulk-update/,                   action: 'STUDENT_BULK_UPDATED' },
  { method: 'PATCH', pattern: /^\/students\/.*\/tc$/,                       action: 'STUDENT_TC_ISSUED' },
  { method: 'PATCH', pattern: /^\/students\//,                              action: 'STUDENT_UPDATED' },
  { method: 'DELETE',pattern: /^\/students\/.*\/permanent/,                 action: 'STUDENT_DELETED_PERMANENT' },
  { method: 'DELETE',pattern: /^\/students\//,                              action: 'STUDENT_DELETED' },

  // Users / Teachers
  { method: 'POST',  pattern: /^\/users$/,                                  action: 'TEACHER_CREATED' },
  { method: 'PATCH', pattern: /^\/users\/.*\/deactivate$/,                  action: 'TEACHER_DEACTIVATED' },
  { method: 'PATCH', pattern: /^\/users\/.*\/reactivate$/,                  action: 'TEACHER_REACTIVATED' },
  { method: 'PATCH', pattern: /^\/users\/.*\/reset-password$/,              action: 'TEACHER_PASSWORD_RESET' },
  { method: 'PATCH', pattern: /^\/users\/.*\/change-password$/,             action: 'TEACHER_PASSWORD_CHANGED' },
  { method: 'PATCH', pattern: /^\/users\//,                                 action: 'TEACHER_UPDATED' },
  { method: 'DELETE',pattern: /^\/users\//,                                 action: 'TEACHER_DELETED' },

  // Exam marks (PASA)
  { method: 'POST',  pattern: /^\/pasa\/marks$/,                            action: 'EXAM_MARKS_SAVED' },
  { method: 'DELETE',pattern: /^\/pasa\/clear-all/,                         action: 'EXAM_DATA_CLEARED' },
  { method: 'DELETE',pattern: /^\/pasa\/marks\//,                           action: 'EXAM_MARKS_DELETED' },

  // Memos
  { method: 'POST',  pattern: /^\/memos$/,                                  action: 'MEMO_CREATED' },
  { method: 'DELETE',pattern: /^\/memos\//,                                 action: 'MEMO_DELETED' },

  // Homework
  { method: 'POST',  pattern: /^\/homework\/save$/,                         action: 'HOMEWORK_LOGGED' },
  { method: 'DELETE',pattern: /^\/homework\//,                              action: 'HOMEWORK_DELETED' },

  // Sections
  { method: 'POST',  pattern: /^\/sections$/,                               action: 'SECTION_CREATED' },
  { method: 'DELETE',pattern: /^\/sections\//,                              action: 'SECTION_DELETED' },

  // Activities (most specific first)
  { method: 'POST',  pattern: /^\/activities\/competencies\/import/,        action: 'COMPETENCY_IMPORT' },
  { method: 'POST',  pattern: /^\/activities\/competencies$/,               action: 'COMPETENCY_CREATED' },
  { method: 'PUT',   pattern: /^\/activities\/competencies\//,              action: 'COMPETENCY_UPDATED' },
  { method: 'DELETE',pattern: /^\/activities\/competencies\//,              action: 'COMPETENCY_DELETED' },
  { method: 'POST',  pattern: /^\/activities\/[^/]+\/marks$/,               action: 'ACTIVITY_MARKS_SAVED' },
  { method: 'PUT',   pattern: /^\/activities\/[^/]+$/,                      action: 'ACTIVITY_UPDATED' },
  { method: 'DELETE',pattern: /^\/activities\/[^/]+$/,                      action: 'ACTIVITY_DELETED' },
  { method: 'POST',  pattern: /^\/activities$/,                             action: 'ACTIVITY_CREATED' },
];

// Endpoints to skip (already logged manually, or not meaningful)
const SKIP_PATHS = ['/users/login', '/audit-logs', '/mappings/login'];

function resolveAction(method: string, url: string): string | null {
  const path = url.split('?')[0];
  if (SKIP_PATHS.some(s => path.startsWith(s))) return null;
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return null;
  const match = ACTION_PATTERNS.find(p => p.method === method && p.pattern.test(path));
  return match ? match.action : `${method} ${path}`;
}

// Scan common user-identity fields from the request body
function extractUser(body: any): { user_name?: string; user_id?: string; user_role?: string } {
  if (!body || typeof body !== 'object') return {};
  return {
    user_name: body.teacher_name   ?? body.user_name      ?? body.submitted_by
            ?? body.observer_name  ?? body.created_by_name ?? undefined,
    user_id:   body.teacher_id     ?? body.user_id        ?? body.created_by ?? undefined,
    user_role: body.role ?? undefined,
  };
}

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(private readonly auditLogService: AuditLogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req    = context.switchToHttp().getRequest();
    const method = req.method as string;
    const url    = req.url as string;
    const action = resolveAction(method, url);

    if (!action) return next.handle();

    const ip   = (req.headers['x-forwarded-for'] as string) ?? req.socket?.remoteAddress ?? '';
    const user = extractUser(req.body);

    return next.handle().pipe(
      tap(() => {
        this.auditLogService.log({
          ...user,
          action,
          ip_address: ip,
          resource_type: url.split('/')[1],
          result: 'success',
        });
      }),
      catchError(err => {
        this.auditLogService.log({
          ...user,
          action,
          ip_address: ip,
          resource_type: url.split('/')[1],
          result: 'failure',
          details: { error: err.message },
        });
        return throwError(() => err);
      }),
    );
  }
}
