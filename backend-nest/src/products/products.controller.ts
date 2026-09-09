import { Body, Controller, Get, Param, Patch, Post, Req, Res } from '@nestjs/common';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get('services')
  services(@Req() request: { headers: { cookie?: string } }) {
    return this.products.services(request.headers.cookie);
  }

  @Post('services')
  async createService(@Body() body: unknown, @Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    const upstream = await this.products.saveService(body, request.headers.cookie);
    response.status(upstream.status).type('application/json').send(upstream.body);
  }

  @Patch('services/:id')
  async updateService(@Param('id') id: string, @Body() body: unknown, @Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    const upstream = await this.products.saveService(body, request.headers.cookie, id);
    response.status(upstream.status).type('application/json').send(upstream.body);
  }

  @Get()
  list(@Req() request: { headers: { cookie?: string } }) {
    return this.products.list(request.headers.cookie);
  }

  @Post()
  async create(@Body() body: unknown, @Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    const upstream = await this.products.save(body, request.headers.cookie);
    response.status(upstream.status).type('application/json').send(upstream.body);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: unknown, @Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    const upstream = await this.products.save(body, request.headers.cookie, id);
    response.status(upstream.status).type('application/json').send(upstream.body);
  }
}
