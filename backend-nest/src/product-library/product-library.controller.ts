import { Body, Controller, Get, Param, Patch, Post, Req, Res } from '@nestjs/common';
import { ProductLibraryService } from './product-library.service';

@Controller('product-library')
export class ProductLibraryController {
  constructor(private readonly library: ProductLibraryService) {}

  @Get()
  list(@Req() request: { headers: { cookie?: string } }) {
    return this.library.list(request.headers.cookie);
  }

  @Post()
  async create(@Body() body: unknown, @Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    const upstream = await this.library.save(body, request.headers.cookie);
    response.status(upstream.status).type('application/json').send(upstream.body);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: unknown, @Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    const upstream = await this.library.save(body, request.headers.cookie, id);
    response.status(upstream.status).type('application/json').send(upstream.body);
  }
}
