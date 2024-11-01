import { Liveblocks } from "@liveblocks/node";

const LIVEBLOCKS_SECRET = process.env.LIVEBLOCKS_SECRET_API_KEY

const liveblocks = new Liveblocks({
    secret: LIVEBLOCKS_SECRET || ''
});

export const createRoomId = (wsId: string, documentId: string) => `${wsId}:${documentId}`;

const fetchAPI = async (url: string, options: RequestInit) => {
    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Request failed');
        }
        const result = await response.json();
        if (result.error) {
            throw new Error(result.error.message || 'API error occurred');
        }
        return result;
    } catch (error) {
        console.error('Fetch error:', error);
        throw error;
    }
};

export const getTextEditorRooms = async (roomId: string) => {
    const queryString = `roomId^'${roomId}:' AND metadata['roomType']:'text-editor'`;
    const encodedQuery = encodeURIComponent(queryString);
    const url = `https://api.liveblocks.io/v2/rooms?query=${encodedQuery}`;

    return fetchAPI(url, { method: 'GET' });
};

export const createTextEditorRoom = async (roomId: string, defaultAccess: string = 'room:write') => {
    const metadata = { roomType: 'text-editor' };
    const url = 'https://api.liveblocks.io/v2/rooms';
    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: roomId, metadata, defaultAccess }),
    };

    return fetchAPI(url, options);
};

type RoomPermission = ["room:read", "room:presence:write"];

export const createRoom = async (
    roomID: string,
    defaultAccess: RoomPermission = ["room:read", "room:presence:write"],
    creatorId: string
) => {
    try {
        await liveblocks.createRoom(roomID, {
            defaultAccesses: defaultAccess,
            usersAccesses: {
                [creatorId]: ["room:write"],
            },
        });
        console.log(`Room ${roomID} created successfully.`);
    } catch (error) {
        console.error("Error creating room:", error);
    }
}
