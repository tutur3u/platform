export type AuroraExternalStatisticalForecast = {
  statistical_forecast: [
    {
      date: string;
      AutoARIMA: number;
      'AutoARIMA-lo-90': number;
      'AutoARIMA-hi-90': number;
      AutoETS: number;
      'AutoETS-lo-90': number;
      'AutoETS-hi-90': number;
      AutoTheta: number;
      'AutoTheta-lo-90': number;
      'AutoTheta-hi-90': number;
      CES: number;
      'CES-lo-90': number;
      'CES-hi-90': number;
    },
  ];
  ml_forecast: [
    {
      date: string;
      elasticnet: number;
      lightgbm: number;
      xgboost: number;
      catboost: number;
    },
  ];
};

export type AuroraExternalStatisticalMetrics = {
  no_scaling: [
    {
      Model: string;
      RMSE: number;
      Directional_Accuracy: number;
      Turning_Point_Accuracy: number;
      Weighted_Score: number;
    },
  ];
  with_scaling: [
    {
      Model: string;
      RMSE: number;
      Directional_Accuracy: number;
      Turning_Point_Accuracy: number;
      Weighted_Score: number;
    },
  ];
};

export type AuroraExternalMLMetrics = {
  elasticnet: {
    RMSE: number;
    Directional_Accuracy: number;
    Turning_Point_Accuracy: number;
    Weighted_Score: number;
  };
  lightgbm: {
    RMSE: number;
    Directional_Accuracy: number;
    Turning_Point_Accuracy: number;
    Weighted_Score: number;
  };
  xgboost: {
    RMSE: number;
    Directional_Accuracy: number;
    Turning_Point_Accuracy: number;
    Weighted_Score: number;
  };
  catboost: {
    RMSE: number;
    Directional_Accuracy: number;
    Turning_Point_Accuracy: number;
    Weighted_Score: number;
  };
};
