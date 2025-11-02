//! # Concurrency in Rust
//!
//! Rust provides fearless concurrency - the type system helps catch concurrency bugs
//! at compile time. This module covers both traditional threading and async/await patterns.
//!
//! ## Key Concepts
//!
//! ### Threading (OS-level parallelism)
//! - `std::thread` for spawning OS threads
//! - `std::sync` for synchronization primitives
//! - Send and Sync traits for thread safety
//!
//! ### Async/Await (Cooperative multitasking)
//! - `async` functions and `await` keyword
//! - `tokio` runtime for executing async tasks
//! - Futures and task spawning
//!
//! ## When to Use What
//!
//! - Use **threads** for CPU-bound parallel work
//! - Use **async/await** for I/O-bound concurrent work
//! - Async is more lightweight but requires a runtime (like Tokio)

use std::sync::{Arc, Mutex, RwLock};
use std::thread;
use std::time::Duration;

/// # Basic Thread Spawning
///
/// Demonstrates how to create and join threads.
pub fn thread_basics() {
    println!("=== Thread Basics ===");

    // Spawn a thread
    let handle = thread::spawn(|| {
        for i in 1..=5 {
            println!("Thread: count {}", i);
            thread::sleep(Duration::from_millis(100));
        }
    });

    // Main thread continues
    for i in 1..=3 {
        println!("Main: count {}", i);
        thread::sleep(Duration::from_millis(150));
    }

    // Wait for the spawned thread to finish
    handle.join().unwrap();
    println!("Thread finished!");
}

/// # Moving Data into Threads
///
/// Use `move` to transfer ownership of data into a thread.
pub fn thread_move_example() {
    println!("\n=== Moving Data into Threads ===");

    let data = vec![1, 2, 3, 4, 5];

    // `move` takes ownership of `data`
    let handle = thread::spawn(move || {
        println!("Thread received: {:?}", data);
        let sum: i32 = data.iter().sum();
        sum
    });

    // data is no longer available here
    // println!("{:?}", data); // ERROR

    let result = handle.join().unwrap();
    println!("Thread returned: {}", result);
}

/// # Message Passing with Channels
///
/// Channels allow threads to communicate by sending messages.
/// "Do not communicate by sharing memory; instead, share memory by communicating."
pub fn channel_basics() {
    use std::sync::mpsc;

    println!("\n=== Channel Basics ===");

    let (tx, rx) = mpsc::channel();

    thread::spawn(move || {
        let messages = vec!["hello", "from", "the", "thread"];

        for msg in messages {
            tx.send(msg).unwrap();
            thread::sleep(Duration::from_millis(100));
        }
    });

    // Receive messages
    for received in rx {
        println!("Received: {}", received);
    }
}

/// # Multiple Producers, Single Consumer
///
/// Demonstrates cloning the sender to have multiple producers.
pub fn mpsc_example() {
    use std::sync::mpsc;

    println!("\n=== Multiple Producers ===");

    let (tx, rx) = mpsc::channel();

    // Clone the sender for multiple producers
    let tx1 = tx.clone();
    let tx2 = tx.clone();

    thread::spawn(move || {
        tx1.send("Producer 1: Hello").unwrap();
    });

    thread::spawn(move || {
        tx2.send("Producer 2: World").unwrap();
    });

    drop(tx); // Drop original sender

    for received in rx {
        println!("{}", received);
    }
}

/// # Shared State with Mutex
///
/// Mutex allows shared mutable access across threads.
pub fn mutex_shared_state() {
    println!("\n=== Shared State with Mutex ===");

    let counter = Arc::new(Mutex::new(0));
    let mut handles = vec![];

    for i in 0..10 {
        let counter_clone = Arc::clone(&counter);
        let handle = thread::spawn(move || {
            let mut num = counter_clone.lock().unwrap();
            *num += 1;
            println!("Thread {} incremented counter", i);
        });
        handles.push(handle);
    }

    for handle in handles {
        handle.join().unwrap();
    }

    println!("Final count: {}", *counter.lock().unwrap());
}

/// # Read-Write Lock for Read-Heavy Workloads
///
/// RwLock allows multiple readers or one writer.
pub fn rwlock_example() {
    println!("\n=== RwLock Example ===");

    let data = Arc::new(RwLock::new(vec![1, 2, 3]));
    let mut handles = vec![];

    // Spawn reader threads
    for i in 0..3 {
        let data_clone = Arc::clone(&data);
        let handle = thread::spawn(move || {
            let vec = data_clone.read().unwrap();
            println!("Reader {} sees: {:?}", i, *vec);
            thread::sleep(Duration::from_millis(100));
        });
        handles.push(handle);
    }

    thread::sleep(Duration::from_millis(50));

    // Spawn writer thread
    let data_clone = Arc::clone(&data);
    let handle = thread::spawn(move || {
        let mut vec = data_clone.write().unwrap();
        vec.push(4);
        println!("Writer added element");
    });
    handles.push(handle);

    for handle in handles {
        handle.join().unwrap();
    }

    println!("Final data: {:?}", data.read().unwrap());
}

