import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { PasaService } from './pasa.service';
import { PasaController } from './pasa.controller';
import { ExamConfig } from './entities/exam-config.entity/exam-config.entity';
import { ExamMarks } from './entities/exam-marks.entity/exam-marks.entity';
import { Student } from '../students/entities/student.entity/student.entity';
import { SectionsModule } from '../sections/sections.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ExamConfig, ExamMarks, Student]),
    MulterModule.register(),
    SectionsModule,
  ],
  providers: [PasaService],
  controllers: [PasaController],
  exports: [PasaService],
})
export class PasaModule {}