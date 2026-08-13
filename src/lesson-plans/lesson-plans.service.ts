import { Injectable, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import axios from 'axios';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse');

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

@Injectable()
export class LessonPlansService implements OnModuleInit {
  constructor(private dataSource: DataSource) {}

  async onModuleInit() {
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS teacher_teaching_profiles (
        id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        teacher_id           VARCHAR NOT NULL UNIQUE,
        talk_ratio           VARCHAR(10)  NOT NULL DEFAULT '40:60',
        learning_approach    VARCHAR(50)  NOT NULL DEFAULT 'student-centric',
        collaboration_mode   VARCHAR(50)  NOT NULL DEFAULT 'small-groups',
        blooms_level         VARCHAR(50)  NOT NULL DEFAULT 'apply',
        learning_style       VARCHAR(50)  NOT NULL DEFAULT 'mixed',
        real_world_connection VARCHAR(50) NOT NULL DEFAULT 'strong',
        differentiation      VARCHAR(50)  NOT NULL DEFAULT 'two-tiers',
        technology_use       VARCHAR(50)  NOT NULL DEFAULT 'both',
        skills_21c           TEXT[]       NOT NULL DEFAULT ARRAY['critical-thinking','collaboration'],
        learning_type        VARCHAR(50)  NOT NULL DEFAULT 'activity-based',
        art_integration      BOOLEAN      NOT NULL DEFAULT false,
        art_type             VARCHAR(50),
        hots                 BOOLEAN      NOT NULL DEFAULT true,
        formative_assessment VARCHAR(50)  NOT NULL DEFAULT 'exit-ticket',
        questioning_technique VARCHAR(50) NOT NULL DEFAULT 'probing',
        inclusion_level      VARCHAR(50)  NOT NULL DEFAULT 'two-tiers',
        tlm_type             VARCHAR(50)  NOT NULL DEFAULT 'both',
        created_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ncert_chapters (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        grade          VARCHAR(50)   NOT NULL,
        subject        VARCHAR(255)  NOT NULL,
        chapter_number INTEGER       NOT NULL,
        chapter_name   VARCHAR(500)  NOT NULL,
        content_text   TEXT          NOT NULL,
        uploaded_by    VARCHAR,
        created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE (grade, subject, chapter_number)
      )
    `);
    await this.dataSource.query(`CREATE INDEX IF NOT EXISTS idx_ncert_grade_subject ON ncert_chapters(grade, subject)`);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS lesson_plans (
        id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        teacher_id                VARCHAR      NOT NULL,
        academic_year             VARCHAR(10)  NOT NULL,
        grade                     VARCHAR(50)  NOT NULL,
        section                   VARCHAR(50)  NOT NULL,
        subject                   VARCHAR(255) NOT NULL,
        chapter_name              VARCHAR(500),
        lesson_name               VARCHAR(500),
        date                      DATE,
        duration                  INTEGER,
        focus_question            TEXT,
        learning_objectives       TEXT,
        rework                    TEXT,
        key_vocabulary            TEXT,
        possible_misconceptions   TEXT,
        materials                 TEXT,
        digital_resources         TEXT,
        tech_contingency          TEXT,
        differentiation_strategies TEXT,
        interdisciplinary_approach TEXT,
        engage_content            TEXT,
        engage_duration           INTEGER,
        explore_content           TEXT,
        explore_duration          INTEGER,
        explain_content           TEXT,
        explain_duration          INTEGER,
        extend_content            TEXT,
        extend_duration           INTEGER,
        evaluate_content          TEXT,
        evaluate_duration         INTEGER,
        homework                  TEXT,
        worksheet_content         TEXT,
        ai_parameters             JSONB,
        source                    VARCHAR(20)  NOT NULL DEFAULT 'digital',
        status                    VARCHAR(20)  NOT NULL DEFAULT 'draft',
        submitted_at              TIMESTAMP WITH TIME ZONE,
        created_at                TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at                TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await this.dataSource.query(`CREATE INDEX IF NOT EXISTS idx_lp_teacher ON lesson_plans(teacher_id, academic_year)`);
    await this.dataSource.query(`CREATE INDEX IF NOT EXISTS idx_lp_status  ON lesson_plans(status, academic_year)`);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS lesson_plan_comments (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        lesson_plan_id  UUID         NOT NULL REFERENCES lesson_plans(id) ON DELETE CASCADE,
        reviewer_id     VARCHAR      NOT NULL,
        reviewer_name   VARCHAR      NOT NULL,
        reviewer_role   VARCHAR      NOT NULL,
        comment         TEXT         NOT NULL,
        status_set      VARCHAR(20),
        created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS teacher_reflections (
        id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        teacher_id                  VARCHAR NOT NULL,
        date                        DATE    NOT NULL,
        day_of_week                 VARCHAR(20),
        what_went_well              TEXT,
        challenges_faced            TEXT,
        improvements_for_tomorrow   TEXT,
        miscellaneous_notes         TEXT,
        notes                       TEXT,
        created_at                  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at                  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE (teacher_id, date)
      )
    `);
    await this.dataSource.query(`CREATE INDEX IF NOT EXISTS idx_reflection_teacher ON teacher_reflections(teacher_id, date)`);
  }

  // ── Teaching Profile ──────────────────────────────────────────────────────

  async getProfile(teacher_id: string) {
    const rows = await this.dataSource.query(
      `SELECT * FROM teacher_teaching_profiles WHERE teacher_id=$1`, [teacher_id],
    );
    return rows[0] ?? null;
  }

  async saveProfile(teacher_id: string, params: any) {
    await this.dataSource.query(
      `INSERT INTO teacher_teaching_profiles
         (teacher_id, talk_ratio, learning_approach, collaboration_mode, blooms_level,
          learning_style, real_world_connection, differentiation, technology_use,
          skills_21c, learning_type, art_integration, art_type, hots,
          formative_assessment, questioning_technique, inclusion_level, tlm_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       ON CONFLICT (teacher_id) DO UPDATE SET
         talk_ratio=$2, learning_approach=$3, collaboration_mode=$4, blooms_level=$5,
         learning_style=$6, real_world_connection=$7, differentiation=$8, technology_use=$9,
         skills_21c=$10, learning_type=$11, art_integration=$12, art_type=$13, hots=$14,
         formative_assessment=$15, questioning_technique=$16, inclusion_level=$17, tlm_type=$18,
         updated_at=NOW()`,
      [teacher_id, params.talk_ratio, params.learning_approach, params.collaboration_mode,
       params.blooms_level, params.learning_style, params.real_world_connection,
       params.differentiation, params.technology_use,
       params.skills_21c || ['critical-thinking', 'collaboration'],
       params.learning_type, params.art_integration ?? false, params.art_type || null,
       params.hots ?? true, params.formative_assessment, params.questioning_technique,
       params.inclusion_level, params.tlm_type],
    );
    return { ok: true };
  }

  // ── NCERT Chapters ────────────────────────────────────────────────────────

  async parsePdfBuffer(buffer: Buffer): Promise<string> {
    const data = await pdfParse(buffer);
    return data.text || '';
  }

  async uploadChapter(data: {
    grade: string; subject: string; chapter_number: number;
    chapter_name: string; content_text: string; uploaded_by: string;
  }) {
    await this.dataSource.query(
      `INSERT INTO ncert_chapters (grade, subject, chapter_number, chapter_name, content_text, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (grade, subject, chapter_number) DO UPDATE SET
         chapter_name=$4, content_text=$5, uploaded_by=$6, updated_at=NOW()`,
      [data.grade, data.subject, data.chapter_number, data.chapter_name, data.content_text, data.uploaded_by],
    );
    return { ok: true };
  }

  async getChapters(grade: string, subject: string) {
    return this.dataSource.query(
      `SELECT id, grade, subject, chapter_number, chapter_name, uploaded_by, created_at
       FROM ncert_chapters WHERE grade=$1 AND subject=$2 ORDER BY chapter_number`,
      [grade, subject],
    );
  }

  async getAllChapterMeta() {
    return this.dataSource.query(
      `SELECT DISTINCT grade, subject FROM ncert_chapters ORDER BY grade, subject`,
    );
  }

  async deleteChapter(id: string) {
    await this.dataSource.query(`DELETE FROM ncert_chapters WHERE id=$1`, [id]);
    return { ok: true };
  }

  // ── Lesson Plans CRUD ─────────────────────────────────────────────────────

  async createLessonPlan(data: any) {
    const rows = await this.dataSource.query(
      `INSERT INTO lesson_plans
         (teacher_id, academic_year, grade, section, subject, chapter_name, lesson_name, date, duration, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [data.teacher_id, data.academic_year, data.grade, data.section, data.subject,
       data.chapter_name || null, data.lesson_name || null,
       data.date || null, data.duration || null, 'digital'],
    );
    return rows[0];
  }

  async updateLessonPlan(id: string, data: any) {
    const allowed = [
      'chapter_name','lesson_name','date','duration','focus_question',
      'learning_objectives','rework','key_vocabulary','possible_misconceptions',
      'materials','digital_resources','tech_contingency','differentiation_strategies',
      'interdisciplinary_approach','engage_content','engage_duration',
      'explore_content','explore_duration','explain_content','explain_duration',
      'extend_content','extend_duration','evaluate_content','evaluate_duration',
      'homework','worksheet_content','ai_parameters','source',
    ];
    const keys = allowed.filter(k => data[k] !== undefined);
    if (!keys.length) return { ok: true };
    const setClauses = keys.map((k, i) => `${k}=$${i + 2}`).join(', ');
    await this.dataSource.query(
      `UPDATE lesson_plans SET ${setClauses}, updated_at=NOW() WHERE id=$1`,
      [id, ...keys.map(k => data[k])],
    );
    return { ok: true };
  }

  async getLessonPlans(teacher_id: string, academic_year: string) {
    return this.dataSource.query(
      `SELECT lp.*,
         COALESCE(json_agg(c ORDER BY c.created_at) FILTER (WHERE c.id IS NOT NULL), '[]') AS comments
       FROM lesson_plans lp
       LEFT JOIN lesson_plan_comments c ON c.lesson_plan_id = lp.id
       WHERE lp.teacher_id=$1 AND lp.academic_year=$2
       GROUP BY lp.id
       ORDER BY lp.created_at DESC`,
      [teacher_id, academic_year],
    );
  }

  async getLessonPlan(id: string) {
    const rows = await this.dataSource.query(
      `SELECT lp.*,
         COALESCE(json_agg(c ORDER BY c.created_at) FILTER (WHERE c.id IS NOT NULL), '[]') AS comments
       FROM lesson_plans lp
       LEFT JOIN lesson_plan_comments c ON c.lesson_plan_id = lp.id
       WHERE lp.id=$1
       GROUP BY lp.id`,
      [id],
    );
    return rows[0] ?? null;
  }

  async getAllLessonPlans(academic_year: string, grade?: string, status?: string) {
    let q = `SELECT lp.*, u.name AS teacher_name
             FROM lesson_plans lp
             LEFT JOIN users u ON u.id::text = lp.teacher_id
             WHERE lp.academic_year=$1`;
    const params: any[] = [academic_year];
    if (grade)  { params.push(grade);  q += ` AND lp.grade=$${params.length}`; }
    if (status) { params.push(status); q += ` AND lp.status=$${params.length}`; }
    q += ' ORDER BY u.name, lp.created_at DESC';
    return this.dataSource.query(q, params);
  }

  async submitLessonPlan(id: string) {
    await this.dataSource.query(
      `UPDATE lesson_plans SET status='submitted', submitted_at=NOW(), updated_at=NOW() WHERE id=$1`, [id],
    );
    return { ok: true };
  }

  async deleteLessonPlan(id: string) {
    await this.dataSource.query(
      `DELETE FROM lesson_plans WHERE id=$1 AND status='draft'`, [id],
    );
    return { ok: true };
  }

  // ── Comments ──────────────────────────────────────────────────────────────

  async addComment(lesson_plan_id: string, data: {
    reviewer_id: string; reviewer_name: string; reviewer_role: string;
    comment: string; status_set?: string;
  }) {
    await this.dataSource.query(
      `INSERT INTO lesson_plan_comments (lesson_plan_id, reviewer_id, reviewer_name, reviewer_role, comment, status_set)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [lesson_plan_id, data.reviewer_id, data.reviewer_name, data.reviewer_role, data.comment, data.status_set || null],
    );
    if (data.status_set) {
      await this.dataSource.query(
        `UPDATE lesson_plans SET status=$1, updated_at=NOW() WHERE id=$2`,
        [data.status_set, lesson_plan_id],
      );
    }
    return { ok: true };
  }

  // ── Groq AI helpers ───────────────────────────────────────────────────────

  private async callGroq(prompt: string, maxTokens = 2000): Promise<string> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error('GROQ_API_KEY not set');
    const resp = await axios.post(GROQ_URL, {
      model: GROQ_MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.7,
    }, {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      timeout: 60000,
    });
    return resp.data.choices[0].message.content as string;
  }

  private parseJson(text: string): any {
    try { return JSON.parse(text); } catch { /* empty */ }
    const m = text.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error('AI did not return valid JSON');
  }

  private defaultProfile() {
    return {
      talk_ratio: '40:60', learning_approach: 'student-centric',
      collaboration_mode: 'small-groups', blooms_level: 'apply',
      learning_style: 'mixed', real_world_connection: 'strong',
      differentiation: 'two-tiers', technology_use: 'both',
      skills_21c: ['critical-thinking', 'collaboration'],
      learning_type: 'activity-based', art_integration: false,
      art_type: null, hots: true, formative_assessment: 'exit-ticket',
      questioning_technique: 'probing', inclusion_level: 'two-tiers', tlm_type: 'both',
    };
  }

  // ── AI: Generate Lesson Plan ──────────────────────────────────────────────

  async generateLessonPlan(data: {
    teacher_id: string; grade: string; subject: string;
    chapter_name: string; lesson_name: string;
    focus_question: string; duration: number;
    parameter_overrides?: any;
  }) {
    const chapterRows = await this.dataSource.query(
      `SELECT content_text FROM ncert_chapters
       WHERE grade=$1 AND subject=$2 AND chapter_name ILIKE $3 LIMIT 1`,
      [data.grade, data.subject, `%${data.chapter_name}%`],
    );
    const chapterContent = (chapterRows[0]?.content_text || '').slice(0, 30000);

    const storedProfile = await this.getProfile(data.teacher_id);
    const params = { ...this.defaultProfile(), ...(storedProfile || {}), ...(data.parameter_overrides || {}) };
    const [teacherPct, studentPct] = (params.talk_ratio || '40:60').split(':');

    const prompt = `You are a CBSE-aligned lesson plan writer for Wisdom School, India.

Grade: ${data.grade} | Subject: ${data.subject}
Chapter: ${data.chapter_name} | Lesson: ${data.lesson_name}
Focus Question: ${data.focus_question}
Total Duration: ${data.duration} minutes

NCERT CHAPTER CONTENT:
${chapterContent}

TEACHING PARAMETERS:
- Talk Ratio: Teacher ${teacherPct}% / Students ${studentPct}%
- Learning Approach: ${params.learning_approach}
- Collaboration Mode: ${params.collaboration_mode}
- Bloom's Taxonomy Level: ${params.blooms_level}
- Learning Style Focus: ${params.learning_style}
- Real-World / Indian Context: ${params.real_world_connection}
- Differentiation: ${params.differentiation}
- Technology Use: ${params.technology_use}
- 21st Century Skills: ${(params.skills_21c || []).join(', ')}
- Learning Type: ${params.learning_type}
- Art Integration: ${params.art_integration ? (params.art_type || 'yes') : 'none'}
- HOTS: ${params.hots ? 'yes — include at least one higher-order thinking question in Evaluate' : 'no'}
- Formative Assessment: ${params.formative_assessment}
- Questioning Technique: ${params.questioning_technique}
- Inclusion Level: ${params.inclusion_level}
- TLM: ${params.tlm_type}

RULES:
- All lesson content must come directly from the NCERT chapter provided.
- Students must be actively engaged ${studentPct}% of the time.
- The five 5E durations must sum to exactly ${data.duration} minutes.
- Use Indian / local examples wherever natural.
- If HOTS is yes, include a higher-order thinking question in Evaluate.
- Return ONLY valid JSON, no markdown fences, no extra text.

JSON structure:
{
  "learning_objectives": "2-3 clear objectives",
  "key_vocabulary": "5-7 key terms with brief meanings",
  "possible_misconceptions": "2-3 common student errors",
  "materials": "physical materials needed",
  "digital_resources": "specific videos, simulations or tools",
  "tech_contingency": "offline backup if technology fails",
  "differentiation_strategies": "strategies for struggling and advanced learners",
  "interdisciplinary_approach": "link to another subject",
  "engage_content": "hook activity description",
  "engage_duration": 5,
  "explore_content": "hands-on discovery activity",
  "explore_duration": 10,
  "explain_content": "direct instruction and concept explanation",
  "explain_duration": 15,
  "extend_content": "application or project activity",
  "extend_duration": 10,
  "evaluate_content": "formative check or exit ticket",
  "evaluate_duration": 5,
  "rework": "remediation strategy for students who did not meet objectives",
  "homework": "specific task linked to today's learning"
}`;

    const text = await this.callGroq(prompt, 2000);
    const generated = this.parseJson(text);
    return { ...generated, source: 'ai_generated', ai_parameters: params };
  }

  // ── AI: Generate Worksheet ────────────────────────────────────────────────

  async generateWorksheet(id: string) {
    const plan = await this.getLessonPlan(id);
    if (!plan) throw new Error('Lesson plan not found');

    const prompt = `Create a student worksheet for CBSE Grade ${plan.grade} ${plan.subject}.
Chapter: ${plan.chapter_name} | Lesson: ${plan.lesson_name}
Learning Objectives: ${plan.learning_objectives}
Bloom's Level: ${plan.ai_parameters?.blooms_level || 'apply'}

Engage activity: ${plan.engage_content}
Explore activity: ${plan.explore_content}
Explain: ${plan.explain_content}
Extend: ${plan.extend_content}

Return ONLY valid JSON, no markdown fences:
{
  "title": "worksheet title",
  "warm_up": "1-2 warm-up questions",
  "explore_activity": "step-by-step instructions for students during Explore",
  "concept_check": "3-4 questions to check understanding after Explain",
  "application": "1-2 application questions matching the Bloom's level",
  "exit_ticket": "1 exit ticket question"
}`;

    const text = await this.callGroq(prompt, 1200);
    const worksheet = this.parseJson(text);
    await this.dataSource.query(
      `UPDATE lesson_plans SET worksheet_content=$1, updated_at=NOW() WHERE id=$2`,
      [JSON.stringify(worksheet), id],
    );
    return worksheet;
  }

  // ── AI: Generate Homework ─────────────────────────────────────────────────

  async generateHomework(id: string) {
    const plan = await this.getLessonPlan(id);
    if (!plan) throw new Error('Lesson plan not found');

    const prompt = `Create homework for CBSE Grade ${plan.grade} ${plan.subject} students.
Chapter: ${plan.chapter_name} | Lesson: ${plan.lesson_name}
Learning Objectives: ${plan.learning_objectives}
Bloom's Level: ${plan.ai_parameters?.blooms_level || 'apply'}
Today's content: ${plan.explain_content}

Generate 2-3 homework tasks appropriate for Grade ${plan.grade} students.
Return ONLY valid JSON, no markdown fences:
{
  "instructions": "brief instruction text for students",
  "tasks": ["Task 1", "Task 2", "Task 3"]
}`;

    const text = await this.callGroq(prompt, 600);
    const hw = this.parseJson(text);
    await this.dataSource.query(
      `UPDATE lesson_plans SET homework=$1, updated_at=NOW() WHERE id=$2`,
      [JSON.stringify(hw), id],
    );
    return hw;
  }

  // ── Teacher Reflections ───────────────────────────────────────────────────

  async saveReflection(data: any) {
    const rows = await this.dataSource.query(
      `INSERT INTO teacher_reflections
         (teacher_id, date, day_of_week, what_went_well, challenges_faced,
          improvements_for_tomorrow, miscellaneous_notes, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (teacher_id, date) DO UPDATE SET
         day_of_week=$3, what_went_well=$4, challenges_faced=$5,
         improvements_for_tomorrow=$6, miscellaneous_notes=$7, notes=$8, updated_at=NOW()
       RETURNING *`,
      [data.teacher_id, data.date, data.day_of_week || null, data.what_went_well || null,
       data.challenges_faced || null, data.improvements_for_tomorrow || null,
       data.miscellaneous_notes || null, data.notes || null],
    );
    return rows[0];
  }

  async getReflections(teacher_id: string, month: string) {
    return this.dataSource.query(
      `SELECT * FROM teacher_reflections
       WHERE teacher_id=$1 AND to_char(date,'YYYY-MM')=$2 ORDER BY date`,
      [teacher_id, month],
    );
  }

  async getAllReflections(date_from: string, date_to: string) {
    return this.dataSource.query(
      `SELECT r.*, u.name AS teacher_name
       FROM teacher_reflections r
       LEFT JOIN users u ON u.id::text = r.teacher_id
       WHERE r.date BETWEEN $1 AND $2
       ORDER BY r.date DESC, u.name`,
      [date_from, date_to],
    );
  }
}
