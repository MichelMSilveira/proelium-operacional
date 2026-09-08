import { Controller, Get, Req } from '@nestjs/common';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(@Req() request: { headers: { cookie?: string } }) {
    return this.products.list(request.headers.cookie).then((items) => ({ products: items }));
  }
}
