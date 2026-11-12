import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HrApplicant } from './entities/hr-applicant.entity';
import { HrInterview } from './entities/hr-interview.entity';

function bump(map: Record<string, number>, key: string) {
  map[key] = (map[key] || 0) + 1;
}

@Injectable()
export class HrDashboardService {
  constructor(
    @InjectRepository(HrApplicant) private applicantRepo: Repository<HrApplicant>,
    @InjectRepository(HrInterview) private interviewRepo: Repository<HrInterview>,
  ) {}

  async getSummary() {
    const applicants = await this.applicantRepo.find();
    const interviews = await this.interviewRepo.find();

    const byBranch: Record<string, number> = {};
    const bySubject: Record<string, number> = {};
    const byStage: Record<string, number> = {};
    const byPipelineStage: Record<string, number> = {};

    for (const a of applicants) {
      bump(byBranch, a.branch || 'Unspecified');
      bump(bySubject, a.subject_applied_for || 'Unspecified');
      bump(byPipelineStage, a.stage || 'applied');

      const stages = Array.isArray(a.school_stage) ? a.school_stage.filter(Boolean) : (a.school_stage ? [a.school_stage as any] : []);
      if (stages.length === 0) bump(byStage, 'Unspecified');
      else for (const s of stages) bump(byStage, s);
    }

    const resultCounts: Record<string, number> = {};
    for (const i of interviews) bump(resultCounts, i.result || 'pending');

    return {
      totalApplicants: applicants.length,
      shortlisted: applicants.filter(a => a.is_shortlisted).length,
      selected: applicants.filter(a => a.stage === 'selected').length,
      hired: applicants.filter(a => a.stage === 'hired').length,
      byBranch,
      bySubject,
      byStage,
      byPipelineStage,
      interviews: {
        total: interviews.length,
        attended: interviews.filter(i => i.attended === true).length,
        absent: interviews.filter(i => i.attended === false).length,
        upcoming: interviews.filter(i => i.attended === null).length,
        resultCounts,
      },
    };
  }
}
