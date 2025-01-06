export interface CrawlMetrics {
  startTime: number;
  totalPages: number;
  completedPages: number;
  totalArticles: number;
  processedArticles: number;
  requestCount: number;
  successfulRequests: number;
  failedRequests: number;
  averageRequestTime: number;
  estimatedTimeLeft: string;
}

export interface QueueItem {
  url: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  timestamp: number;
  progress: number;
  subStatus?: string;
}

export interface UrlWithProgress extends QueueItem {
  subPages?: {
    total: number;
    processed: number;
  };
}
