import type { AuroraExternalStatisticalMetrics } from '../types';
import { createClient } from '@tutur3u/supabase/next/server';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = await createClient();

  const { data: statistical_metrics } = await supabase
    .from('aurora_statistical_metrics')
    .select('*');

  return NextResponse.json(statistical_metrics);
}

export async function POST() {
  if (!process.env.AURORA_EXTERNAL_URL) {
    return NextResponse.json(
      { message: 'Aurora API URL not configured' },
      { status: 500 }
    );
  }

  if (!process.env.AURORA_EXTERNAL_WSID) {
    return NextResponse.json(
      { message: 'Aurora workspace ID not configured' },
      { status: 500 }
    );
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  }

  if (!user.email?.endsWith('@tuturuu.com')) {
    return NextResponse.json(
      { message: 'Unauthorized email domain' },
      { status: 403 }
    );
  }

  const res = await fetch(
    `${process.env.AURORA_EXTERNAL_URL}/statistical_metrics`
  );

  if (!res.ok) {
    return NextResponse.json(
      { message: 'Error fetching forecast' },
      { status: 500 }
    );
  }

  const data = (await res.json()) as AuroraExternalStatisticalMetrics;

  const { error } = await supabase.from('aurora_statistical_metrics').insert([
    ...data.no_scaling.map((prediction) => ({
      ws_id: process.env.AURORA_EXTERNAL_WSID!,
      model: prediction.Model,
      rmse: prediction.RMSE,
      directional_accuracy: prediction.Directional_Accuracy,
      turning_point_accuracy: prediction.Turning_Point_Accuracy,
      weighted_score: prediction.Weighted_Score,
      no_scaling: true,
    })),
    ...data.with_scaling.map((prediction) => ({
      ws_id: process.env.AURORA_EXTERNAL_WSID!,
      model: prediction.Model,
      rmse: prediction.RMSE,
      directional_accuracy: prediction.Directional_Accuracy,
      turning_point_accuracy: prediction.Turning_Point_Accuracy,
      weighted_score: prediction.Weighted_Score,
      no_scaling: false,
    })),
  ]);

  if (error)
    return NextResponse.json(
      { message: 'Error creating statistical metrics' },
      { status: 500 }
    );

  return NextResponse.json({ message: 'Success', data });
}
