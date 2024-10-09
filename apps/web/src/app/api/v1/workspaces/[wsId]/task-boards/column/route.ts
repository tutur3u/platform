import { createClient } from "@/utils/supabase/server";  // Your Supabase client configuration
import { NextResponse } from "next/server";

interface Params {
    params: {
        wsId: string; 
    }
}

export async function POST(req: Request, { params: { } }: Params) {
    const supabase = createClient();

    // Parse the request body (assuming JSON format)
    const { boardId, title } = await req.json(); 

    try {
        const { error } = await supabase
            .from('workspace_boards_columns')
            .insert({
                boardId: boardId,   
                title: title,  
            });

        if (error) {
            return NextResponse.json({ message: "Error inserting data", error }, { status: 500 });
        }

        return NextResponse.json({ message: "Data inserted successfully" }, { status: 201 });
    } catch (err) {
        return NextResponse.json({ message: "Error processing request", error: err }, { status: 500 });
    }
}
