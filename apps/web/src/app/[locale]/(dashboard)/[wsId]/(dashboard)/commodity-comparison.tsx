'use client';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@tutur3u/ui/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tutur3u/ui/components/ui/select';
import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const data = [
  { name: 'Jan', rice: 400, wheat: 240, corn: 180 },
  { name: 'Feb', rice: 420, wheat: 250, corn: 190 },
  { name: 'Mar', rice: 410, wheat: 260, corn: 195 },
  { name: 'Apr', rice: 430, wheat: 255, corn: 185 },
  { name: 'May', rice: 450, wheat: 270, corn: 200 },
  { name: 'Jun', rice: 460, wheat: 265, corn: 210 },
];

const CommodityComparison = () => {
  const [selectedMonth, setSelectedMonth] = useState('Jun');

  const translations = {
    en: {
      commodityComparison: 'Commodity Comparison',
      selectMonth: 'Select Month:',
      price: 'Price (USD/ton)',
      rice: 'Rice',
      wheat: 'Wheat',
      corn: 'Corn',
    },
    vi: {
      commodityComparison: 'So sánh mặt hàng',
      selectMonth: 'Chọn tháng:',
      price: 'Giá (USD/tấn)',
      rice: 'Gạo',
      wheat: 'Lúa mì',
      corn: 'Ngô',
    },
  };

  const t = translations['en'];

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{t.commodityComparison}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <label htmlFor="month" className="mb-1 block text-sm font-medium">
            {t.selectMonth}
          </label>
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select month" />
            </SelectTrigger>
            <SelectContent>
              {data.map((item) => (
                <SelectItem key={item.name} value={item.name}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="h-[300px] sm:h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={[data.find((item) => item.name === selectedMonth)]}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="rice" fill="#8884d8" name={t.rice} />
              <Bar dataKey="wheat" fill="#82ca9d" name={t.wheat} />
              <Bar dataKey="corn" fill="#ffc658" name={t.corn} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};

export default CommodityComparison;
