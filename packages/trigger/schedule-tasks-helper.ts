import { createAdminClient } from '@tuturuuu/supabase/next/server';

type Params = {
  success: boolean;
  data?: any;
  error?: string;
};

const schedulableTasksHelper = async (ws_id: string): Promise<Params> => {
  console.log('=== Starting schedulable tasks helper ===');

  try {
    // Get the base URL from environment variables
    const baseUrl = process.env.API_BASE_URL || process.env.NEXT_PUBLIC_URL || 'http://localhost:7803';
    const fullUrl = `${baseUrl}/api/${ws_id}/calendar/auto-schedule?stream=false`;
    
    console.log('Calling API:', fullUrl);
    
    const response = await fetch(fullUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('=== Schedule tasks helper completed successfully ===');
    
    return {
      success: true,
      data
    };
  } catch (error) {
    console.error('Error in schedulable tasks helper:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

export { schedulableTasksHelper };