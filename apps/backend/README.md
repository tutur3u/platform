# Rust Backend Learning Project

![CI Status](https://github.com/tuturuuu/platform/workflows/Rust%20Backend%20CI/badge.svg)

A beginner-friendly Rust backend application designed to teach fundamental Rust concepts while building a functional web server using the Axum framework.

## Table of Contents

- [Getting Started](#getting-started)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Running the Application](#running-the-application)
- [Project Structure](#project-structure)
- [Available Endpoints](#available-endpoints)
- [Learning Resources](#learning-resources)
- [Development Workflow](#development-workflow)
- [Testing](#testing)
- [Continuous Integration](#continuous-integration)
- [Common Issues](#common-issues)

## Getting Started

This project is designed for developers who are new to Rust but have some programming experience. Each file contains extensive comments explaining Rust concepts as they appear.

### Prerequisites

Before you begin, ensure you have the following installed:

1. **Rust and Cargo** (v1.70 or higher)
   ```bash
   # Install using rustup (recommended)
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

   # Verify installation
   rustc --version
   cargo --version
   ```

2. **A code editor** with Rust support:
   - VS Code with rust-analyzer extension (recommended)
   - IntelliJ IDEA with Rust plugin
   - Any editor with Language Server Protocol (LSP) support

## Installation

1. Navigate to the backend directory:
   ```bash
   cd apps/backend
   ```

2. Install dependencies (this will download and compile all crates):
   ```bash
   cargo build
   ```

   Note: The first build might take a while as Cargo compiles all dependencies.

## Running the Application

### Development Mode

Run the server with auto-reload on code changes:

```bash
cargo watch -x run
```

Or simply run once:

```bash
cargo run
```

The server will start on `http://localhost:3001` by default.

### Setting a Custom Port

You can change the port using the `PORT` environment variable:

```bash
PORT=8080 cargo run
```

Or create a `.env` file in the `apps/backend` directory:

```env
PORT=3001
```

## Project Structure

```
apps/backend/
├── Cargo.toml              # Project configuration and dependencies
├── Cargo.lock              # Dependency lock file (auto-generated)
├── README.md               # This file
├── LEARNING.md             # Comprehensive Rust learning guide
├── .env                    # Environment variables (create this)
└── src/
    ├── main.rs             # Application entry point and HTTP handlers
    ├── examples/           # Learning examples for Rust concepts
    │   ├── mod.rs          # Module declaration
    │   ├── ownership.rs    # Ownership and move semantics
    │   ├── borrowing.rs    # References and borrowing rules
    │   ├── errors.rs       # Error handling with Result and Option
    │   ├── traits.rs       # Traits and polymorphism
    │   └── collections.rs  # Vectors, Strings, and HashMaps
    ├── handlers/           # HTTP request handlers (to be expanded)
    │   └── mod.rs
    └── models/             # Data models (to be expanded)
        └── mod.rs
```

### Key Files Explained

- **`main.rs`**: The heart of the application. Contains:
  - Server setup and configuration
  - Route definitions
  - HTTP handlers (functions that respond to requests)
  - Detailed comments explaining every concept

- **`examples/`**: Educational modules demonstrating core Rust concepts:
  - **`ownership.rs`**: How Rust manages memory without garbage collection
  - **`borrowing.rs`**: References, mutable/immutable borrowing
  - **`errors.rs`**: Handling errors with `Result<T, E>` and `Option<T>`
  - **`traits.rs`**: Interfaces and polymorphism in Rust
  - **`collections.rs`**: Working with Vecs, Strings, and HashMaps

- **`Cargo.toml`**: Defines the project and its dependencies:
  - `tokio`: Async runtime for handling concurrent requests
  - `axum`: Modern, type-safe web framework
  - `serde`: Serialization/deserialization for JSON
  - `tracing`: Structured logging for debugging

## Available Endpoints

Once the server is running, you can test these endpoints:

### Basic Endpoints

| Method | Endpoint | Description | Example |
|--------|----------|-------------|---------|
| GET | `/` | Welcome message and API docs | `curl http://localhost:3001/` |
| GET | `/health` | Health check with timestamp | `curl http://localhost:3001/health` |

### Learning Endpoints

| Method | Endpoint | Description | Example |
|--------|----------|-------------|---------|
| GET | `/greet` | Greet with default name | `curl http://localhost:3001/greet` |
| GET | `/greet?name=Alice` | Personalized greeting | `curl http://localhost:3001/greet?name=Alice` |
| GET | `/echo/:message` | Echo and transform message | `curl http://localhost:3001/echo/hello` |
| GET | `/examples` | View learning resources | `curl http://localhost:3001/examples` |

### State Management Examples

| Method | Endpoint | Description | Example |
|--------|----------|-------------|---------|
| GET | `/counter` | Get current counter value | `curl http://localhost:3001/counter` |
| POST | `/counter/increment` | Increment the counter | `curl -X POST http://localhost:3001/counter/increment` |

### In-Memory CRUD Examples

| Method | Endpoint | Description | Example |
|--------|----------|-------------|---------|
| GET | `/users` | List all in-memory users | `curl http://localhost:3001/users` |
| GET | `/users/:id` | Get in-memory user by ID | `curl http://localhost:3001/users/1` |
| POST | `/users` | Create new in-memory user | See below |

**Creating an in-memory user:**
```bash
curl -X POST http://localhost:3001/users \
  -H "Content-Type: application/json" \
  -d '{"id":0,"name":"Charlie","email":"charlie@example.com"}'
```

---

## Production API Endpoints

The following endpoints require a PostgreSQL database connection (set `DATABASE_URL` in `.env`):

### Authentication API

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/auth/register` | Register new user | No |
| POST | `/api/auth/login` | Login with email/password | No |
| GET | `/api/auth/me` | Get current user info | Yes |
| POST | `/api/auth/logout` | Logout (client-side) | Yes |

#### Example: Register

```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "password": "securepassword123"
  }'
```

Response:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
  "expires_in": 86400
}
```

#### Example: Login

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "securepassword123"
  }'
```

#### Example: Get Current User

```bash
curl http://localhost:3001/api/auth/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Users API

| Method | Endpoint | Description | Auth Required | Permissions |
|--------|----------|-------------|---------------|-------------|
| GET | `/api/users` | List all users (paginated) | Yes | Admin/Moderator |
| GET | `/api/users/search?q=query` | Search users by name/email | Yes | Admin/Moderator |
| GET | `/api/users/:id` | Get user by ID | Yes | Self or Admin/Moderator |
| PUT | `/api/users/:id` | Update user | Yes | Self or Admin |
| DELETE | `/api/users/:id` | Delete user (soft delete) | Yes | Self or Admin |
| POST | `/api/users/:id/password` | Change password | Yes | Self only |

#### Example: List Users (Paginated)

```bash
curl "http://localhost:3001/api/users?page=1&per_page=20" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

Response:
```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "john@example.com",
      "name": "John Doe",
      "role": "user",
      "email_verified": false,
      "is_active": true,
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T00:00:00Z"
    }
  ],
  "page": 1,
  "per_page": 20,
  "total": 45,
  "total_pages": 3
}
```

#### Example: Update User

```bash
curl -X PUT http://localhost:3001/api/users/550e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Updated",
    "email": "john.new@example.com"
  }'
```

#### Example: Change Password

```bash
curl -X POST http://localhost:3001/api/users/550e8400-e29b-41d4-a716-446655440000/password \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "current_password": "oldpassword123",
    "new_password": "newpassword123"
  }'
```

### Posts API

| Method | Endpoint | Description | Auth Required | Permissions |
|--------|----------|-------------|---------------|-------------|
| GET | `/api/posts` | List all posts (public) | No | - |
| GET | `/api/posts/search?q=query` | Search posts | No | - |
| GET | `/api/posts/:id` | Get post by ID or slug | No | - |
| POST | `/api/posts/:id/like` | Like a post | No | - |
| POST | `/api/posts` | Create new post | Yes | Author |
| PUT | `/api/posts/:id` | Update post | Yes | Author or Admin |
| DELETE | `/api/posts/:id` | Delete post | Yes | Author or Admin |

#### Example: List Posts

```bash
# List all published posts
curl "http://localhost:3001/api/posts?page=1&per_page=20"

# Filter by status (requires auth)
curl "http://localhost:3001/api/posts?status=draft" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Filter by author
curl "http://localhost:3001/api/posts?author_id=550e8400-e29b-41d4-a716-446655440000"
```

Response:
```json
{
  "data": [
    {
      "id": "660e8400-e29b-41d4-a716-446655440000",
      "author_id": "550e8400-e29b-41d4-a716-446655440000",
      "title": "Getting Started with Rust",
      "slug": "getting-started-with-rust",
      "content": "Full post content here...",
      "excerpt": "A beginner's guide to Rust...",
      "status": "published",
      "view_count": 142,
      "like_count": 15,
      "tags": ["rust", "programming", "tutorial"],
      "featured_image_url": null,
      "published_at": "2024-01-01T00:00:00Z",
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T00:00:00Z"
    }
  ],
  "page": 1,
  "per_page": 20,
  "total": 100,
  "total_pages": 5
}
```

#### Example: Create Post

```bash
curl -X POST http://localhost:3001/api/posts \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "My First Post",
    "content": "This is the content of my post...",
    "excerpt": "A short summary",
    "status": "draft",
    "tags": ["rust", "web"]
  }'
```

#### Example: Update Post

```bash
curl -X PUT http://localhost:3001/api/posts/660e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Updated Title",
    "status": "published"
  }'
