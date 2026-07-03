import { handleDeleteSale, handleGetSale, handlePutSale } from './handlers';
import type { Params } from './types';

export async function GET(req: Request, context: Params) {
  return handleGetSale(req, context);
}

export async function PUT(req: Request, context: Params) {
  return handlePutSale(req, context);
}

export async function DELETE(req: Request, context: Params) {
  return handleDeleteSale(req, context);
}
