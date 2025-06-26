import { createAdminClient } from "@tuturuuu/supabase/next/server";
import { getCurrentSupabaseUser } from "@tuturuuu/utils/user-helper";
import { NextResponse, NextRequest } from "next/server";


export async function POST(req: Request, {params} : {params: Promise<{wsId: string}>}) {

    try {
        const { wsId } = await params;
        const supabase = await createAdminClient();
        const user = await getCurrentSupabaseUser();
    
        // 1. Authenticate the user
        if (!user) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
    
        // 2. Parse and validate the request body
        const body = await req.json();
        const {
          name,
          description,
          total_duration,
          is_splittable,
          min_split_duration_minutes,
          max_split_duration_minutes,
          calendar_hours,
          start_date,
          end_date,
        } = body;
    
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
          return NextResponse.json(
            { error: 'Task name is required' },
            { status: 400 }
          );
        }
    
        if (typeof total_duration !== 'number' || total_duration <= 0) {
          return NextResponse.json(
            { error: 'Total duration must be a positive number' },
            { status: 400 }
          );
        }
    
        if (is_splittable) {
          if (min_split_duration_minutes > max_split_duration_minutes) {
            return NextResponse.json(
              { error: 'Minimum split duration cannot be greater than maximum' },
              { status: 400 }
            );
          }
        }
    
        // 3. Prepare the data for insertion
        const taskToInsert = {
          creator_id: user.id,
          name: name.trim(),
          description: description?.trim() || null,
          total_duration,
          is_splittable,
          min_split_duration_minutes: is_splittable
            ? min_split_duration_minutes
            : null,
          max_split_duration_minutes: is_splittable
            ? max_split_duration_minutes
            : null,
          calendar_hours,
          start_date: start_date || null,
          end_date: end_date || null,
        };
    
        // 4. Insert the data into Supabase
        const { data, error } = await supabase
          .from('tasks') 
          .insert(taskToInsert)
          .select()
          .single();
    
        if (error) {
          console.error('Supabase error creating task:', error);
          if (error.code === '23503') {
            return NextResponse.json(
              { error: `Invalid workspace ID: ${wsId}` },
              { status: 400 }
            );
          }
          return NextResponse.json(
            { error: 'Failed to create task in database.' },
            { status: 500 }
          );
        }
    
        // 5. Return a success response
        return NextResponse.json(data, { status: 201 }); // 201 Created
      } catch (e: any) {
        console.error('Error in task creation route:', e);
        // Handle errors like invalid JSON in the request
        if (e instanceof SyntaxError) {
          return NextResponse.json(
            { error: 'Invalid JSON in request body' },
            { status: 400 }
          );
        }
        return NextResponse.json(
          { error: 'Internal Server Error' },
          { status: 500 }
        );
      }
}