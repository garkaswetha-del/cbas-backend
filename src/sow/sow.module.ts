import { Module } from '@nestjs/common';
import { SowController } from './sow.controller';
import { SowService } from './sow.service';

@Module({
  controllers: [SowController],
  providers: [SowService],
  exports: [SowService],
})
export class SowModule {}
