/**
 * Tuna Memories API
 * GET /api/v1/tuna/memories - Get user's memories
 * POST /api/v1/tuna/memories - Create/update a memory
 * DELETE /api/v1/tuna/memories - Delete a memory
 */

import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const memoryCategories = [
  'preference',
  'fact',
  'conversation_topic',
  'event',
  'person',
] as const;

const createMemorySchema = z.object({
  category: z.enum(memoryCategories),
  key: z.string().min(1).max(200),
  value: z.string().min(1).max(5000),
  source: z.string().max(200).optional(),
  confidence: z.number().min(0).max(1).optional().default(1.0),
});

const deleteMemorySchema = z.object({
  memory_id: z.string().uuid(),
});

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const limit = Math.min(
      parseInt(searchParams.get('limit') || '100', 10),
      500
    );

    // Build query
    let query = supabase
      .from('tuna_memories')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (
      category &&
      memoryCategories.includes(category as (typeof memoryCategories)[number])
    ) {
      query = query.eq(
        'category',
        category as (typeof memoryCategories)[number]
      );
    }

    const { data: memories, error } = await query;

    if (error) {
      console.error('Error getting memories:', error);
      return NextResponse.json(
        { error: 'Failed to get memories' },
        { status: 500 }
      );
    }

    // Group by category
    const groupedMemories = (memories || []).reduce(
      (acc, memory) => {
        const cat = memory.category;
        if (!acc[cat]) {
          acc[cat] = [];
        }
        acc[cat].push(memory);
        return acc;
      },
      {} as Record<string, typeof memories>
    );

    return NextResponse.json({
      memories: memories || [],
      grouped: groupedMemories,
      total: memories?.length || 0,
    });
  } catch (error) {
    console.error('Unexpected error in GET /api/v1/tuna/memories:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse and validate request body
    const body = await request.json();
    const parsed = createMemorySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { category, key, value, source, confidence } = parsed.data;

    // Upsert memory (insert or update if key exists)
    const { data: memory, error } = await supabase
      .from('tuna_memories')
      .upsert(
        {
          user_id: user.id,
          category,
          key,
          value,
          source,
          confidence,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,category,key' }
      )
      .select()
      .single();

    if (error) {
      console.error('Error creating/updating memory:', error);
      return NextResponse.json(
        { error: 'Failed to save memory' },
        { status: 500 }
      );
    }

    return NextResponse.json({ memory });
  } catch (error) {
    console.error('Unexpected error in POST /api/v1/tuna/memories:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse and validate request body
    const body = await request.json();
    const parsed = deleteMemorySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { memory_id } = parsed.data;

    // Delete memory (RLS ensures user can only delete their own)
    const { error } = await supabase
      .from('tuna_memories')
      .delete()
      .eq('id', memory_id)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting memory:', error);
      return NextResponse.json(
        { error: 'Failed to delete memory' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Unexpected error in DELETE /api/v1/tuna/memories:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