```

#### Example: Search Posts

```bash
# Full-text search
curl "http://localhost:3001/api/posts/search?q=rust+tutorial&limit=10"

# Search by tag
curl "http://localhost:3001/api/posts/search?tag=rust&limit=10"
```

#### Example: Like Post

```bash
curl -X POST http://localhost:3001/api/posts/660e8400-e29b-41d4-a716-446655440000/like
```

---

## Database Setup

To use the production API endpoints, you need to set up a PostgreSQL database:

### 1. Install PostgreSQL

- **Ubuntu/Debian**: `sudo apt install postgresql`
- **macOS**: `brew install postgresql`
- **Windows**: Download from [postgresql.org](https://www.postgresql.org/download/)

### 2. Create Database

```bash
# Start PostgreSQL service
sudo service postgresql start  # Linux
brew services start postgresql  # macOS

# Create database
createdb tuturuuu_backend

# Or using psql
psql -U postgres
CREATE DATABASE tuturuuu_backend;
\q
```

### 3. Configure Environment

Create a `.env` file in `apps/backend/`:

```env
# Server Configuration
HOST=127.0.0.1
PORT=3001
APP_ENV=development

# Database Configuration
DATABASE_URL=postgresql://postgres:password@localhost:5432/tuturuuu_backend

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production-minimum-32-chars
JWT_EXPIRATION_HOURS=24