/// # Barrier: Synchronization Point
///
/// Barrier makes threads wait until all reach a certain point.
pub fn barrier_example() {
    use std::sync::Barrier;

    println!("\n=== Barrier Example ===");

    let barrier = Arc::new(Barrier::new(3));
    let mut handles = vec![];

    for i in 0..3 {
        let barrier_clone = Arc::clone(&barrier);
        let handle = thread::spawn(move || {
            println!("Thread {} before barrier", i);
            thread::sleep(Duration::from_millis(i * 100));
            barrier_clone.wait(); // Wait for all threads
            println!("Thread {} after barrier", i);
        });
        handles.push(handle);
    }

    for handle in handles {
        handle.join().unwrap();
    }
}

/// # Async/Await Basics
///
/// Demonstrates basic async function syntax and execution.
pub async fn async_hello() {
    println!("Hello from async!");
}

pub async fn async_basics_demo() {
    println!("\n=== Async Basics ===");
    async_hello().await;

    // Async block
    let future = async {
        println!("Inside async block");
        42
    };

    let result = future.await;
    println!("Async block returned: {}", result);
}

/// # Spawning Async Tasks with Tokio
///
/// Demonstrates spawning concurrent async tasks.
pub async fn tokio_spawn_example() {
    println!("\n=== Tokio Spawn ===");

    let handle1 = tokio::spawn(async {
        for i in 1..=3 {
            println!("Task 1: {}", i);
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
        "Task 1 done"
    });

    let handle2 = tokio::spawn(async {
        for i in 1..=3 {
            println!("Task 2: {}", i);
            tokio::time::sleep(Duration::from_millis(150)).await;
        }
        "Task 2 done"
    });

    let (result1, result2) = tokio::join!(handle1, handle2);
    println!("Results: {:?}, {:?}", result1, result2);
}

/// # Select: Racing Futures
///
/// Process whichever future completes first.
pub async fn select_example() {
    println!("\n=== Select Example ===");

    let future1 = async {
        tokio::time::sleep(Duration::from_millis(100)).await;
        "Future 1"
    };

    let future2 = async {
        tokio::time::sleep(Duration::from_millis(200)).await;
        "Future 2"
    };

    tokio::select! {
        result = future1 => println!("First completed: {}", result),
        result = future2 => println!("First completed: {}", result),
    }
}

/// # Async Channel
///
/// Tokio provides async-friendly channels.
pub async fn async_channel_example() {
    println!("\n=== Async Channel ===");

    let (tx, mut rx) = tokio::sync::mpsc::channel(32);

    tokio::spawn(async move {
        for i in 0..5 {
            tx.send(i).await.unwrap();
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
    });

    while let Some(value) = rx.recv().await {
        println!("Received: {}", value);
    }
}

/// # Parallel Task Processing
///
/// Process multiple tasks concurrently and collect results.
pub async fn parallel_processing() {
    println!("\n=== Parallel Processing ===");

    let tasks: Vec<_> = (1..=5)
        .map(|i| {
            tokio::spawn(async move {
                tokio::time::sleep(Duration::from_millis(i * 100)).await;
                i * 2
            })
        })
        .collect();

    let results: Vec<_> = futures::future::join_all(tasks)
        .await
        .into_iter()
        .map(|r| r.unwrap())
        .collect();

    println!("Results: {:?}", results);
}

/// # Timeout Pattern
///
/// Cancel an operation if it takes too long.
pub async fn timeout_example() {
    println!("\n=== Timeout Example ===");

    let slow_operation = async {
        tokio::time::sleep(Duration::from_secs(2)).await;
        "Completed"
    };

    match tokio::time::timeout(Duration::from_secs(1), slow_operation).await {
        Ok(result) => println!("Operation completed: {}", result),
        Err(_) => println!("Operation timed out!"),
    }
}

/// # Shared State in Async Context
///
/// Demonstrates using Arc<Mutex<T>> in async code.
pub async fn async_shared_state() {
    println!("\n=== Async Shared State ===");

    let counter = Arc::new(Mutex::new(0));
    let mut handles = vec![];

    for i in 0..5 {
        let counter_clone = Arc::clone(&counter);
        let handle = tokio::spawn(async move {
            // Don't hold the lock across await points!
            let mut num = counter_clone.lock().unwrap();
            *num += 1;
            println!("Task {} incremented counter", i);
        });
        handles.push(handle);
    }

    for handle in handles {
        handle.await.unwrap();
    }

    println!("Final count: {}", *counter.lock().unwrap());
}

/// # Async Mutex (Tokio)
///
/// Tokio provides an async-aware Mutex for holding locks across awaits.
pub async fn tokio_mutex_example() {
    println!("\n=== Tokio Mutex ===");

    let data = Arc::new(tokio::sync::Mutex::new(0));
    let mut handles = vec![];

    for i in 0..5 {
        let data_clone = Arc::clone(&data);
        let handle = tokio::spawn(async move {
            let mut num = data_clone.lock().await; // Async lock
            *num += 1;
            // Can safely await here while holding the lock
            tokio::time::sleep(Duration::from_millis(10)).await;
            println!("Task {} incremented: {}", i, *num);
        });
        handles.push(handle);
    }

    for handle in handles {
        handle.await.unwrap();
    }

    println!("Final value: {}", *data.lock().await);
}

/// # CPU-Bound Work with spawn_blocking
///
/// Use spawn_blocking for CPU-intensive work in async context.
pub async fn spawn_blocking_example() {
    println!("\n=== Spawn Blocking ===");

    let result = tokio::task::spawn_blocking(|| {
        // Simulate CPU-intensive work
        let mut sum: u64 = 0;
        for i in 0..10_000_000u64 {
            sum += i;
        }
        sum
    })
    .await
    .unwrap();

    println!("CPU-bound result: {}", result);
}

/// # Stream Processing
///
/// Process items from an async stream.
pub async fn stream_example() {
    use tokio_stream::{self as stream, StreamExt};

    println!("\n=== Stream Processing ===");

    let mut stream = stream::iter(vec![1, 2, 3, 4, 5]);

    while let Some(value) = stream.next().await {
        println!("Stream value: {}", value);
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
}

/// # Error Handling in Async Code
///
/// Demonstrates proper error handling patterns.
pub async fn async_error_handling() -> Result<String, Box<dyn std::error::Error>> {
    println!("\n=== Async Error Handling ===");

    // Simulate an async operation that might fail
    let result = tokio::time::timeout(Duration::from_secs(1), async {
        tokio::time::sleep(Duration::from_millis(100)).await;
        Ok::<_, std::io::Error>("Success")
    })
    .await??;

    Ok(result.to_string())
}

/// # Send and Sync Traits
///
/// Explains the traits that make types safe to send between threads.
pub fn send_sync_explanation() {
    println!("\n=== Send and Sync Traits ===");
    println!("Send: Type can be transferred between threads");
    println!("Sync: Type can be referenced from multiple threads");
    println!();
    println!("Examples:");
    println!("  - i32: Send + Sync (can be safely shared)");
    println!("  - Rc<T>: !Send + !Sync (single-threaded only)");
    println!("  - Arc<T>: Send + Sync (thread-safe)");
    println!("  - Mutex<T>: Send + Sync if T: Send");
    println!("  - RefCell<T>: Send if T: Send, but !Sync");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_thread_basics() {
        thread_basics();
    }

    #[test]
    fn test_thread_move() {
        thread_move_example();
    }

    #[test]
    fn test_channel() {
        channel_basics();
    }

    #[test]
    fn test_mpsc() {
        mpsc_example();
    }

    #[test]
    fn test_mutex() {
        mutex_shared_state();
    }

    #[test]
    fn test_rwlock() {
        rwlock_example();
    }

    #[test]
    fn test_barrier() {
        barrier_example();
    }

    #[tokio::test]
    async fn test_async_basics() {
        async_basics_demo().await;
    }

    #[tokio::test]
    async fn test_tokio_spawn() {
        tokio_spawn_example().await;
    }

    #[tokio::test]
    async fn test_select() {
        select_example().await;
    }

    #[tokio::test]
    async fn test_async_channel() {
        async_channel_example().await;
    }

    #[tokio::test]
    async fn test_parallel_processing() {
        parallel_processing().await;
    }

    #[tokio::test]
    async fn test_timeout() {
        timeout_example().await;
    }

    #[tokio::test]
    async fn test_async_shared_state() {
        async_shared_state().await;
    }

    #[tokio::test]
    async fn test_tokio_mutex() {
        tokio_mutex_example().await;
    }

    #[tokio::test]
    async fn test_spawn_blocking() {
        spawn_blocking_example().await;
    }

    #[tokio::test]
    async fn test_async_error_handling() {
        let result = async_error_handling().await;
        assert!(result.is_ok());
    }

    #[test]
    fn test_send_sync() {
        send_sync_explanation();
    }
}
