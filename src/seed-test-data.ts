/**
 * Test Data Seed Script
 * Run: npx ts-node --transpile-only src/seed-test-data.ts
 */
import * as http from 'http';

const API_HOST = 'localhost';
const API_PORT = 3000;
const ACADEMIC_YEAR = '2025-26';

function get(path: string): Promise<any> {
  return new Promise((resolve, reject) => {
    http.get({ host: API_HOST, port: API_PORT, path }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
    }).on('error', reject);
  });
}

function post(path: string, body: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request({
      host: API_HOST, port: API_PORT, path,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

const rand = (min: number, max: number) => Math.round(Math.random() * (max - min) + min);

async function seedRound(grade: string, section: string, stage: string, roundKey: string, roundNum: number, students: any[], minScore = 45, maxScore = 90) {
  const entries = students.map((s: any) => ({
    student_id: s.id,
    student_name: s.name,
    literacy: { Listening: rand(minScore, maxScore), Speaking: rand(minScore, maxScore), Reading: rand(minScore, maxScore), Writing: rand(minScore, maxScore) },
    numeracy: { Operations: rand(minScore, maxScore), 'Base 10': rand(minScore, maxScore), Measurement: rand(minScore, maxScore), Geometry: rand(minScore, maxScore) },
  }));
  const result = await post('/baseline/section/round', {
    grade, section, academic_year: ACADEMIC_YEAR,
    round: roundKey, stage,
    assessment_date: `2025-0${roundNum + 5}-15`,
    entries,
  });
  console.log(`  ✅ Round ${roundNum} saved — ${result.saved || 0} students`);
}

async function main() {
  console.log('\n🌱 Seeding test data...\n');
  const res = await get('/students?limit=200');
  const allStudents: any[] = res.data || res || [];
  if (!allStudents.length) {
    console.log('❌ No students found. Add students in admin login first.');
    return;
  }
  const groups: Record<string, any[]> = {};
  allStudents.filter((s: any) => s.is_active !== false).forEach((s: any) => {
    const key = `${s.current_class}||${s.section}`;
    if (!groups[key]) groups[key] = [];
    if (groups[key].length < 10) groups[key].push(s);
  });
  const stageMap: Record<string, string> = {
    'Pre-KG': 'foundation', 'LKG': 'foundation', 'UKG': 'foundation',
    'Grade 1': 'foundation', 'Grade 2': 'foundation',
    'Grade 3': 'preparatory', 'Grade 4': 'preparatory', 'Grade 5': 'preparatory',
    'Grade 6': 'middle', 'Grade 7': 'middle', 'Grade 8': 'middle',
    'Grade 9': 'secondary', 'Grade 10': 'secondary',
  };
  for (const [key, students] of Object.entries(groups).slice(0, 3)) {
    const [grade, section] = key.split('||');
    if (!grade || !section || grade === 'undefined') continue;
    const stage = stageMap[grade] || 'foundation';
    console.log(`\n📚 ${grade} — ${section} (${students.length} students)`);
    await seedRound(grade, section, stage, 'baseline_1', 1, students, 40, 72);
    await seedRound(grade, section, stage, 'baseline_2', 2, students, 52, 82);
    await seedRound(grade, section, stage, 'baseline_3', 3, students, 60, 92);
  }
  console.log('\n✅ Done! Open Teacher Dashboard → Class Management → 📊 Baseline Entry\n');
}

main().catch(console.error);