# File Upload Configuration
MAX_FILE_SIZE_MB=10

# CORS Configuration
CORS_ORIGIN=*

# Logging Level
RUST_LOG=info
```

### 4. Run Migrations

Migrations are located in `migrations/` and will be applied automatically when the server starts if the database is configured.

Alternatively, you can use SQLx CLI:

```bash
# Install SQLx CLI
cargo install sqlx-cli --no-default-features --features postgres

# Run migrations
sqlx migrate run
```

### Migration Files

- `001_create_users_table.sql` - User authentication and profiles
- `002_create_posts_table.sql` - Blog posts and content
- `003_create_sessions_table.sql` - JWT session tracking
- `004_create_file_metadata_table.sql` - File upload metadata

---

## WebSocket API

Real-time bidirectional communication using WebSockets.

### WebSocket Endpoints

| Endpoint | Description | Use Case |
|----------|-------------|----------|
| `ws://localhost:3001/ws` | Echo WebSocket | Testing, learning WebSocket basics |
| `ws://localhost:3001/ws/broadcast` | Broadcast WebSocket | Chat rooms, notifications to all users |
| `ws://localhost:3001/ws/room/:room_name` | Room-based WebSocket | Private chat rooms, multiplayer games |
| `GET /ws/stats` | WebSocket statistics | Monitor active connections |

### Example 1: Echo WebSocket (JavaScript)

The simplest WebSocket pattern - everything you send is echoed back:

```javascript
// Connect to echo WebSocket
const ws = new WebSocket('ws://localhost:3001/ws');

// Handle connection open
ws.addEventListener('open', (event) => {
    console.log('Connected to echo server');
    ws.send('Hello WebSocket!');
});

// Handle incoming messages
ws.addEventListener('message', (event) => {
    console.log('Received:', event.data);
    // Output: "Echo: Hello WebSocket!"
});

// Handle errors
ws.addEventListener('error', (error) => {
    console.error('WebSocket error:', error);
});

// Handle connection close
ws.addEventListener('close', (event) => {
    console.log('Disconnected from server');
});
```

### Example 2: Broadcast WebSocket (JavaScript)

Messages are broadcast to all connected clients:

```javascript
// Connect to broadcast WebSocket
const ws = new WebSocket('ws://localhost:3001/ws/broadcast');

ws.addEventListener('open', (event) => {
    console.log('Connected to broadcast server');
});

ws.addEventListener('message', (event) => {
    console.log('Broadcast message:', event.data);
    // Welcome message: "Welcome! You are connected as <uuid>..."
    // User messages: "[<user-id>]: message content"
    // Disconnect: "<user-id> disconnected..."
});

// Send a message to all users
document.getElementById('sendBtn').addEventListener('click', () => {
    const message = document.getElementById('messageInput').value;
    ws.send(message);
});
```

