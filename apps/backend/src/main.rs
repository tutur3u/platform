//! # Tuturuuu Rust Backend - A Learning Project
//!
//! This is a beginner-friendly Rust backend application designed to teach
//! fundamental Rust concepts while building a functional web server.
//!
//! ## What You'll Learn
//! - Basic Rust syntax and ownership concepts
//! - Async programming with tokio
//! - Building web APIs with axum
//! - Error handling in Rust
//! - Working with JSON data
//! - Modular code organization
//!
//! ## Running the Application
//! ```bash
//! cargo run
//! ```
//!
//! ## Running Tests
//! ```bash
//! cargo test
//! ```

// Import external crates (libraries)
// Think of these as 'import' statements in other languages
use axum::{
    Router,
    extract::{Path, Query, State},
    http::StatusCode,
    response::Json,
    routing::{get, post},
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{Level, info};

// Import our custom modules
// These are defined in separate files in the src/ directory
mod config;
mod db;
mod examples;
mod handlers;
mod middleware;
mod models;

// ============================================================================
// DATA STRUCTURES
// ============================================================================

/// Application state that will be shared across all handlers
///
/// The `#[derive(...)]` syntax automatically implements common traits:
/// - Clone: Allows creating copies of the struct
/// - Debug: Enables formatted printing with {:?}
#[derive(Clone, Debug)]
struct AppState {
    /// A thread-safe counter demonstrating shared mutable state
    ///
    /// - Arc: Atomic Reference Counted pointer (for sharing across threads)
    /// - RwLock: Readers-Writer lock (multiple readers OR one writer)
    counter: Arc<RwLock<i32>>,

    /// In-memory storage for demonstration
    /// In a real app, this would be a database connection
    users: Arc<RwLock<Vec<User>>>,
}

/// Represents a user in our system
///
/// Derives:
/// - Serialize/Deserialize: For JSON conversion (from serde)
/// - Clone: To create copies when needed
/// - Debug: For debugging output
#[derive(Debug, Clone, Serialize, Deserialize)]
struct User {
    id: u32,
    name: String,
    email: String,
}

/// Query parameters for the greeting endpoint
///
/// This demonstrates how to extract query strings from URLs
/// Example: /greet?name=Alice
#[derive(Debug, Deserialize)]
struct GreetQuery {
    /// Optional name parameter (can be None)
    /// The #[serde(default)] means it will use the default value if not provided
    #[serde(default = "default_name")]
    name: String,
}

/// Provides a default name when none is supplied
fn default_name() -> String {
    "World".to_string()
}

// ============================================================================
// MAIN APPLICATION
// ============================================================================

/// The main function - entry point of our application
///
/// The `#[tokio::main]` attribute transforms this into an async main function.
/// Without it, we couldn't use 'await' in the main function.
#[tokio::main]
async fn main() {
    // Initialize tracing for logging
    // This sets up structured logging throughout the application
    tracing_subscriber::fmt().with_max_level(Level::INFO).init();

    info!("Starting Tuturuuu Rust Backend...");

    // Load environment variables from .env file
    // The _ = means we're ignoring the result (it's ok if .env doesn't exist)
    let _ = dotenvy::dotenv();

    // Load configuration
    let config = config::Config::from_env().expect("Failed to load configuration");
    config.validate().expect("Invalid configuration");

    info!("Configuration loaded successfully");
    info!("Environment: {}", config.environment);
    info!("Server will listen on {}", config.server_address());

    // Initialize database connection pool (optional - only if DATABASE_URL is set)
    let db_pool = if let Ok(database_url) = std::env::var("DATABASE_URL") {
        info!("Initializing database connection pool...");
        match db::init_pool(&database_url).await {
            Ok(pool) => {
                info!("Database connection pool initialized");

                // Run migrations (optional - comment out if not needed)
                // info!("Running database migrations...");
                // db::run_migrations(&pool).await.expect("Failed to run migrations");
                // info!("Migrations completed");

                Some(pool)
            }
            Err(e) => {
                tracing::warn!("Failed to initialize database pool: {}", e);
                tracing::warn!("Running without database support");
                None
            }
        }
    } else {
        tracing::warn!("DATABASE_URL not set - running without database support");
        None
    };

    // Initialize application state
    // This is shared across all request handlers
    let app_state = AppState {
        counter: Arc::new(RwLock::new(0)),
        users: Arc::new(RwLock::new(vec![
            User {
                id: 1,
                name: "Alice".to_string(),
                email: "alice@example.com".to_string(),
            },
            User {
                id: 2,
                name: "Bob".to_string(),
                email: "bob@example.com".to_string(),
            },
        ])),
    };

    // Initialize WebSocket state for real-time communication
    let ws_state = handlers::WebSocketState::new();

    // Build our application with routes
    // Router is the main type for composing handlers
    let mut app = Router::new()
        // Basic routes
        .route("/", get(root_handler))
        .route("/health", get(health_check))
        // Demonstration routes for learning
        .route("/greet", get(greet_handler))
        .route("/echo/:message", get(echo_handler))
        // Counter demonstration (shows state management)
        .route("/counter", get(get_counter))
        .route("/counter/increment", post(increment_counter))
        // User CRUD operations (legacy in-memory)
        .route("/users", get(list_users))
        .route("/users/:id", get(get_user))
        .route("/users", post(create_user))
        // Learning examples route
        .route("/examples", get(examples_handler))
        // Share state with all handlers
        .with_state(app_state);

    // Create WebSocket routes with their own state
    let ws_routes = Router::new()
        .route("/ws", get(handlers::ws_echo_handler))
        .route("/ws/broadcast", get(handlers::ws_broadcast_handler))
        .route("/ws/room/:room_name", get(handlers::ws_room_handler))
        .route("/ws/stats", get(handlers::ws_stats_handler))
        .with_state(ws_state);

    // Merge WebSocket routes
    app = app.merge(ws_routes);

    // Add auth routes if database is available
    if let Some(pool) = db_pool {
        info!("Enabling authentication and CRUD routes");

        // Public auth routes (no authentication required)
        let auth_routes = Router::new()
            .route("/api/auth/register", post(handlers::register))
            .route("/api/auth/login", post(handlers::login))
            .route("/api/auth/logout", post(handlers::logout))
            .layer(axum::Extension(pool.clone()));

        // Protected routes (require authentication)
        let protected_routes = Router::new()
            // User routes
            .route("/api/users", get(handlers::list_users))
            .route("/api/users/search", get(handlers::search_users))
            .route("/api/users/:id", get(handlers::get_user))
            .route("/api/users/:id", axum::routing::put(handlers::update_user))
            .route(
                "/api/users/:id",
                axum::routing::delete(handlers::delete_user),
            )
            .route("/api/users/:id/password", post(handlers::change_password))
            // Post routes
            .route("/api/posts", post(handlers::create_post))
            .route("/api/posts/:id", axum::routing::put(handlers::update_post))
            .route(
                "/api/posts/:id",
                axum::routing::delete(handlers::delete_post),
            )
            // Auth "me" endpoint
            .route("/api/auth/me", get(handlers::me))
            .layer(axum::middleware::from_fn(middleware::auth_middleware))
            .layer(axum::Extension(pool.clone()));

        // Public post routes (no authentication required)
        let public_post_routes = Router::new()
            .route("/api/posts", get(handlers::list_posts))
            .route("/api/posts/search", get(handlers::search_posts))
            .route("/api/posts/:id", get(handlers::get_post))
            .route("/api/posts/:id/like", post(handlers::like_post))
            .layer(axum::Extension(pool));

        app = app
            .merge(auth_routes)
            .merge(protected_routes)
            .merge(public_post_routes);
    }

    // Get port from environment or use default
    let port = std::env::var("PORT")
        .unwrap_or_else(|_| "3001".to_string())
        .parse::<u16>()
        .expect("PORT must be a valid number");

    let addr = format!("0.0.0.0:{}", port);

    info!("Server listening on http://{}", addr);
    info!("Try these endpoints:");
    info!("  - http://localhost:{}/", port);
    info!("  - http://localhost:{}/health", port);
    info!("  - http://localhost:{}/greet?name=YourName", port);
    info!("  - http://localhost:{}/counter", port);
    info!("  - http://localhost:{}/users", port);
    info!("  - http://localhost:{}/examples", port);

    // Create TCP listener
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .expect("Failed to bind to address");

    // Start the server
    // This will run forever until the process is killed
    axum::serve(listener, app)
        .await
        .expect("Server failed to start");
}

// ============================================================================
// ROUTE HANDLERS
// ============================================================================

/// Root handler - returns a welcome message
///
/// Return type explanation:
/// - Json<T>: Automatically serializes T to JSON and sets Content-Type header
/// - The return value is wrapped in Json(), which handles all the conversion
async fn root_handler() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "message": "Welcome to Tuturuuu Rust Backend!",
        "version": "0.1.0",
        "docs": "/examples",
        "endpoints": {
            "basic": [
                "GET / - This endpoint",
                "GET /health - Health check",
                "GET /examples - View learning examples"
            ],
            "demo": [
                "GET /greet?name=Name - Personalized greeting",
                "GET /echo/:message - Echo a message",
                "GET /counter - Get current counter value",
                "POST /counter/increment - Increment counter",
                "GET /users - List all users (in-memory)",
                "GET /users/:id - Get user by ID (in-memory)",
                "POST /users - Create new user (in-memory)"
            ],
            "auth": [
                "POST /api/auth/register - Register new user",
                "POST /api/auth/login - Login with email/password",
                "GET /api/auth/me - Get current user (requires auth)",
                "POST /api/auth/logout - Logout"
            ],
            "users": [
                "GET /api/users - List all users (requires admin/moderator)",
                "GET /api/users/:id - Get user by ID (requires auth)",
                "PUT /api/users/:id - Update user (requires auth)",
                "DELETE /api/users/:id - Delete user (requires auth)",
                "POST /api/users/:id/password - Change password (requires auth)",
                "GET /api/users/search?q=query - Search users (requires admin/moderator)"
            ],
            "posts": [
                "GET /api/posts - List all posts (public)",
                "GET /api/posts/:id - Get post by ID or slug (public)",
                "POST /api/posts - Create new post (requires auth)",
                "PUT /api/posts/:id - Update post (requires auth)",
                "DELETE /api/posts/:id - Delete post (requires auth)",
                "POST /api/posts/:id/like - Like a post (public)",
                "GET /api/posts/search?q=query - Search posts (public)"
            ],
            "websockets": [
                "WS /ws - Echo WebSocket (sends back any message received)",
                "WS /ws/broadcast - Broadcast WebSocket (messages sent to all clients)",
                "WS /ws/room/:room_name - Room-based WebSocket (messages only in room)",
                "GET /ws/stats - WebSocket connection statistics"
            ]
        }
    }))
}

