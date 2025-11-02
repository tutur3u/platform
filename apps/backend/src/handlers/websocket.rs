//! # WebSocket Handlers
//!
//! WebSocket support for real-time bidirectional communication.

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path, State,
    },
    response::Response,
};
use futures::{sink::SinkExt, stream::StreamExt};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};
use uuid::Uuid;

// ============================================================================
// Types and State
// ============================================================================

/// Global WebSocket state for managing connections
#[derive(Clone)]
pub struct WebSocketState {
    /// Broadcast channel for sending messages to all connected clients
    pub tx: broadcast::Sender<String>,

    /// Track active connections by user ID
    pub connections: Arc<RwLock<HashMap<String, ConnectionInfo>>>,
}

impl WebSocketState {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(100);
        Self {
            tx,
            connections: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Get count of active connections
    pub async fn connection_count(&self) -> usize {
        self.connections.read().await.len()
    }

    /// Broadcast a message to all connected clients
    pub fn broadcast(&self, msg: String) {
        // Ignore send errors (means no receivers)
        let _ = self.tx.send(msg);
    }
}

/// Information about a WebSocket connection
#[derive(Debug, Clone)]
pub struct ConnectionInfo {
    pub user_id: String,
    pub connected_at: chrono::DateTime<chrono::Utc>,
    pub room: Option<String>,
}

// ============================================================================
// WebSocket Handlers
// ============================================================================

/// Basic WebSocket echo handler
///
/// This demonstrates the simplest WebSocket pattern: echo back any message received.
///
/// Example usage:
/// ```javascript
/// const ws = new WebSocket('ws://localhost:3001/ws');
/// ws.onmessage = (event) => console.log('Received:', event.data);
/// ws.send('Hello WebSocket!');
/// ```
pub async fn ws_echo_handler(ws: WebSocketUpgrade) -> Response {
    ws.on_upgrade(handle_socket_echo)
}

async fn handle_socket_echo(socket: WebSocket) {
    let (mut sender, mut receiver) = socket.split();

    // Echo messages back to the client
    while let Some(Ok(msg)) = receiver.next().await {
        match msg {
            Message::Text(text) => {
                // Echo text messages back
                if sender
                    .send(Message::Text(format!("Echo: {}", text).into()))
                    .await
                    .is_err()
                {
                    break;
                }
            }
            Message::Binary(data) => {
                // Echo binary messages back
                if sender.send(Message::Binary(data)).await.is_err() {
                    break;
                }
            }
            Message::Ping(data) => {
                // Respond to ping with pong
                if sender.send(Message::Pong(data)).await.is_err() {
                    break;
                }
            }
            Message::Close(_) => {
                break;
            }
            _ => {}
        }
    }
}

/// WebSocket handler with broadcast support
///
/// This allows clients to send messages that are broadcast to all connected clients.
///
/// Example usage:
/// ```javascript
/// const ws = new WebSocket('ws://localhost:3001/ws/broadcast');
/// ws.onmessage = (event) => console.log('Broadcast:', event.data);
/// ws.send('Hello everyone!');
/// ```
pub async fn ws_broadcast_handler(
    ws: WebSocketUpgrade,
    State(state): State<WebSocketState>,
) -> Response {
    ws.on_upgrade(|socket| handle_socket_broadcast(socket, state))
}

async fn handle_socket_broadcast(socket: WebSocket, state: WebSocketState) {
    let (mut sender, mut receiver) = socket.split();

    // Generate unique ID for this connection
    let conn_id = Uuid::new_v4().to_string();

    // Add connection to state
    {
        let mut connections = state.connections.write().await;
        connections.insert(
            conn_id.clone(),
            ConnectionInfo {
                user_id: conn_id.clone(),
                connected_at: chrono::Utc::now(),
                room: None,
            },
        );
    }

    // Subscribe to broadcast channel
    let mut rx = state.tx.subscribe();

    // Send welcome message
    let welcome = format!(
        "Welcome! You are connected as {}. There are {} active connections.",
        conn_id,
        state.connection_count().await
    );
    if sender.send(Message::Text(welcome.into())).await.is_err() {
        return;
    }

    // Spawn task to receive broadcast messages
    let mut send_task = tokio::spawn(async move {
        while let Ok(msg) = rx.recv().await {
            if sender.send(Message::Text(msg.into())).await.is_err() {
                break;
            }
        }
    });

    // Handle incoming messages from this client
    let state_clone = state.clone();
    let conn_id_clone = conn_id.clone();
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            if let Message::Text(text) = msg {
                // Broadcast message to all clients
                let broadcast_msg = format!("[{}]: {}", conn_id_clone, text);
                state_clone.broadcast(broadcast_msg);
            }
        }
    });

    // Wait for either task to complete
    tokio::select! {
        _ = (&mut send_task) => recv_task.abort(),
        _ = (&mut recv_task) => send_task.abort(),
    }

    // Remove connection from state
    state.connections.write().await.remove(&conn_id);

    // Notify others that user disconnected
    let disconnect_msg = format!("{} disconnected. {} connections remaining.",
        conn_id,
        state.connection_count().await
    );
    state.broadcast(disconnect_msg);
}