### Example 3: Room-based WebSocket (JavaScript)

Join a specific room and only receive messages from that room:

```javascript
// Connect to a specific room
const roomName = 'gaming';
const ws = new WebSocket(`ws://localhost:3001/ws/room/${roomName}`);

ws.addEventListener('open', (event) => {
    console.log(`Connected to room: ${roomName}`);
});

ws.addEventListener('message', (event) => {
    console.log(`Room message:`, event.data);
    // Welcome: "Welcome to room 'gaming'! You are <uuid> of <count> users..."
    // Messages: "[<user-id>]: message content"
    // Join/leave: "<user-id> joined the room" / "left the room"
});

// Send message to room
ws.send('Hello room members!');
```

### Example 4: Python WebSocket Client

```python
import asyncio
import websockets

async def echo_client():
    uri = "ws://localhost:3001/ws"
    async with websockets.connect(uri) as websocket:
        # Send message
        await websocket.send("Hello from Python!")

        # Receive response
        response = await websocket.recv()
        print(f"Received: {response}")

# Run the client
asyncio.run(echo_client())
```

### Example 5: Broadcasting to Rooms (Rust Server)

The server automatically handles room filtering:

```rust
// Messages with format "room:{room_name}:{content}" are only
// sent to clients in that specific room

// Example internal broadcast:
// "room:gaming:[user123]: Let's play!"  // Only to gaming room users
// "room:chat:[user456]: Hello world!"   // Only to chat room users
```

### WebSocket Connection Statistics

Get real-time information about active connections:

```bash
curl http://localhost:3001/ws/stats
```

Response:
```json
{
  "total_connections": 5,
  "rooms": {
    "gaming": 3,
    "chat": 2
  },
  "connections": [
    {
      "user_id": "550e8400-e29b-41d4-a716-446655440000",
      "connected_at": "2024-01-01T12:00:00Z",
      "room": "gaming"
    }
  ]
}
```

### WebSocket Testing with `websocat`

Install websocat for command-line WebSocket testing:

```bash
# Install
cargo install websocat

# Echo test
websocat ws://localhost:3001/ws

# Broadcast test
websocat ws://localhost:3001/ws/broadcast

# Room test
websocat ws://localhost:3001/ws/room/gaming
```

### WebSocket Features

- **Connection Tracking**: Each connection is assigned a unique UUID
- **Broadcast Support**: Send messages to all connected clients
- **Room-based Messaging**: Isolate messages to specific rooms
- **Connection Statistics**: Monitor active connections and rooms
- **Ping/Pong**: Automatic keep-alive with heartbeat
- **Graceful Shutdown**: Proper cleanup on disconnect

### WebSocket Use Cases

1. **Real-time Chat**: Instant messaging between users
2. **Live Notifications**: Push updates to users instantly
3. **Collaborative Editing**: Multiple users editing the same document
4. **Gaming**: Multiplayer game state synchronization
5. **Live Dashboards**: Real-time data visualization
6. **IoT Monitoring**: Device status updates

## Learning Resources

### In This Project

1. **Read `LEARNING.md`**: Comprehensive guide to Rust fundamentals
2. **Explore `src/main.rs`**: Heavily commented web server code
3. **Study `src/examples/`**: Runnable examples of core concepts
4. **Run the tests**: `cargo test` to see examples in action

### External Resources

#### Official Documentation
- [The Rust Book](https://doc.rust-lang.org/book/) - Start here!
- [Rust by Example](https://doc.rust-lang.org/rust-by-example/)
- [Rustlings](https://github.com/rust-lang/rustlings) - Interactive exercises

#### Web Development
- [Axum Documentation](https://docs.rs/axum/latest/axum/)
- [Tokio Tutorial](https://tokio.rs/tokio/tutorial)
- [Serde Documentation](https://serde.rs/)

#### Community
- [Rust Users Forum](https://users.rust-lang.org/)
- [Rust Discord](https://discord.gg/rust-lang)
- [r/rust subreddit](https://www.reddit.com/r/rust/)

## Development Workflow

### 1. Making Changes

Edit any `.rs` file and save. If using `cargo watch`, the server will automatically restart. Otherwise, stop the server (Ctrl+C) and run `cargo run` again.

### 2. Checking Your Code

Rust has excellent tooling to help you write correct code:

```bash
# Check for errors without compiling
cargo check

# Compile and run
cargo run

# Run tests
cargo test

# Format your code
cargo fmt

