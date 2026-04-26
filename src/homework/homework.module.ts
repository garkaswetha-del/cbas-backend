import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HomeworkRecord } from './entities/homework-record.entity';
import { HomeworkService } from './homework.service';
import { HomeworkController } from './homework.controller';
import { SectionsModule } from '../sections/sections.module';

@Module({
  imports: [TypeOrmModule.forFeature([HomeworkRecord]), SectionsModule],
  providers: [HomeworkService],
  controllers: [HomeworkController],
  exports: [HomeworkService],
})
export class HomeworkModule {}
