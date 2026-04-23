import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../../../users/entities/user.entity/user.entity';

@Entity('teacher_appraisals')
export class TeacherAppraisal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  teacher_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'teacher_id' })
  teacher: User;

  @Column({ nullable: true })
  teacher_name: string;

  @Column({ nullable: true })
  role: string;

  @Column({ nullable: true })
  subject: string;

  @Column({ nullable: true })
  class_assigned: string;

  @Column({ nullable: true })
  section: string;

  @Column({ nullable: true })
  qualification: string;

  @Column({ nullable: true })
  experience: string;

  @Column({ nullable: true })
  date_of_joining: string;

  @Column({ nullable: true })
  academic_year: string;

  // NURSERY-SPECIFIC (Pre-KG / LKG / UKG)
  @Column({ nullable: true })
  literacy_band: string;

  @Column({ nullable: true })
  numeracy_band: string;

  @Column({ type: 'decimal', precision: 5, scale: 4, default: 0 })
  literacy_score: number;

  @Column({ type: 'decimal', precision: 5, scale: 4, default: 0 })
  numeracy_score: number;

  // EXAM MARKS
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  pa1: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  pa2: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  pa3: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  pa4: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  sa1: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  sa2: number;

  @Column({ nullable: true })
  exam_others: string;

  @Column({ type: 'decimal', precision: 5, scale: 4, default: 0 })
  exam_score: number;

  // SKILLS & KNOWLEDGE
  @Column({ nullable: true })
  workshops: string;

  @Column({ nullable: true })
  training_sessions: string;

  @Column({ nullable: true })
  books_read: string;

  @Column({ nullable: true })
  articles_published: string;

  @Column({ nullable: true })
  teaching_strategies: string;

  @Column({ type: 'decimal', precision: 5, scale: 4, default: 0 })
  skills_score: number;

  // BEHAVIOUR & ATTITUDE
  @Column({ nullable: true })
  team_work: string;

  @Column({ nullable: true })
  attitude_towards_students: string;

  @Column({ nullable: true })
  commitment_to_values: string;

  @Column({ nullable: true })
  adaptability: string;

  @Column({ nullable: true })
  dressing: string;

  @Column({ type: 'decimal', precision: 5, scale: 4, default: 0 })
  behaviour_score: number;

  // PARENTS FEEDBACK
  @Column({ nullable: true })
  parents_feedback_band: string;

  @Column({ type: 'decimal', precision: 5, scale: 4, default: 0 })
  parents_feedback_score: number;

  // CLASSROOM TEACHING (single observation band)
  @Column({ nullable: true })
  classroom_observation_band: string;

  @Column({ type: 'decimal', precision: 5, scale: 4, default: 0 })
  classroom_score: number;

  // ENGLISH COMMUNICATION
  @Column({ nullable: true })
  english_comm_band: string;

  @Column({ type: 'decimal', precision: 5, scale: 4, default: 0 })
  english_comm_score: number;

  // RESPONSIBILITIES
  @Column({ nullable: true })
  committee_incharge: string;

  @Column({ default: false })
  resp_phonics: boolean;

  @Column({ default: false })
  resp_math: boolean;

  @Column({ default: false })
  resp_reading: boolean;

  @Column({ default: false })
  resp_handwriting: boolean;

  @Column({ default: false })
  resp_kannada_reading: boolean;

  @Column({ default: false })
  resp_notes_hw: boolean;

  @Column({ default: false })
  resp_library: boolean;

  @Column({ default: false })
  resp_parental_engagement: boolean;

  @Column({ default: false })
  resp_below_a_students: boolean;

  @Column({ default: false })
  resp_english_grammar: boolean;

  @Column({ default: false })
  resp_others: boolean;

  @Column({ type: 'decimal', precision: 5, scale: 4, default: 0 })
  responsibilities_score: number;

  // TOTALS
  @Column({ type: 'decimal', precision: 5, scale: 4, default: 0 })
  overall_score: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  overall_percentage: number;

  @Column({ default: false })
  is_shared: boolean;

  @Column({ nullable: true })
  shared_at: string | null;

  // COMMITTEE
  @Column({ nullable: true })
  committee_role: string;

  @Column({ nullable: true })
  committee_name: string;

  @Column({ type: 'text', nullable: true }) committee_role_comment: string;
  @Column({ type: 'text', nullable: true }) committee_name_comment: string;

  // COMMENTS — optional comment per field
  @Column({ type: 'text', nullable: true }) pa1_comment: string;
  @Column({ type: 'text', nullable: true }) pa2_comment: string;
  @Column({ type: 'text', nullable: true }) pa3_comment: string;
  @Column({ type: 'text', nullable: true }) pa4_comment: string;
  @Column({ type: 'text', nullable: true }) sa1_comment: string;
  @Column({ type: 'text', nullable: true }) sa2_comment: string;
  @Column({ type: 'text', nullable: true }) workshops_comment: string;
  @Column({ type: 'text', nullable: true }) training_sessions_comment: string;
  @Column({ type: 'text', nullable: true }) books_read_comment: string;
  @Column({ type: 'text', nullable: true }) articles_published_comment: string;
  @Column({ type: 'text', nullable: true }) teaching_strategies_comment: string;
  @Column({ type: 'text', nullable: true }) team_work_comment: string;
  @Column({ type: 'text', nullable: true }) attitude_towards_students_comment: string;
  @Column({ type: 'text', nullable: true }) commitment_to_values_comment: string;
  @Column({ type: 'text', nullable: true }) adaptability_comment: string;
  @Column({ type: 'text', nullable: true }) dressing_comment: string;
  @Column({ type: 'text', nullable: true }) parents_feedback_band_comment: string;
  @Column({ type: 'text', nullable: true }) obs_0_comment: string;
  @Column({ type: 'text', nullable: true }) english_comm_band_comment: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}