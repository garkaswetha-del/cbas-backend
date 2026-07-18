import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import FormData from 'form-data';

export interface ParsedPeriod {
  teacher_name: string;
  day: string;
  period: number;
  raw: string;
  type: 'ACADEMIC' | 'CCA';
  grades: number[];
  classes: string[];
}

export interface ParsedTimetable {
  teachers: string[];
  periods: ParsedPeriod[];
}

@Injectable()
export class TimetableParserService {
  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  async parse(fileBuffer: Buffer, fileName: string): Promise<ParsedTimetable> {
    const baseUrl = this.config.get<string>('PYTHON_TIMETABLE_SERVICE_URL');

    const form = new FormData();
    form.append('file', fileBuffer, fileName);

    const response = await firstValueFrom(
      this.http.post<ParsedTimetable>(`${baseUrl}/parse-timetable`, form, {
        headers: form.getHeaders(),
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      }),
    );

    return response.data;
  }
}
