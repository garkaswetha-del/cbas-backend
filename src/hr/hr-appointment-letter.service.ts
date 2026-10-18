import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { HrApplicant } from './entities/hr-applicant.entity';

// Standard placeholder layout — the user has their own template to swap in later.
@Injectable()
export class HrAppointmentLetterService {
  async generate(applicant: HrApplicant, schoolName: string): Promise<string> {
    const doc = new PDFDocument({ size: 'A4', margin: 60 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>(resolve => doc.on('end', () => resolve(Buffer.concat(chunks))));

    const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });

    doc.fontSize(18).font('Helvetica-Bold').text(schoolName, { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(13).font('Helvetica').text('Appointment Letter', { align: 'center' });
    doc.moveDown(1.5);

    doc.fontSize(11).text(`Date: ${today}`);
    doc.moveDown(1);

    doc.text(`Dear ${applicant.name || 'Candidate'},`);
    doc.moveDown(0.8);

    const role = applicant.subject_applied_for ? `${applicant.subject_applied_for} Teacher` : 'Teacher';
    doc.text(
      `We are pleased to offer you the position of ${role}${applicant.school_stage ? ` (${applicant.school_stage} Stage)` : ''} ` +
      `at ${schoolName}. This letter confirms your appointment, subject to the terms and conditions to be ` +
      `communicated to you separately by the school administration.`,
      { align: 'justify' },
    );
    doc.moveDown(0.8);
    doc.text('Please report to the school office with your original documents on your date of joining, to complete the onboarding formalities.');
    doc.moveDown(0.8);
    doc.text('We look forward to welcoming you to our team.');
    doc.moveDown(2);

    doc.text('Sincerely,');
    doc.moveDown(2);
    doc.text('_____________________');
    doc.text('Principal / HR');
    doc.text(schoolName);

    doc.end();
    const buffer = await done;
    return `data:application/pdf;base64,${buffer.toString('base64')}`;
  }
}
