import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { verifyHasSecrets } from '@tuturuuu/utils/workspace-helper';
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const hasKey = (key: string) => {
  const keyEnv = process.env[key];
  return !!keyEnv && keyEnv.length > 0;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    console.log('AI Config API called with wsId:', wsId);

    // Check permissions
    const { withoutPermission } = await getPermissions({ wsId });
    console.log('Permission check result:', { withoutPermission: withoutPermission('ai_chat') });
    
    let hasAiChatAccess = false;

    try {
      // Check if user has AI chat permission and secrets are configured
      if (!withoutPermission('ai_chat')) {
        console.log('User has ai_chat permission, checking secrets...');
        await verifyHasSecrets(wsId, ['ENABLE_CHAT']);
        hasAiChatAccess = true;
        console.log('AI Chat access granted');
      } else {
        console.log('User does not have ai_chat permission');
      }
    } catch (error) {
      // If verification fails, user doesn't have access
      console.log('AI Chat access denied:', error);
      hasAiChatAccess = false;
    }

    // Check for API keys with workspace-specific overrides
    let hasKeys = {
      openAI: hasKey('OPENAI_API_KEY'),
      anthropic: hasKey('ANTHROPIC_API_KEY'),
      google: hasKey('GOOGLE_GENERATIVE_AI_API_KEY'),
    };

    // Try to get workspace-specific AI settings from database
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      
      if (supabaseUrl && supabaseKey) {
        const supabase = createClient(supabaseUrl, supabaseKey);
        
        // Check if workspace has specific AI settings
        const { data: workspaceSettings } = await supabase
          .from('workspaces')
          .select('ai_settings')
          .eq('id', wsId)
          .single();

        if (workspaceSettings?.ai_settings) {
          const settings = workspaceSettings.ai_settings;
          hasKeys = {
            openAI: hasKeys.openAI && (settings.openai_enabled === true),
            anthropic: hasKeys.anthropic && (settings.anthropic_enabled === true),
            google: hasKeys.google && (settings.google_enabled === true),
          };
        }
      }
    } catch (dbError) {
      console.log('Could not fetch workspace AI settings, using defaults:', dbError);
      // Continue with default settings
    }

    console.log('API keys status:', hasKeys);
    console.log('Final hasAiChatAccess:', hasAiChatAccess);

    return NextResponse.json({
      hasKeys,
      hasAiChatAccess,
    });

  } catch (error) {
    console.error('Error in AI config API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 