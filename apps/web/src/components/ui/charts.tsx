import {
  Bar,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  Pie,
  BarChart as RechartsBarChart,
  LineChart as RechartsLineChart,
  PieChart as RechartsPieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

// LineChart Component
interface LineChartProps {
  data: any[];
  xKey: string;
  series: { key: string; name: string }[];
  colors?: string[];
}

export const LineChart = ({
  data,
  xKey,
  series,
  colors = ['#3b82f6', '#ef4444'],
}: LineChartProps) => {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <RechartsLineChart
        data={data}
        margin={{ top: 5, right: 30, left: 20, bottom: 25 }}
      >
        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
        <XAxis
          dataKey={xKey}
          label={{
            value: 'Race Number',
            position: 'insideBottom',
            offset: -5,
          }}
        />
        <YAxis
          label={{
            value: 'Value',
            angle: -90,
            position: 'insideLeft',
          }}
        />
        <Tooltip />
        <Legend />
        {series.map((s, i) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.name}
            stroke={colors[i % colors.length]}
            activeDot={{ r: 8 }}
            strokeWidth={2}
          />
        ))}
      </RechartsLineChart>
    </ResponsiveContainer>
  );
};

// BarChart Component
interface BarChartProps {
  data: any[];
  xKey: string;
  series?: { key: string; name: string }[];
  colors?: string[];
}

export const BarChart = ({
  data,
  xKey,
  series = [{ key: 'value', name: 'Value' }],
  colors = ['#3b82f6'],
}: BarChartProps) => {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <RechartsBarChart
        data={data}
        margin={{ top: 5, right: 30, left: 20, bottom: 25 }}
      >
        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
        <XAxis
          dataKey={xKey}
          label={{
            value: xKey === 'horse' ? 'Horse ID' : 'Category',
            position: 'insideBottom',
            offset: -5,
          }}
        />
        <YAxis
          label={{
            value: 'Value',
            angle: -90,
            position: 'insideLeft',
          }}
        />
        <Tooltip />
        <Legend />
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.name}
            fill={colors[i % colors.length]}
          />
        ))}
      </RechartsBarChart>
    </ResponsiveContainer>
  );
};

// PieChart Component
interface PieChartProps {
  data: { name: string; value: number }[];
  colors?: string[];
}

export const PieChart = ({
  data,
  colors = ['#3b82f6', '#ef4444', '#22c55e'],
}: PieChartProps) => {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <RechartsPieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          labelLine={false}
          outerRadius={80}
          fill="#8884d8"
          dataKey="value"
          label={({ name, percent }) =>
            `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`
          }
        >
          {data.map((_, index) => (
            <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(value: number) => [`${value} races`, 'Count']} />
        <Legend />
      </RechartsPieChart>
    </ResponsiveContainer>
  );
};
