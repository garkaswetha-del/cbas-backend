import { Module } from '@nestjs/common';
import { MemosService } from './memos.service';

@Module({
  providers: [MemosService],
  exports: [MemosService],
})
export class MemosModule {}