/// Health check endpoint
///
/// Demonstrates a simple endpoint with custom status codes
/// Returns both HTTP 200 status and a JSON body
async fn health_check() -> (StatusCode, Json<serde_json::Value>) {
    (
        StatusCode::OK,
        Json(serde_json::json!({
            "status": "healthy",
            "timestamp": chrono::Utc::now().to_rfc3339()
        })),
    )
}

/// Greeting handler with query parameters
///
/// The Query<T> extractor automatically parses query string into our struct
/// Example: /greet?name=Alice will create GreetQuery { name: "Alice" }
async fn greet_handler(Query(params): Query<GreetQuery>) -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "greeting": format!("Hello, {}!", params.name),
        "tip": "You can change the name with ?name=YourName"
    }))
}

/// Echo handler demonstrating path parameters
///
/// Path<String> extracts the :message part from the URL
/// Example: /echo/hello will extract "hello"
async fn echo_handler(Path(message): Path<String>) -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "original": message,
        "reversed": message.chars().rev().collect::<String>(),
        "uppercase": message.to_uppercase(),
        "length": message.len()
    }))
}

/// Get current counter value
///
/// Demonstrates reading shared state
/// The .read().await acquires a read lock (allows multiple readers)
async fn get_counter(State(state): State<AppState>) -> Json<serde_json::Value> {
    let counter = state.counter.read().await;
    Json(serde_json::json!({
        "value": *counter,
        "tip": "POST to /counter/increment to increase"
    }))
}

