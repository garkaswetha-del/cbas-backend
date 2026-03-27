import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MappingsService } from './mappings.service';
import { MappingsController } from './mappings.controller';
import { TeacherMapping } from './entities/teacher-mapping.entity/teacher-mapping.entity';
import { User } from '../users/entities/user.entity/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([TeacherMapping, User])],
  providers: [MappingsService],
  controllers: [MappingsController],
  exports: [MappingsService],
})
export class MappingsModule {}