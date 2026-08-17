import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TeacherModuleStep } from './entities/teacher-module-step.entity';
import { BaselineAssessment, EntityType } from '../assessments/entities/baseline-assessment.entity/baseline-assessment.entity';

const LITERACY_DOMAINS = ['Listening', 'Speaking', 'Reading', 'Writing'];
const NUMERACY_DOMAINS = ['Operations', 'Base 10', 'Measurement', 'Geometry'];
const STAGE_ORDER = ['foundation', 'preparatory', 'middle', 'secondary'];
const COMPLETION_THRESHOLD = 85;

// Domain descriptions for the "Learn" step content
const DOMAIN_CONTENT: Record<string, { summary: string; keySkills: string[] }> = {
  Listening: {
    summary: 'Listening focuses on comprehending spoken language, following instructions, and responding appropriately to oral communication in classroom settings.',
    keySkills: ['Identifying main ideas from spoken text', 'Following multi-step oral instructions', 'Discriminating between similar sounds', 'Active listening and note-taking strategies'],
  },
  Speaking: {
    summary: 'Speaking covers oral communication, pronunciation, fluency, and the ability to express ideas clearly in academic and social contexts.',
    keySkills: ['Pronouncing words with correct stress and intonation', 'Presenting ideas in structured sequence', 'Participating in discussions and debates', 'Asking and answering questions with clarity'],
  },
  Reading: {
    summary: 'Reading encompasses decoding, comprehension, vocabulary development, and critical reading strategies across different text types.',
    keySkills: ['Phonics and word recognition', 'Reading for literal and inferential meaning', 'Identifying text structure (narrative, expository, etc.)', 'Vocabulary in context'],
  },
  Writing: {
    summary: 'Writing develops the ability to produce coherent, structured written texts for different purposes and audiences.',
    keySkills: ['Handwriting and spelling accuracy', 'Sentence construction and paragraph writing', 'Writing for different purposes (narrative, descriptive, persuasive)', 'Editing and revising written work'],
  },
  Operations: {
    summary: 'Operations covers arithmetic skills — addition, subtraction, multiplication, and division — with a focus on conceptual understanding and procedural fluency.',
    keySkills: ['Mental math strategies', 'Multi-digit operations with regrouping', 'Word problems applying operations', 'Checking reasonableness of answers'],
  },
  'Base 10': {
    summary: 'Base 10 understanding underpins the entire number system — place value, estimation, rounding, and the relationship between numbers.',
    keySkills: ['Place value to thousands and beyond', 'Composing and decomposing numbers', 'Comparing and ordering numbers', 'Rounding and estimation strategies'],
  },
  Measurement: {
    summary: 'Measurement introduces standard and non-standard units for length, mass, capacity, time, area, and perimeter.',
    keySkills: ['Using appropriate units and instruments', 'Converting between units of measurement', 'Area and perimeter of regular shapes', 'Time — reading clocks, elapsed time, calendars'],
  },
  Geometry: {
    summary: 'Geometry develops spatial reasoning through the study of shapes, angles, symmetry, and coordinate systems.',
    keySkills: ['Properties of 2D and 3D shapes', 'Lines, angles, and parallel/perpendicular', 'Symmetry and transformations (reflection, rotation)', 'Basic coordinate geometry'],
  },
};

