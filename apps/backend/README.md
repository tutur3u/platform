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

### CRUD Examples (Users)

| Method | Endpoint | Description | Example |
|--------|----------|-------------|---------|
| GET | `/users` | List all users | `curl http://localhost:3001/users` |
| GET | `/users/:id` | Get user by ID | `curl http://localhost:3001/users/1` |
| POST | `/users` | Create new user | See below |

**Creating a user:**
```bash
curl -X POST http://localhost:3001/users \
  -H "Content-Type: application/json" \
  -d '{"id":0,"name":"Charlie","email":"charlie@example.com"}'
```

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
