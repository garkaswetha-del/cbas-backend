import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { HrApplicantsService } from './hr-applicants.service';
import { HrResumeParserService } from './hr-resume-parser.service';

// Polls one dedicated HR inbox (every portal application should ultimately land
// here) for unread mail with a resume attachment, extracts the fields with Groq,
// and creates an hr_applicants row. Silently no-ops if HR_INBOX_EMAIL /
// HR_INBOX_PASSWORD aren't set, so this never breaks anything for anyone who
// hasn't configured it yet.
@Injectable()
export class HrIntakeService {
  private readonly logger = new Logger(HrIntakeService.name);

  constructor(
    private applicantsService: HrApplicantsService,
    private resumeParser: HrResumeParserService,
  ) {}

  private guessPortal(subject: string, from: string): string {
    const s = `${subject} ${from}`.toLowerCase();
    if (s.includes('naukri')) return 'Naukri';
    if (s.includes('indeed')) return 'Indeed';
    if (s.includes('linkedin')) return 'LinkedIn';
    if (s.includes('shine')) return 'Shine';
    if (s.includes('monster')) return 'Monster';
    return 'Email';
  }

  async pollNow(): Promise<{ configured: boolean; checked?: number; created?: number; failed?: number; error?: string }> {
    const host = process.env.HR_INBOX_HOST || 'imap.gmail.com';
    const port = Number(process.env.HR_INBOX_PORT || 993);
    const user = process.env.HR_INBOX_EMAIL;
    const pass = process.env.HR_INBOX_PASSWORD;
    if (!user || !pass) {
      return { configured: false };
    }

    const client = new ImapFlow({ host, port, secure: true, auth: { user, pass }, logger: false });
    let checked = 0, created = 0, failed = 0;

    try {
      await client.connect();
    } catch (e) {
      this.logger.error(`Could not connect to HR inbox: ${(e as Error).message}`);
      return { configured: true, error: (e as Error).message };
    }

    const lock = await client.getMailboxLock('INBOX');
    try {
      const uids = await client.search({ seen: false }, { uid: true }) as unknown as number[];
      for (const uid of uids || []) {
        checked++;
        try {
          const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
          if (!msg || !(msg as any).source) continue;
          const parsed = await simpleParser((msg as any).source);

          const resumeAttachment = (parsed.attachments || []).find(a => /\.(pdf|docx)$/i.test(a.filename || ''));
          let extracted: Record<string, any> = {};
          let resumeDataUri: string | undefined;

          if (resumeAttachment) {
            const text = await this.resumeParser.extractText(resumeAttachment.content, resumeAttachment.filename || '');
            extracted = await this.resumeParser.extractFields(text);
            resumeDataUri = `data:${resumeAttachment.contentType || 'application/octet-stream'};base64,${resumeAttachment.content.toString('base64')}`;
          }

          const fromAddress = parsed.from?.value?.[0]?.address || '';
          const fromName = parsed.from?.value?.[0]?.name || '';

          await this.applicantsService.create({
            name: extracted.name || fromName || undefined,
            email: extracted.email || fromAddress || undefined,
            contact_no: extracted.contact_no,
            address: extracted.address,
            locality: extracted.locality,
            qualification: extracted.qualification,
            experience_years: extracted.experience_years,
            experience_detail: extracted.experience_detail,
            guardian_name: extracted.guardian_name,
            religion: extracted.religion,
            caste: extracted.caste,
            previous_salary: extracted.previous_salary,
            expected_salary: extracted.expected_salary,
            subject_applied_for: extracted.subject_applied_for,
            source_portal: this.guessPortal(parsed.subject || '', fromAddress),
            resume_file: resumeDataUri,
            extra_json: { email_subject: parsed.subject || null, had_resume: !!resumeAttachment },
          } as any);
          created++;
          await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
        } catch (e) {
          failed++;
          this.logger.warn(`Failed to process HR inbox message uid=${uid}: ${(e as Error).message}`);
        }
      }
    } finally {
      lock.release();
      await client.logout();
    }

    return { configured: true, checked, created, failed };
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async scheduledPoll() {
    try {
      const result = await this.pollNow();
      if (result.configured && (result.created ?? 0) > 0) {
        this.logger.log(`HR inbox poll: ${result.created} new applicant(s) from ${result.checked} unread message(s)`);
      }
    } catch (e) {
      this.logger.error(`Scheduled HR inbox poll failed: ${(e as Error).message}`);
    }
  }
}