// Resource links per domain
const DOMAIN_RESOURCES: Record<string, Array<{ title: string; url: string; type: string }>> = {
  Listening: [
    { title: 'NCERT Teaching of English — Oral Skills', url: 'https://ncert.nic.in', type: 'NCERT' },
    { title: 'Listening Comprehension Strategies — CBSE', url: 'https://cbseacademic.nic.in', type: 'CBSE' },
  ],
  Speaking: [
    { title: 'NCERT English Language Teaching Module', url: 'https://ncert.nic.in', type: 'NCERT' },
    { title: 'Spoken English for Indian Classrooms — CBSE', url: 'https://cbseacademic.nic.in', type: 'CBSE' },
  ],
  Reading: [
    { title: 'NCERT Reading Literacy Framework', url: 'https://ncert.nic.in', type: 'NCERT' },
    { title: 'NIPUN Bharat — Literacy Goals', url: 'https://nipunbharat.education.gov.in', type: 'Government' },
  ],
  Writing: [
    { title: 'NCERT Writing Skills Handbook', url: 'https://ncert.nic.in', type: 'NCERT' },
    { title: 'CBSE Writing Skills Practice Material', url: 'https://cbseacademic.nic.in', type: 'CBSE' },
  ],
  Operations: [
    { title: 'NCERT Mathematics Textbooks', url: 'https://ncert.nic.in/textbook.php', type: 'NCERT' },
    { title: 'NIPUN Bharat — Numeracy Goals', url: 'https://nipunbharat.education.gov.in', type: 'Government' },
  ],
  'Base 10': [
    { title: 'NCERT Number System — Place Value', url: 'https://ncert.nic.in/textbook.php', type: 'NCERT' },
    { title: 'CBSE Maths Learning Outcomes', url: 'https://cbseacademic.nic.in', type: 'CBSE' },
  ],
  Measurement: [
    { title: 'NCERT Measurement Chapter Resources', url: 'https://ncert.nic.in/textbook.php', type: 'NCERT' },
    { title: 'CBSE Activity-Based Measurement', url: 'https://cbseacademic.nic.in', type: 'CBSE' },
  ],
  Geometry: [
    { title: 'NCERT Geometry Concepts', url: 'https://ncert.nic.in/textbook.php', type: 'NCERT' },
    { title: 'CBSE Shapes and Spatial Reasoning', url: 'https://cbseacademic.nic.in', type: 'CBSE' },
  ],
};

// Teaching Methodology content for teachers who clear Secondary stage
const TEACHING_METHODOLOGY = {
  summary: 'You have mastered all competency domains at Secondary level. This module focuses on how to teach these domains effectively — pedagogy, assessment design, and mentoring other teachers.',
  keySkills: [
    'Designing competency-based lesson plans',
    'Differentiated instruction for mixed-ability classrooms',
    'Formative assessment strategies aligned to CBSE',
    'Peer coaching and mentoring junior teachers',
    'Reflective practice and continuous improvement',
  ],
};

@Injectable()
export class LearningModulesService {
  constructor(
    @InjectRepository(TeacherModuleStep)
    private stepRepo: Repository<TeacherModuleStep>,
    @InjectRepository(BaselineAssessment)
    private baselineRepo: Repository<BaselineAssessment>,
  ) {}

