import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

const GROQ_MODEL = 'llama-3.3-70b-versatile'; // same model already used elsewhere in this app

const FIELDS = [
  'name', 'email', 'contact_no', 'address', 'locality',
  'qualification', 'experience_years', 'experience_detail', 'skills',
  'guardian_name', 'religion', 'caste',
  'previous_salary', 'expected_salary', 'subject_applied_for',
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
- "subject_applied_for" is the teaching subject they're applying for, if stated.
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
}
