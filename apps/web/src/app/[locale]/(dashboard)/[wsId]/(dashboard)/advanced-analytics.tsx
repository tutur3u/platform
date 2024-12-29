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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@repo/ui/components/ui/tabs';
import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const seasonalityData = [
  { month: 'Jan', rice: 100, wheat: 90, corn: 80 },
  { month: 'Feb', rice: 105, wheat: 95, corn: 82 },
  { month: 'Mar', rice: 110, wheat: 100, corn: 85 },
  { month: 'Apr', rice: 115, wheat: 105, corn: 88 },
  { month: 'May', rice: 120, wheat: 110, corn: 92 },
  { month: 'Jun', rice: 125, wheat: 115, corn: 95 },
  { month: 'Jul', rice: 130, wheat: 120, corn: 98 },
  { month: 'Aug', rice: 135, wheat: 125, corn: 100 },
  { month: 'Sep', rice: 140, wheat: 130, corn: 102 },
  { month: 'Oct', rice: 145, wheat: 135, corn: 105 },
  { month: 'Nov', rice: 150, wheat: 140, corn: 108 },
  { month: 'Dec', rice: 155, wheat: 145, corn: 110 },
];

const correlationData = [
  { factor: 'Temperature', correlation: 0.75 },
  { factor: 'Rainfall', correlation: -0.6 },
  { factor: 'Oil Price', correlation: 0.5 },
  { factor: 'GDP Growth', correlation: 0.4 },
  { factor: 'Exchange Rate', correlation: -0.3 },
];

const AdvancedAnalytics = () => {
  const [selectedCommodity, setSelectedCommodity] = useState('rice');

  const translations = {
    en: {
      advancedAnalytics: 'Advanced Analytics',
      seasonality: 'Seasonality',
      correlation: 'Correlation Analysis',
      selectCommodity: 'Select Commodity',
      rice: 'Rice',
      wheat: 'Wheat',
      corn: 'Corn',
      month: 'Month',
      price: 'Price Index',
      factor: 'Factor',
      correlationStrength: 'Correlation Strength',
    },
    vi: {
      advancedAnalytics: 'Phân tích nâng cao',
      seasonality: 'Tính mùa vụ',
      correlation: 'Phân tích tương quan',
      selectCommodity: 'Chọn mặt hàng',
      rice: 'Gạo',
      wheat: 'Lúa mì',
      corn: 'Ngô',
      month: 'Tháng',
      price: 'Chỉ số giá',
      factor: 'Yếu tố',
      correlationStrength: 'Độ mạnh tương quan',
    },
  };

  const t = translations['en'];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.advancedAnalytics}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <Select
            value={selectedCommodity}
            onValueChange={setSelectedCommodity}
          >
            <SelectTrigger>
              <SelectValue placeholder={t.selectCommodity} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="rice">{t.rice}</SelectItem>
              <SelectItem value="wheat">{t.wheat}</SelectItem>
              <SelectItem value="corn">{t.corn}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Tabs defaultValue="seasonality">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="seasonality">{t.seasonality}</TabsTrigger>
            <TabsTrigger value="correlation">{t.correlation}</TabsTrigger>
          </TabsList>
          <TabsContent value="seasonality">
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={seasonalityData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey={selectedCommodity}
                    stroke="#8884d8"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>
          <TabsContent value="correlation">
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={correlationData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" domain={[-1, 1]} />
                  <YAxis dataKey="factor" type="category" />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="correlation" fill="#8884d8" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default AdvancedAnalytics;
