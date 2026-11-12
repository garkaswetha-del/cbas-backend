import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HrApplicant } from './entities/hr-applicant.entity';
import { HrResumeParserService } from './hr-resume-parser.service';

// So a PDF opens/previews in the browser tab instead of being force-downloaded
// as a generic octet-stream. Word files have no built-in browser viewer, so
// they'll still download even with the correct type — that's a browser limit.
function resumeMimeType(filename: string): string {
  const lower = (filename || '').toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (lower.endsWith('.doc')) return 'application/msword';
  return 'application/octet-stream';
}

@Injectable()
export class HrApplicantsService {
  constructor(
    @InjectRepository(HrApplicant)
    private repo: Repository<HrApplicant>,
    private resumeParser: HrResumeParserService,
  ) {}

  async findAll(filters: { stage?: string; shortlisted?: string; search?: string; branch?: string }) {
    const qb = this.repo.createQueryBuilder('a').orderBy('a.created_at', 'DESC');
    if (filters.stage) qb.andWhere('a.stage = :stage', { stage: filters.stage });
    if (filters.branch) qb.andWhere('a.branch = :branch', { branch: filters.branch });
    if (filters.shortlisted === 'true') qb.andWhere('a.is_shortlisted = true');
    if (filters.search) {
      qb.andWhere('(a.name ILIKE :s OR a.email ILIKE :s OR a.subject_applied_for ILIKE :s OR a.locality ILIKE :s)', { s: `%${filters.search}%` });
    }
    return qb.getMany();
  }

  async findOne(id: string) {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Applicant not found');
    return row;
  }

  async getInterviewQuestions(id: string, subjectOverride?: string, stageOverride?: string) {
    const applicant = await this.findOne(id);
    const questions = await this.resumeParser.generateInterviewQuestions(
      subjectOverride || applicant.subject_applied_for,
      stageOverride || applicant.school_stage,
    );
    return { questions };
  }

  async create(data: Partial<HrApplicant>) {
    return this.repo.save(this.repo.create({ ...data, stage: data.stage || 'applied' }));
  }

  // Bulk import from a parsed Excel sheet — same "skip what's missing" rule as single create
  async bulkCreate(rows: Partial<HrApplicant>[]) {
    let saved = 0;
    for (const row of rows) {
      if (!row.name && !row.email && !row.contact_no) continue; // need at least something to identify them by
      await this.repo.save(this.repo.create({ ...row, stage: 'applied' }));
      saved++;
    }
    return { success: true, saved };
  }

  // This is the real intake path: HR receives resumes as PDF/Word files (from
  // email, portals, walk-ins — wherever), not as a spreadsheet. Each file gets
  // its text extracted, the fields pulled out by Groq, and its own applicant
  // row created — same parsing logic Phase 3's email intake uses, just
  // triggered directly instead of waiting on an inbox poll.
  async uploadResumes(files: { buffer: Buffer; originalname: string }[], branch?: string) {
    const results: { filename: string; created: boolean; name?: string; reason?: string }[] = [];
    for (const file of files) {
      try {
        const text = await this.resumeParser.extractText(file.buffer, file.originalname);
        if (!text.trim()) {
          results.push({ filename: file.originalname, created: false, reason: 'Could not read text from this file (unsupported format or empty)' });
          continue;
        }
        const extracted = await this.resumeParser.extractFields(text);
        const applicant = await this.create({
          ...extracted,
          resume_file: `data:${resumeMimeType(file.originalname)};base64,${file.buffer.toString('base64')}`,
          source_portal: 'Manual upload',
          branch,
        });
        results.push({ filename: file.originalname, created: true, name: applicant.name || undefined });
      } catch (e) {
        results.push({ filename: file.originalname, created: false, reason: (e as Error).message });
      }
    }
    return { total: files.length, created: results.filter(r => r.created).length, results };
  }

  async update(id: string, data: Partial<HrApplicant>) {
    await this.findOne(id);
    await this.repo.update(id, data);
    return this.findOne(id);
  }

  async setShortlist(id: string, is_shortlisted: boolean, shortlisted_by?: string, shortlist_notes?: string) {
    await this.findOne(id);
    await this.repo.update(id, {
      is_shortlisted,
      shortlisted_by: is_shortlisted ? shortlisted_by : null as any,
      shortlisted_at: is_shortlisted ? new Date() : null,
      shortlist_notes,
      stage: is_shortlisted ? 'shortlisted' : 'applied',
    });
    return this.findOne(id);
  }

  async setStage(id: string, stage: string) {
    await this.findOne(id);
    await this.repo.update(id, { stage });
    return this.findOne(id);
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.repo.delete(id);
    return { success: true };
  }

  async removeMany(ids: string[]) {
    if (!ids.length) return { success: true, deleted: 0 };
    await this.repo.delete(ids);
    return { success: true, deleted: ids.length };
  }
}