# Lint your code
cargo clippy
```

### 3. Understanding Compiler Messages

Rust's compiler is famously helpful. When you get an error:

1. **Read the entire message** - it often includes the solution
2. **Look at the error code** - e.g., `E0382` can be looked up with `rustc --explain E0382`
3. **Check the suggested fix** - the compiler often suggests exactly what to change

Example:
```
error[E0382]: borrow of moved value: `s`
  --> src/main.rs:5:20
   |
3  |     let s = String::from("hello");
   |         - move occurs because `s` has type `String`
4  |     let s2 = s;
   |              - value moved here
5  |     println!("{}", s);
   |                    ^ value borrowed here after move
```

### 4. Adding New Features

To add a new endpoint:

1. Define the handler function in `src/main.rs`:
   ```rust
   async fn my_handler() -> Json<serde_json::Value> {
       Json(json!({"message": "Hello!"}))
   }
   ```

2. Add the route in the `main()` function:
   ```rust
   let app = Router::new()
       .route("/my-route", get(my_handler))
       // ... other routes
   ```

3. Test your endpoint:
   ```bash
   curl http://localhost:3001/my-route
   ```

## Testing

### Running All Tests

```bash
cargo test
```

### Running Specific Tests

```bash
# Test a specific module
cargo test ownership

# Test a specific function
cargo test test_ownership_examples

# Show println! output
cargo test -- --nocapture
```

### Writing Your Own Tests

Add tests at the bottom of any file:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_something() {
        let result = 2 + 2;
        assert_eq!(result, 4);
    }
}
```

## Continuous Integration

This project uses GitHub Actions for continuous integration. On every push and pull request, the CI pipeline automatically:

### 1. **Check** - Verifies compilation
```bash
cargo check --all-features
```

### 2. **Test** - Runs the test suite
```bash
cargo test --all-features
```

### 3. **Format** - Checks code formatting
```bash
cargo fmt --all -- --check
```

### 4. **Clippy** - Lints code for common mistakes
```bash
cargo clippy --all-features -- -D warnings
```

### 5. **Build** - Creates release builds on multiple platforms
- Ubuntu (Linux)
- macOS

### 6. **Security Audit** - Checks for known vulnerabilities
```bash
cargo audit
```

### Running CI Checks Locally

Before pushing code, you can run these checks locally:

```bash
# Check compilation
cargo check

# Run tests
cargo test

# Format code
cargo fmt

# Run linter
cargo clippy -- -D warnings

# Security audit (requires cargo-audit)
cargo install cargo-audit
cargo audit
```

### CI Badge

The CI status badge at the top of this README shows whether the latest build passed or failed.

## Common Issues

### Issue: "error: linking with `cc` failed"

**Solution**: Install build essentials:
- Ubuntu/Debian: `sudo apt install build-essential`
- macOS: `xcode-select --install`
- Windows: Install [Visual Studio C++ Build Tools](https://visualstudio.microsoft.com/downloads/)

### Issue: "error: no default toolchain configured"

**Solution**: Install Rust via rustup:
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### Issue: "Address already in use (os error 48)"

**Solution**: Another process is using port 3001. Either:
- Kill the other process
- Use a different port: `PORT=3002 cargo run`

### Issue: Slow compilation times

**Solutions**:
- Use `cargo check` instead of `cargo build` during development
- Enable incremental compilation (should be on by default)
- Install `sccache` for distributed compilation caching
- Use `cargo watch` to avoid recompiling unnecessarily

### Issue: "cannot find macro `json` in this scope"

**Solution**: Add to the top of your file:
```rust
use serde_json::json;
```

## Next Steps

1. **Complete the Rust Book**: Read chapters 1-10 of [The Rust Book](https://doc.rust-lang.org/book/)

2. **Modify the examples**: Try changing the code in `src/examples/` and see what happens

3. **Add your own endpoints**: Create new routes that do something interesting

4. **Implement a real feature**: Try adding:
   - User authentication
   - Database integration (with SQLx or Diesel)
   - File upload/download
   - WebSocket support

5. **Explore testing**: Write comprehensive tests for your handlers

6. **Learn about production deployment**: Look into Docker, systemd, or cloud platforms

## Contributing

This is a learning project, so feel free to:
- Add more examples
- Improve documentation
- Fix bugs or clarify confusing parts
- Share your own learning resources

## License

This project is part of the Tuturuuu platform and follows the same license as the parent repository.

## Getting Help

- Check `LEARNING.md` for detailed explanations
- Read the comments in the source code
- Join the Rust community (links above)
- Open an issue in the repository

Happy learning! Remember: Rust has a steep learning curve, but the benefits are worth it. Take your time, experiment, and don't be afraid to make mistakes!
