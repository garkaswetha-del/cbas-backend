import { Controller, Get, Param } from '@nestjs/common';
import { PortfolioService } from './portfolio.service';

@Controller('portfolio')
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  @Get('teacher/:id')
  getTeacherPortfolio(@Param('id') id: string) {
    return this.portfolioService.getTeacherPortfolio(id);
  }
}
