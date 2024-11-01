import { Liveblocks } from "@liveblocks/node";

const liveblocks = new Liveblocks({
    secret: process.env.LIVEBLOCKS_SECRET_API_KEY || '',
});

export async function POST(request: Request) {
    // // Get the current user from your database
    // const user = __getUserFromDB__(request);

    // // Identify the user and return the result
    // const { status, body } = await liveblocks.identifyUser(
    //     {
    //         userId: user.id,
    //     },
    //     { userInfo: user.metadata },
    // );

    // return new Response(body, { status });
}
