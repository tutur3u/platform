import { Liveblocks } from "@liveblocks/node";

const liveblocks = new Liveblocks({
    secret: "sk_dev_VpMi9Hgx1OuT6a9VOuOJoLJAbBIagoZ7wKAyFmK0kpByrjjSLCo5ZaehBrqJNAIT",
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
