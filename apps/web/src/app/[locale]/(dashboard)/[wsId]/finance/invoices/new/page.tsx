import { Filter } from '../../../users/filters';
import { Invoice } from '@/types/primitives/Invoice';
import type { WorkspaceUser } from '@/types/primitives/WorkspaceUser';
import { createClient } from '@/utils/supabase/server';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@repo/ui/components/ui/card';
import FeatureSummary from '@repo/ui/components/ui/custom/feature-summary';
import { Separator } from '@repo/ui/components/ui/separator';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@repo/ui/components/ui/tabs';
import { Package, TicketPercent, User } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<{
    q: string;
    page: string;
    pageSize: string;
  }>;
}

export default async function WorkspaceInvoicesPage({
  params,
  searchParams,
}: Props) {
  const t = await getTranslations();
  const { wsId } = await params;
  await getData(wsId, await searchParams);

  const { data: users } = await getUsers(wsId);
  const { data: products } = await getProducts(wsId);
  const { data: promotions } = await getPromotions(wsId);

  return (
    <>
      <FeatureSummary
        pluralTitle={t('ws-invoices.new_invoice')}
        singularTitle={t('ws-invoices.new_invoice')}
      />
      <Separator className="my-4" />
      <Tabs defaultValue="standard" className="w-full">
        <TabsList className="grid w-fit grid-cols-2">
          <TabsTrigger value="standard">
            {t('ws-invoices.standard')}
          </TabsTrigger>
          <TabsTrigger value="subscription">
            {t('ws-invoices.subscription')}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="standard" className="grid w-full gap-4">
          <Card className="w-full">
            <CardHeader>
              <CardTitle>{t('invoice-data-table.customer')}</CardTitle>
              <CardDescription>
                Make changes to your account here. Click save when you're done.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Filter
                key="user-filter"
                tag="userId"
                title={t('user-data-table.user')}
                icon={<User className="mr-2 h-4 w-4" />}
                options={users.map((user) => ({
                  label: user.display_name || user.full_name || 'No name',
                  description: user.phone || user.email || '-',
                  icon: <User className="h-4 w-4" />,
                  value: user.id,
                }))}
                multiple={false}
              />
            </CardContent>
          </Card>
          <Card className="w-full">
            <CardHeader>
              <CardTitle>{t('invoices.products')}</CardTitle>
              <CardDescription>
                Make changes to your account here. Click save when you're done.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Filter
                key="product-filter"
                tag="productId"
                title={t('invoices.add-product')}
                icon={<Package className="mr-2 h-4 w-4" />}
                options={products.map((product) => ({
                  label: product.workspace_products?.name || 'No name',
                  description:
                    product?.price !== undefined
                      ? Intl.NumberFormat('vi-VN', {
                          style: 'currency',
                          currency: 'VND',
                        }).format(product?.price)
                      : '-',
                  icon: <Package className="h-4 w-4" />,
                  value: product.product_id,
                }))}
              />
            </CardContent>
          </Card>

          <Card className="w-full">
            <CardHeader>
              <CardTitle>{t('invoices.invoices')}</CardTitle>
              <CardDescription>
                Make changes to your account here. Click save when you're done.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Filter
                key="promotion-filter"
                tag="promotionId"
                title={t('invoices.add_promotion')}
                icon={<TicketPercent className="mr-2 h-4 w-4" />}
                options={promotions.map((promotion) => ({
                  label: promotion.name || '-',
                  description: promotion.use_ratio
                    ? `${promotion.value}%`
                    : Intl.NumberFormat('vi-VN', {
                        style: 'currency',
                        currency: 'VND',
                      }).format(promotion.value),
                  icon: <TicketPercent className="h-4 w-4" />,
                  value: promotion.id,
                }))}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}

async function getData(
  wsId: string,
  {
    q,
    page = '1',
    pageSize = '10',
  }: { q?: string; page?: string; pageSize?: string }
) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('finance_invoices')
    .select('*, customer:workspace_users!customer_id(full_name)', {
      count: 'exact',
    })
    .eq('ws_id', wsId)
    .order('created_at', { ascending: false });

  if (q) queryBuilder.ilike('name', `%${q}%`);

  if (page && pageSize) {
    const parsedPage = parseInt(page);
    const parsedSize = parseInt(pageSize);
    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize;
    queryBuilder.range(start, end).limit(parsedSize);
  }

  const { data: rawData, error, count } = await queryBuilder;
  if (error) throw error;

  const data = rawData.map(({ customer, ...rest }) => ({
    ...rest,
    // @ts-expect-error
    customer: customer?.full_name || '-',
  }));

  return { data, count } as { data: Invoice[]; count: number };
}

async function getUsers(wsId: string) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('workspace_users')
    .select('*')
    .eq('ws_id', wsId)
    .order('full_name', { ascending: true });

  const { data, error, count } = await queryBuilder;
  if (error) throw error;

  return { data, count } as { data: WorkspaceUser[]; count: number };
}

async function getProducts(wsId: string) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('inventory_products')
    .select('*, workspace_products!inner(*)')
    .eq('workspace_products.ws_id', wsId)
    .order('product_id', { ascending: true })
    .order('warehouse_id', { ascending: true })
    .order('unit_id', { ascending: true });

  const { data, error, count } = await queryBuilder;
  if (error) throw error;

  return { data, count };
}

async function getPromotions(wsId: string) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('workspace_promotions')
    .select('*')
    .eq('ws_id', wsId)
    .order('code', { ascending: true });

  const { data, error, count } = await queryBuilder;
  if (error) throw error;

  return { data, count };
}
