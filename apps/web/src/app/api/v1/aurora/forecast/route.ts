import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import type { AuroraExternalStatisticalForecast } from '../types';

export async function GET() {
  const supabase = await createClient();

  try {
    const { data: statistical_forecast, error: statError } = await supabase
      .from('aurora_statistical_forecast')
      .select('*')
      .order('date', { ascending: true });

    if (statError) throw new Error('Error fetching statistical forecast');

    const { data: ml_forecast, error: mlError } = await supabase
      .from('aurora_ml_forecast')
      .select('*')
      .order('date', { ascending: true });

    if (mlError) throw new Error('Error fetching ML forecast');

    return NextResponse.json({
      statistical_forecast: statistical_forecast?.map((item) => ({
        ...item,
        date: new Date(item.date).toISOString().split('T')[0],
      })),
      ml_forecast: ml_forecast?.map((item) => ({
        ...item,
        date: new Date(item.date).toISOString().split('T')[0],
      })),
    });
    // eslint-disable-next-line no-unused-vars
  } catch (_error) {
    return NextResponse.json(
      { message: 'Error fetching forecast data' },
      { status: 500 }
    );
  }
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

  if (!user.email?.endsWith('@tuturuuu.com')) {
    return NextResponse.json(
      { message: 'Unauthorized email domain' },
      { status: 403 }
    );
  }

  try {
    const res = await fetch(`${process.env.AURORA_EXTERNAL_URL}/forecast`);

    if (!res.ok) {
      throw new Error('Error fetching forecast from external API');
    }

    const data = (await res.json()) as AuroraExternalStatisticalForecast;

    const { error: statisticalForecastError } = await supabase
      .from('aurora_statistical_forecast')
      .insert(
        data.statistical_forecast.map((prediction) => ({
          ws_id: process.env.AURORA_EXTERNAL_WSID as string,
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
      throw new Error('Error saving statistical forecast');

    const { error: mlForecastError } = await supabase
      .from('aurora_ml_forecast')
      .insert(
        data.ml_forecast.map((prediction) => ({
          ws_id: process.env.AURORA_EXTERNAL_WSID as string,
          elasticnet: prediction.elasticnet,
          lightgbm: prediction.lightgbm,
          xgboost: prediction.xgboost,
          catboost: prediction.catboost,
          date: prediction.date,
        }))
      );

    if (mlForecastError) throw new Error('Error saving ML forecast');

    return NextResponse.json({ message: 'Success', data });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    );
  }
}
