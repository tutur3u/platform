//! # Ownership in Rust
//!
//! Ownership is Rust's most unique feature. It enables memory safety without
//! garbage collection. Understanding ownership is crucial to mastering Rust.
//!
//! ## The Three Rules of Ownership
//!
//! 1. Each value in Rust has a variable that's called its owner
//! 2. There can only be one owner at a time
//! 3. When the owner goes out of scope, the value will be dropped

/// Demonstrates basic ownership transfer
///
/// When we assign s1 to s2, ownership is transferred (moved).
/// After the move, s1 is no longer valid.
pub fn ownership_move_example() {
    // String is allocated on the heap
    let s1 = String::from("hello");

    // Ownership of the string moves to s2
    // s1 is no longer valid after this point
    let s2 = s1;

    // This would cause a compile error:
    // println!("{}", s1);

    println!("s2 owns the string: {}", s2);
}

/// Demonstrates cloning to keep original value
///
/// If we want to keep the original value, we can clone it.
/// This creates a deep copy of the data.
pub fn ownership_clone_example() {
    let s1 = String::from("hello");

    // Clone creates a deep copy, s1 remains valid
    let s2 = s1.clone();

    // Both are valid
    println!("s1: {}, s2: {}", s1, s2);
}

/// Demonstrates ownership with functions
///
/// Passing a value to a function moves ownership to the function.
/// When the function ends, the value is dropped.
pub fn ownership_function_example() {
    let s = String::from("hello");

    // Ownership moves to takes_ownership
    takes_ownership(s);

    // This would cause a compile error:
    // println!("{}", s);

    let x = 5;

    // Integers implement Copy trait, so they're copied, not moved
    makes_copy(x);

    // x is still valid
    println!("x is still valid: {}", x);
}

fn takes_ownership(some_string: String) {
    println!("Function received: {}", some_string);
    // some_string is dropped here
}

fn makes_copy(some_integer: i32) {
    println!("Function received copy: {}", some_integer);
}

/// Demonstrates returning ownership from functions
///
/// Functions can transfer ownership back to the caller
pub fn ownership_return_example() {
    let s1 = gives_ownership();
    println!("Received ownership: {}", s1);

    let s2 = String::from("hello");
    let s3 = takes_and_gives_back(s2);
    // s2 is no longer valid, s3 owns the value
    println!("Got back ownership: {}", s3);
}

fn gives_ownership() -> String {
    String::from("yours") // ownership moves to caller
}

fn takes_and_gives_back(a_string: String) -> String {
    a_string // ownership moves back to caller
}

/// Stack vs Heap allocation
///
/// Understanding the difference helps understand why ownership matters
pub fn stack_vs_heap_example() {
    // Stack: Fixed size, known at compile time, fast
    let x = 5; // i32, stored on stack
    let y = true; // bool, stored on stack
    let z = std::f64::consts::PI; // f64, stored on stack

    // Heap: Dynamic size, slower, needs ownership management
    let s = String::from("hello"); // String data on heap
    let v = vec![1, 2, 3]; // Vec data on heap

    println!("Stack values: {}, {}, {}", x, y, z);
    println!("Heap values: {}, {:?}", s, v);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ownership_examples() {
        // These functions demonstrate ownership, they won't panic
        ownership_move_example();
        ownership_clone_example();
        ownership_function_example();
        ownership_return_example();
        stack_vs_heap_example();
    }
}
