'use client';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@repo/ui/components/ui/card';
// import { DatePickerWithRange } from '@repo/ui/components/ui/date-picker-with-range';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui/components/ui/select';
import { addDays } from 'date-fns';
import { useState } from 'react';
// import { DateRange } from 'react-day-picker';
import {
  Brush,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const generateMockData = (startDate: Date, days: number) => {
  const data = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(startDate, i);
    data.push({
      date: date.toISOString().split('T')[0],
      actual: Math.round(400 + Math.random() * 100),
      predicted: Math.round(400 + Math.random() * 100),
      lowerBound: Math.round(350 + Math.random() * 100),
      upperBound: Math.round(450 + Math.random() * 100),
    });
  }
  return data;
};

const PricePredictionChart = () => {
  const [selectedCommodity, setSelectedCommodity] = useState('rice');
  const [dateRange] = useState<
    | {
        from: Date;
        to: Date;
      }
    | undefined
  >({
    from: addDays(new Date(), -30),
    to: addDays(new Date(), 30),
  });

  const translations = {
    en: {
      pricePrediction: 'Price Prediction',
      selectCommodity: 'Select Commodity',
      rice: 'Rice',
      wheat: 'Wheat',
      corn: 'Corn',
      actual: 'Actual',
      predicted: 'Predicted',
      confidenceInterval: 'Confidence Interval',
    },
    vi: {
      pricePrediction: 'Dự đoán giá',
      selectCommodity: 'Chọn mặt hàng',
      rice: 'Gạo',
      wheat: 'Lúa mì',
      corn: 'Ngô',
      actual: 'Thực tế',
      predicted: 'Dự đoán',
      confidenceInterval: 'Khoảng tin cậy',
    },
  };

  const t = translations['en'];

  const data =
    dateRange?.from && dateRange?.to
      ? generateMockData(
          dateRange.from,
          Math.ceil(
            (dateRange.to.getTime() - dateRange.from.getTime()) /
              (1000 * 60 * 60 * 24)
          )
        )
      : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.pricePrediction}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-col items-start justify-between space-y-4 sm:flex-row sm:items-center sm:space-y-0">
          <Select
            value={selectedCommodity}
            onValueChange={setSelectedCommodity}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={t.selectCommodity} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="rice">{t.rice}</SelectItem>
              <SelectItem value="wheat">{t.wheat}</SelectItem>
              <SelectItem value="corn">{t.corn}</SelectItem>
            </SelectContent>
          </Select>
          {/* <DatePickerWithRange date={dateRange} setDate={setDateRange} /> */}
        </div>
        <div className="h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="actual"
                stroke="#8884d8"
                name={t.actual}
              />
              <Line
                type="monotone"
                dataKey="predicted"
                stroke="#82ca9d"
                name={t.predicted}
              />
              <Line
                type="monotone"
                dataKey="lowerBound"
                stroke="#ff7300"
                strokeDasharray="3 3"
                name={t.confidenceInterval}
              />
              <Line
                type="monotone"
                dataKey="upperBound"
                stroke="#ff7300"
                strokeDasharray="3 3"
              />
              <Brush dataKey="date" height={30} stroke="#8884d8" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};

export default PricePredictionChart;
