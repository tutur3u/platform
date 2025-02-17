import type { AuroraStatisticalForecast } from '../types';
import { createClient } from '@tutur3u/supabase/next/server';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = await createClient();

  const { data: statistical_forecast } = await supabase
    .from('aurora_statistical_forecast')
    .select('*');
  const { data: ml_forecast } = await supabase
    .from('aurora_ml_forecast')
    .select('*');

  return NextResponse.json({ statistical_forecast, ml_forecast });
}

export async function POST() {
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

  const res = await fetch(`${process.env.AURORA_EXTERNAL_URL}/forecast`);

  if (!res.ok) {
    return NextResponse.json(
      { message: 'Error fetching forecast' },
      { status: 500 }
    );
  }

  const data = (await res.json()) as AuroraStatisticalForecast;

  const { error: statisticalForecastError } = await supabase
    .from('aurora_statistical_forecast')
    .insert(
      data.statistical_forecast.map((prediction) => ({
        ws_id: process.env.AURORA_EXTERNAL_WSID!,
        auto_arima: prediction.AutoARIMA,
        auto_arima_lo_90: prediction['AutoARIMA-lo-90'],
        auto_arima_hi_90: prediction['AutoARIMA-hi-90'],
        auto_ets: prediction.AutoETS,
        auto_ets_lo_90: prediction['AutoETS-lo-90'],
        auto_ets_hi_90: prediction['AutoETS-hi-90'],
        auto_theta: prediction.AutoTheta,
        auto_theta_lo_90: prediction['AutoTheta-lo-90'],
        auto_theta_hi_90: prediction['AutoTheta-hi-90'],
        ces: prediction.CES,
        ces_lo_90: prediction['CES-lo-90'],
        ces_hi_90: prediction['CES-hi-90'],
        date: prediction.date,
      }))
    );

  if (statisticalForecastError)
    return NextResponse.json(
      { message: 'Error fetching statistical forecast' },
      { status: 500 }
    );

  const { error: mlForecastError } = await supabase
    .from('aurora_ml_forecast')
    .insert(
      data.ml_forecast.map((prediction) => ({
        ws_id: process.env.AURORA_EXTERNAL_WSID!,
        elasticnet: prediction.elasticnet,
        lightgbm: prediction.lightgbm,
        xgboost: prediction.xgboost,
        catboost: prediction.catboost,
        date: prediction.date,
      }))
    );

  if (mlForecastError)
    return NextResponse.json(
      { message: 'Error fetching machine learning forecast' },
      { status: 500 }
    );

  return NextResponse.json({
    message: 'Success',
    data,
  });
}
