import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ObservationService } from './observation.service';
import { ObservationController } from './observation.controller';
import { TeacherObservation } from './entities/teacher-observation.entity/teacher-observation.entity';
import { User } from '../users/entities/user.entity/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([TeacherObservation, User])],
  providers: [ObservationService],
  controllers: [ObservationController],
  exports: [ObservationService],
})
export class ObservationModule {}