  async getModules(teacher_id: string, academic_year: string) {
    const assessments = await this.baselineRepo.find({
      where: { entity_id: teacher_id, entity_type: EntityType.TEACHER, academic_year },
      order: { round: 'ASC' },
    });

    const steps = await this.stepRepo.find({ where: { teacher_id, academic_year } });
    const stepsMap = new Map(steps.map(s => [`${s.subject}_${s.stage}_${s.domain}`, s]));

    const latest = assessments[assessments.length - 1] ?? null;

    const result: Record<string, any> = {};

    for (const subject of ['literacy', 'numeracy'] as const) {
      const domains = subject === 'literacy' ? LITERACY_DOMAINS : NUMERACY_DOMAINS;
      const stageKey = subject === 'literacy' ? 'lit_stage' : 'num_stage';
      const currentStage: string = (latest?.gaps as any)?.[stageKey] || 'foundation';
      const currentStageIdx = STAGE_ORDER.indexOf(currentStage);
      const nextStage = currentStageIdx < 3 ? STAGE_ORDER[currentStageIdx + 1] : null;

      // Best score per domain across ALL rounds
      const bestScores: Record<string, number> = {};
      const latestScores: Record<string, number> = {};
      for (const a of assessments) {
        const pct: Record<string, number> = subject === 'literacy' ? (a.literacy_pct || {}) : (a.numeracy_pct || {});
        for (const [domain, score] of Object.entries(pct)) {
          const s = +score;
          if (bestScores[domain] === undefined || s > bestScores[domain]) bestScores[domain] = s;
        }
      }
      if (latest) {
        const pct: Record<string, number> = subject === 'literacy' ? (latest.literacy_pct || {}) : (latest.numeracy_pct || {});
        for (const [domain, score] of Object.entries(pct)) latestScores[domain] = +score;
      }

      const stageDomains = domains.map(domain => {
        const stepKey = `${subject}_${currentStage}_${domain}`;
        const step = stepsMap.get(stepKey);
        const bestScore = bestScores[domain] ?? null;
        const latestScore = latestScores[domain] ?? null;
        const isCompleted = bestScore !== null && bestScore >= COMPLETION_THRESHOLD;

        let status: string;
        if (isCompleted) {
          status = 'completed';
        } else if (step?.step_learn_done || step?.step_resources_done || step?.reflection_text) {
          status = 'in_progress';
        } else {
          status = 'not_started';
        }

        return {
          domain,
          latest_score: latestScore,
          best_score: bestScore,
          status,
          priority: latestScore !== null && latestScore < 70,
          needs_baseline: latestScore === null,
          step_learn_done: step?.step_learn_done ?? false,
          step_resources_done: step?.step_resources_done ?? false,
          reflection_text: step?.reflection_text ?? null,
          content: DOMAIN_CONTENT[domain] ?? null,
          resources: DOMAIN_RESOURCES[domain] ?? [],
        };
      });

      const stageCleared = stageDomains.every(d => d.status === 'completed');
      const isAtSecondary = currentStage === 'secondary';
      const teachingMethodologyUnlocked = isAtSecondary && stageCleared;

      // If stage cleared, also build next-stage domain stubs
      let nextStageDomains: any[] = [];
      if (stageCleared && nextStage) {
        nextStageDomains = domains.map(domain => {
          const stepKey = `${subject}_${nextStage}_${domain}`;
          const step = stepsMap.get(stepKey);
          return {
            domain,
            latest_score: null,
            best_score: null,
            status: step?.step_learn_done || step?.step_resources_done ? 'in_progress' : 'not_started',
            priority: false,
            needs_baseline: true,
            step_learn_done: step?.step_learn_done ?? false,
            step_resources_done: step?.step_resources_done ?? false,
            reflection_text: step?.reflection_text ?? null,
            content: DOMAIN_CONTENT[domain] ?? null,
            resources: DOMAIN_RESOURCES[domain] ?? [],
          };
        });
      }

      result[subject] = {
        current_stage: currentStage,
        stage_cleared: stageCleared,
        next_stage: nextStage,
        next_stage_unlocked: stageCleared && !!nextStage,
        teaching_methodology_unlocked: teachingMethodologyUnlocked,
        teaching_methodology: teachingMethodologyUnlocked ? TEACHING_METHODOLOGY : null,
        domains: stageDomains,
        next_stage_domains: nextStageDomains,
      };
    }

    return result;
  }

  async saveStep(data: {
    teacher_id: string;
    subject: string;
    stage: string;
    domain: string;
    academic_year: string;
    step_learn_done?: boolean;
    step_resources_done?: boolean;
    reflection_text?: string;
  }) {
    const existing = await this.stepRepo.findOne({
      where: {
        teacher_id: data.teacher_id,
        subject: data.subject,
        stage: data.stage,
        domain: data.domain,
        academic_year: data.academic_year,
      },
    });

    if (existing) {
      if (data.step_learn_done !== undefined) existing.step_learn_done = data.step_learn_done;
      if (data.step_resources_done !== undefined) existing.step_resources_done = data.step_resources_done;
      if (data.reflection_text !== undefined) existing.reflection_text = data.reflection_text;
      return this.stepRepo.save(existing);
    }

    const entity = this.stepRepo.create();
    entity.teacher_id = data.teacher_id;
    entity.subject = data.subject;
    entity.stage = data.stage;
    entity.domain = data.domain;
    entity.academic_year = data.academic_year ?? '';
    entity.step_learn_done = data.step_learn_done ?? false;
    entity.step_resources_done = data.step_resources_done ?? false;
    entity.reflection_text = data.reflection_text ?? undefined as any;
    return this.stepRepo.save(entity);
  }

  // Used by portfolio to show stage badges
  async getStageSummary(teacher_id: string, academic_year: string) {
    const modules = await this.getModules(teacher_id, academic_year);
    return {
      literacy: {
        current_stage: modules.literacy.current_stage,
        stage_cleared: modules.literacy.stage_cleared,
        next_stage: modules.literacy.next_stage,
        domains_completed: modules.literacy.domains.filter((d: any) => d.status === 'completed').length,
        domains_total: modules.literacy.domains.length,
      },
      numeracy: {
        current_stage: modules.numeracy.current_stage,
        stage_cleared: modules.numeracy.stage_cleared,
        next_stage: modules.numeracy.next_stage,
        domains_completed: modules.numeracy.domains.filter((d: any) => d.status === 'completed').length,
        domains_total: modules.numeracy.domains.length,
      },
    };
  }
}
