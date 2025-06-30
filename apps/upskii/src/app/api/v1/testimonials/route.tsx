import { createAdminClient } from "@tuturuuu/supabase/next/server";
import { NextResponse } from "next/server";


export async function GET() {
    const supabase = await createAdminClient();

    const { data, error } = await supabase
        .from('testimonials')
        .select('*, users!user_id(display_name, avatar_url), workspace_courses!course_id(name)')
        .order('created_at', { ascending: false })
        .limit(6);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Map the data to the required format
    const formatted = (data || []).map((testimonial) => ({
        name: testimonial.users?.display_name || 'Anonymous',
        avatar: testimonial.users?.avatar_url || null,
        stars: typeof testimonial.rating === 'number' ? testimonial.rating : 0,
        quote: testimonial.content || '',
        course: testimonial.workspace_courses?.name || null,
    }));

    return NextResponse.json(formatted);
}