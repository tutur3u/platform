export const getTextEditorRooms = async (wsId: string, documentId: string | undefined) => {
    const roomIDPrefix = documentId ? `${wsId}:${documentId}` : wsId;
    const queryString = `roomId^'${roomIDPrefix}:' AND metadata['roomType']:'text-editor'`;
    const encodedQuery = encodeURIComponent(queryString);

    try {
        const response = await fetch(`https://api.liveblocks.io/v2/rooms?query=${encodedQuery}`, {
            method: 'GET'
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to get available rooms');
        }

        const result = await response.json();
        if (result.error) {
            throw new Error(result.error.message || 'API error occurred');
        }

        return result;
    } catch (error) {
        console.error('Error fetching text editor rooms:', error);
        throw error;
    }
};

export const createTextEditorRoom = async (wsId: string, documentId: string, defaultAccess: string | 'room:write') => {
    const id = `${wsId}:${documentId}`;
    const roomType = 'text-editor';
    const metadata = { roomType };

    try {
        const response = await fetch('https://api.liveblocks.io/v2/rooms', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ id, metadata, defaultAccess }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to create room');
        }

        const result = await response.json();
        if (result.error) {
            throw new Error(result.error.message || 'API error occurred');
        }

        return result;
    } catch (error) {
        console.error('Error creating text editor room:', error);
        throw error;
    }
}

export const getActiveUsers = async (wsId: string, documentId: string) => {
    const roomId = `${wsId}:${documentId}`;
    try {
        const response = await fetch(`https://api.liveblocks.io/v2/rooms/${roomId}/active_users`, {
            method: 'GET'
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to get active users');
        }

        const result = await response.json();
        if (result.error) {
            throw new Error(result.error.message || 'API error occurred');
        }

        return result;
    } catch (error) {
        console.error('Error fetching active users:', error);
        throw error;
    }
}