/// Increment the counter
///
/// Demonstrates writing to shared state
/// The .write().await acquires a write lock (exclusive access)
async fn increment_counter(State(state): State<AppState>) -> Json<serde_json::Value> {
    let mut counter = state.counter.write().await;
    *counter += 1;
    Json(serde_json::json!({
        "value": *counter,
        "message": "Counter incremented"
    }))
}

/// List all users
///
/// Demonstrates reading from a collection in shared state
async fn list_users(State(state): State<AppState>) -> Json<Vec<User>> {
    let users = state.users.read().await;
    Json(users.clone())
}

/// Get a specific user by ID
///
/// Demonstrates:
/// - Path parameter extraction
/// - Pattern matching with Result<T, E>
/// - Custom error responses
async fn get_user(
    State(state): State<AppState>,
    Path(id): Path<u32>,
) -> Result<Json<User>, (StatusCode, Json<serde_json::Value>)> {
    let users = state.users.read().await;

    // Find user by id
    // .find() returns Option<&User>
    match users.iter().find(|u| u.id == id) {
        Some(user) => Ok(Json(user.clone())),
        None => Err((
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({
                "error": "User not found",
                "id": id
            })),
        )),
    }
}

/// Create a new user
///
/// Demonstrates:
/// - JSON body parsing with Json<T> extractor
/// - Writing to shared state
/// - Returning created resource with 201 status
async fn create_user(
    State(state): State<AppState>,
    Json(mut new_user): Json<User>,
) -> (StatusCode, Json<User>) {
    let mut users = state.users.write().await;

    // Generate new ID (in real app, database would do this)
    let new_id = users.iter().map(|u| u.id).max().unwrap_or(0) + 1;
    new_user.id = new_id;

    users.push(new_user.clone());

    (StatusCode::CREATED, Json(new_user))
}

/// Examples handler showing Rust concepts
///
/// This endpoint demonstrates various Rust features
async fn examples_handler() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "message": "Rust Learning Examples",
        "topics": {
            "ownership": {
                "description": "Rust's ownership system ensures memory safety without garbage collection",
                "example": "See src/examples/ownership.rs"
            },
            "borrowing": {
                "description": "References allow you to access data without taking ownership",
                "example": "See src/examples/borrowing.rs"
            },
            "error_handling": {
                "description": "Result and Option types for handling errors explicitly",
                "example": "See src/examples/errors.rs"
            },
            "traits": {
                "description": "Traits define shared behavior (like interfaces)",
                "example": "See src/examples/traits.rs"
            },
            "async": {
                "description": "Async/await for concurrent programming",
                "example": "This entire server uses async Rust!"
            }
        },
        "next_steps": [
            "Read the README.md for setup instructions",
            "Check LEARNING.md for Rust fundamentals",
            "Explore the src/ directory for code examples",
            "Try modifying handlers and see what happens!"
        ]
    }))
}
