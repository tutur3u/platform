import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
    const supabase = createClient();
    const data = await req.json();

    const { error } = await supabase
        .from('user_group_post_checks')
        .insert(data);

    if (error) {
        console.log(error);
        return NextResponse.json(
            { message: 'Error inserting data into user_group_post_checks' },
            { status: 500 }
        );
    }

    return NextResponse.json({ message: 'Data inserted successfully' });
}

export async function PUT(req: Request, { params: { postId } }: { params: { postId: string } }) {
    const supabase = createClient();
    const data = await req.json();

    const { error } = await supabase
        .from('user_group_post_checks')
        .update(data)
        .eq('id', postId);

    if (error) {
        console.error('Error updating user_group_post_checks:', error.message);
        return NextResponse.json(
            { message: 'Error updating user_group_post_checks', details: error.message },
            { status: 500 }
        );
    }

    return NextResponse.json({ message: 'Data updated successfully' });
}


export async function DELETE(req: Request, { params: { postId } }: { params: { postId: string } }) {
    const supabase = createClient();

    const { error } = await supabase
        .from('user_group_post_checks')
        .delete()
        .eq('id', postId);

    if (error) {
        console.log(error);
        return NextResponse.json(
            { message: 'Error deleting from user_group_post_checks' },
            { status: 500 }
        );
    }

    return NextResponse.json({ message: 'Data deleted successfully' });
}
