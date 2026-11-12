import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

const GROQ_MODEL = 'openai/gpt-oss-120b'; // llama-3.3-70b-versatile was deprecated/removed by Groq

const FIELDS = [
  'name', 'email', 'contact_no', 'address', 'locality',
  'qualification', 'experience_years', 'experience_detail', 'skills',
  'guardian_name', 'religion', 'caste',
  'previous_salary', 'expected_salary', 'subject_applied_for', 'school_stage',
];

@Injectable()
export class HrResumeParserService {
  private readonly logger = new Logger(HrResumeParserService.name);

  async extractText(buffer: Buffer, filename: string): Promise<string> {
    const lower = (filename || '').toLowerCase();
    try {
      if (lower.endsWith('.pdf')) {
        const { PDFParse } = await import('pdf-parse');
        const parser = new PDFParse({ data: buffer });
        try {
          const result = await parser.getText();
          return result.text || '';
        } finally {
          await parser.destroy();
        }
      }
      if (lower.endsWith('.docx')) {
        const mammoth = await import('mammoth');
        const result = await mammoth.extractRawText({ buffer });
        return result.value || '';
      }
      // .doc (legacy binary) and anything else — not supported, caller falls back to extra_json
      return '';
    } catch (e) {
      this.logger.warn(`Could not extract text from ${filename}: ${(e as Error).message}`);
      return '';
    }
  }

  // Returns a plain object with whatever fields Groq could find — every field
  // nullable, matching "skip what's not on the resume."
  async extractFields(resumeText: string): Promise<Record<string, any>> {
    const groqKey = process.env.GROQ_API_KEY || '';
    if (!groqKey || !resumeText.trim()) return {};

    const prompt = `You are extracting structured fields from a job applicant's resume text for a school's HR system.
Return STRICT JSON ONLY (no markdown, no commentary) with exactly these keys: ${FIELDS.join(', ')}.
- experience_years and previous_salary/expected_salary must be plain numbers (or null), not strings.
- If a field genuinely isn't present in the text, use null — never guess or invent a value.
- "locality" means the area/neighbourhood/city they live in (for a commute-distance check), not their full address.
- "guardian_name" means father's or husband's name, if mentioned.
- "subject_applied_for" is the teaching subject they're applying for. If not stated explicitly, infer it from the subject(s) they're described as having taught in their experience section (e.g. "taught Science to grades 6-8" → Science). If they've taught multiple subjects, pick the most recent/primary one. If there's no teaching experience at all (fresher) or nothing indicates a subject, use null — don't guess.
- "school_stage" must be exactly one of: Foundation, Preparatory, Middle, Secondary (or null). Infer it from the grade/class levels mentioned in their experience (India's NCF stage mapping: Nursery/LKG/UKG/Grades 1-2 = Foundation, Grades 3-5 = Preparatory, Grades 6-8 = Middle, Grades 9-12 = Secondary). If multiple stages are mentioned, pick the one tied to their most recent/primary role. If there's no teaching experience or no grade levels mentioned, use null — don't guess.
- "skills" is a short comma-separated list of their key skills/competencies as stated on the resume (e.g. "Smart board teaching, NCERT curriculum, spoken English") — not a copy of their whole experience section.

Resume text:
"""
${resumeText.slice(0, 12000)}
"""

Respond with only the JSON object.`;

    try {
      const res = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: GROQ_MODEL,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0,
          response_format: { type: 'json_object' },
        },
        { headers: { Authorization: `Bearer ${groqKey}` }, timeout: 30000 },
      );
      const content = res.data?.choices?.[0]?.message?.content || '{}';
      const parsed = JSON.parse(content);
      const clean: Record<string, any> = {};
      for (const f of FIELDS) if (parsed[f] !== undefined) clean[f] = parsed[f];
      return clean;
    } catch (e) {
      this.logger.warn(`Groq extraction failed: ${(e as Error).message}`);
      return {};
    }
  }

  // NCF-aligned interview questions, scoped to the subject + school stage the candidate applied
  // for. Each comes with a model/expected answer, since the interviewer sitting in may not be a
  // subject expert themselves and needs a guide to judge the candidate's answer against.
  async generateInterviewQuestions(subject: string, stage: string): Promise<{ question: string; expected_answer: string }[]> {
    const groqKey = process.env.GROQ_API_KEY || '';
    if (!groqKey) return [];

    const prompt = `You are helping a school interviewer — who may NOT be an expert in this subject — prepare for a
teaching candidate's interview. Generate 10 interview questions aligned with India's National Curriculum Framework
(NCF), for a candidate applying to teach ${subject || 'a general subject'} at the ${stage || 'unspecified'} stage
(Foundation/Preparatory/Middle/Secondary).

At least 6 of the 10 must be concrete, subject-specific scenario/case questions — a realistic classroom situation
tied to actual ${subject || 'subject'} content at that stage (e.g. a common student misconception, how to explain a
specific topic, how to handle a wrong answer on a specific concept) — not generic teaching-method questions. The
remaining questions can cover pedagogy, classroom management, or child development appropriate for that stage.

For EVERY question, also give a clear "expected_answer": a model answer or the key points a good answer should
hit, written so a non-subject-expert interviewer can read it and judge whether the candidate's response is on
the right track.

Return STRICT JSON ONLY (no markdown, no commentary):
{ "questions": [ { "question": "...", "expected_answer": "..." }, ... ] }`;

    try {
      const res = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: GROQ_MODEL,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.5,
          response_format: { type: 'json_object' },
        },
        { headers: { Authorization: `Bearer ${groqKey}` }, timeout: 30000 },
      );
      const content = res.data?.choices?.[0]?.message?.content || '{}';
      const parsed = JSON.parse(content);
      const list = Array.isArray(parsed.questions) ? parsed.questions : [];
      return list
        .filter((q: any) => q && (typeof q === 'string' || q.question))
        .map((q: any) => typeof q === 'string' ? { question: q, expected_answer: '' } : { question: q.question, expected_answer: q.expected_answer || '' });
    } catch (e) {
      this.logger.warn(`Groq question generation failed: ${(e as Error).message}`);
      return [];
    }
  }
}
