'use client';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@repo/ui/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui/components/ui/select';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  TrendingDownIcon,
  TrendingUpIcon,
} from 'lucide-react';
import { useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const data = [
  { date: '2023-01', rice: 400, wheat: 240, corn: 180 },
  { date: '2023-02', rice: 420, wheat: 250, corn: 190 },
  { date: '2023-03', rice: 410, wheat: 260, corn: 195 },
  { date: '2023-04', rice: 430, wheat: 255, corn: 185 },
  { date: '2023-05', rice: 450, wheat: 270, corn: 200 },
  { date: '2023-06', rice: 460, wheat: 265, corn: 210 },
];

const Dashboard = () => {
  const [selectedCommodity, setSelectedCommodity] = useState('rice');

  const translations = {
    en: {
      dashboard: 'Dashboard',
      selectCommodity: 'Select Commodity:',
      rice: 'Rice',
      wheat: 'Wheat',
      corn: 'Corn',
      priceTrends: 'Price Trends',
      date: 'Date',
      price: 'Price (USD/ton)',
      currentPrice: 'Current Price',
      change24h: '24h Change',
      weeklyTrend: 'Weekly Trend',
      monthlyTrend: 'Monthly Trend',
    },
    vi: {
      dashboard: 'Bảng điều khiển',
      selectCommodity: 'Chọn mặt hàng:',
      rice: 'Gạo',
      wheat: 'Lúa mì',
      corn: 'Ngô',
      priceTrends: 'Xu hướng giá',
      date: 'Ngày',
      price: 'Giá (USD/tấn)',
      currentPrice: 'Giá hiện tại',
      change24h: 'Thay đổi 24h',
      weeklyTrend: 'Xu hướng tuần',
      monthlyTrend: 'Xu hướng tháng',
    },
  };

  const t = translations['en'];

  const currentPrice =
    data.length > 0
      ? ((data[data.length - 1] as any)[selectedCommodity] ?? 0)
      : 0;
  const previousPrice =
    data.length > 1
      ? ((data[data.length - 2] as any)[selectedCommodity] ?? currentPrice)
      : currentPrice;

  const change24h = currentPrice - previousPrice;
  const change24hPercentage =
    previousPrice !== 0 ? (change24h / previousPrice) * 100 : 0;

  const weeklyChange =
    data.length >= 7
      ? currentPrice -
        ((data[data.length - 7] as unknown as { [key: string]: number })?.[
          selectedCommodity
        ] ?? 0)
      : 0;

  const monthlyChange =
    data.length > 0
      ? currentPrice -
        (Number(data[0]?.[selectedCommodity as keyof (typeof data)[0]]) || 0)
      : 0;

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{t.dashboard}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <label htmlFor="commodity" className="mb-1 block text-sm font-medium">
            {t.selectCommodity}
          </label>
          <Select
            value={selectedCommodity}
            onValueChange={setSelectedCommodity}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select commodity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="rice">{t.rice}</SelectItem>
              <SelectItem value="wheat">{t.wheat}</SelectItem>
              <SelectItem value="corn">{t.corn}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">${currentPrice}</div>
              <p className="text-xs text-muted-foreground">{t.currentPrice}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center text-2xl font-bold">
                {change24h > 0 ? (
                  <ArrowUpIcon className="mr-1 text-green-500" />
                ) : (
                  <ArrowDownIcon className="mr-1 text-red-500" />
                )}
                {change24h.toFixed(2)} ({change24hPercentage.toFixed(2)}%)
              </div>
              <p className="text-xs text-muted-foreground">{t.change24h}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center text-2xl font-bold">
                {weeklyChange > 0 ? (
                  <TrendingUpIcon className="mr-1 text-green-500" />
                ) : (
                  <TrendingDownIcon className="mr-1 text-red-500" />
                )}
                {weeklyChange.toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground">{t.weeklyTrend}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center text-2xl font-bold">
                {monthlyChange > 0 ? (
                  <TrendingUpIcon className="mr-1 text-green-500" />
                ) : (
                  <TrendingDownIcon className="mr-1 text-red-500" />
                )}
                {monthlyChange.toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground">{t.monthlyTrend}</p>
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{t.priceTrends}</CardTitle>
          </CardHeader>
          <CardContent>
            {data.length > 0 ? (
              <div className="h-[300px] sm:h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey={selectedCommodity}
                      stroke="#8884d8"
                      activeDot={{ r: 8 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p>No data available</p>
            )}
          </CardContent>
        </Card>
      </CardContent>
    </Card>
  );
};

export default Dashboard;