/// Room-based WebSocket handler
///
/// This allows clients to join specific rooms and only receive messages from that room.
///
/// Example usage:
/// ```javascript
/// const ws = new WebSocket('ws://localhost:3001/ws/room/gaming');
/// ws.onmessage = (event) => console.log('Room message:', event.data);
/// ws.send('Hello room!');
/// ```
pub async fn ws_room_handler(
    ws: WebSocketUpgrade,
    Path(room_name): Path<String>,
    State(state): State<WebSocketState>,
) -> Response {
    ws.on_upgrade(|socket| handle_socket_room(socket, state, room_name))
}

async fn handle_socket_room(socket: WebSocket, state: WebSocketState, room: String) {
    let (mut sender, mut receiver) = socket.split();

    // Generate unique ID for this connection
    let conn_id = Uuid::new_v4().to_string();

    // Add connection to state with room
    {
        let mut connections = state.connections.write().await;
        connections.insert(
            conn_id.clone(),
            ConnectionInfo {
                user_id: conn_id.clone(),
                connected_at: chrono::Utc::now(),
                room: Some(room.clone()),
            },
        );
    }

    // Subscribe to broadcast channel
    let mut rx = state.tx.subscribe();

    // Send welcome message
    let room_count = state
        .connections
        .read()
        .await
        .values()
        .filter(|c| c.room.as_ref() == Some(&room))
        .count();

    let welcome = format!(
        "Welcome to room '{}'! You are {} of {} users in this room.",
        room, conn_id, room_count
    );
    if sender.send(Message::Text(welcome.into())).await.is_err() {
        return;
    }

    // Notify room of new user
    let join_msg = format!("room:{}:{} joined the room", room, conn_id);
    state.broadcast(join_msg);

    // Spawn task to receive broadcast messages (filter by room)
    let room_clone = room.clone();
    let mut send_task = tokio::spawn(async move {
        while let Ok(msg) = rx.recv().await {
            // Only forward messages for this room
            if msg.starts_with(&format!("room:{}:", room_clone)) {
                if let Some(content) = msg.strip_prefix(&format!("room:{}:", room_clone)) {
                    if sender.send(Message::Text(content.to_string().into())).await.is_err() {
                        break;
                    }
                }
            }
        }
    });

    // Handle incoming messages from this client
    let state_clone = state.clone();
    let conn_id_clone = conn_id.clone();
    let room_clone2 = room.clone();
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            if let Message::Text(text) = msg {
                // Broadcast message to room
                let broadcast_msg = format!("room:{}:[{}]: {}", room_clone2, conn_id_clone, text);
                state_clone.broadcast(broadcast_msg);
            }
        }
    });

    // Wait for either task to complete
    tokio::select! {
        _ = (&mut send_task) => recv_task.abort(),
        _ = (&mut recv_task) => send_task.abort(),
    }

    // Remove connection from state
    state.connections.write().await.remove(&conn_id);

    // Notify room that user left
    let leave_msg = format!("room:{}:{} left the room", room, conn_id);
    state.broadcast(leave_msg);
}

/// Get WebSocket connection statistics
///
/// Returns information about active connections and rooms.
pub async fn ws_stats_handler(
    State(state): State<WebSocketState>,
) -> axum::Json<serde_json::Value> {
    let connections = state.connections.read().await;

    let mut rooms: HashMap<String, usize> = HashMap::new();
    for conn in connections.values() {
        if let Some(room) = &conn.room {
            *rooms.entry(room.clone()).or_insert(0) += 1;
        }
    }

    axum::Json(serde_json::json!({
        "total_connections": connections.len(),
        "rooms": rooms,
        "connections": connections.values().map(|c| serde_json::json!({
            "user_id": c.user_id,
            "connected_at": c.connected_at,
            "room": c.room,
        })).collect::<Vec<_>>()
    }))
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_websocket_state_creation() {
        let state = WebSocketState::new();
        assert_eq!(state.tx.receiver_count(), 0);
    }

    #[tokio::test]
    async fn test_connection_count() {
        let state = WebSocketState::new();
        assert_eq!(state.connection_count().await, 0);

        // Add a connection
        {
            let mut connections = state.connections.write().await;
            connections.insert(
                "test-id".to_string(),
                ConnectionInfo {
                    user_id: "test-user".to_string(),
                    connected_at: chrono::Utc::now(),
                    room: None,
                },
            );
        }

        assert_eq!(state.connection_count().await, 1);
    }

    #[tokio::test]
    async fn test_broadcast() {
        let state = WebSocketState::new();
        let mut rx = state.tx.subscribe();

        // Broadcast a message
        state.broadcast("test message".to_string());

        // Receive the message
        let received = rx.recv().await.unwrap();
        assert_eq!(received, "test message");
    }

    #[test]
    fn test_connection_info() {
        let info = ConnectionInfo {
            user_id: "user123".to_string(),
            connected_at: chrono::Utc::now(),
            room: Some("gaming".to_string()),
        };

        assert_eq!(info.user_id, "user123");
        assert_eq!(info.room, Some("gaming".to_string()));
    }
}
