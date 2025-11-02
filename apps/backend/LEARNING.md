# Rust Fundamentals Learning Guide

A comprehensive guide to understanding Rust's core concepts, designed for developers new to the language.

## Table of Contents

1. [Why Rust?](#why-rust)
2. [Ownership and Memory Management](#ownership-and-memory-management)
3. [Borrowing and References](#borrowing-and-references)
4. [Types and Variables](#types-and-variables)
5. [Control Flow](#control-flow)
6. [Error Handling](#error-handling)
7. [Traits and Generics](#traits-and-generics)
8. [Collections](#collections)
9. [Async Programming](#async-programming)
10. [Common Patterns](#common-patterns)

---

## Why Rust?

Rust is a systems programming language that offers:

### Safety Without Garbage Collection
- **No null pointer exceptions**: Uses `Option<T>` instead of null
- **No data races**: Enforced at compile time
- **Memory safety**: No use-after-free, no buffer overflows
- **Thread safety**: Fearless concurrency built into the type system

### Performance
- Zero-cost abstractions: High-level features with no runtime overhead
- No garbage collector: Predictable performance
- Direct hardware control: When you need it
- Comparable to C/C++: In speed and resource usage

### Developer Experience
- Excellent error messages: The compiler is your teacher
- Modern tooling: `cargo` handles builds, tests, dependencies
- Strong ecosystem: Growing collection of high-quality libraries
- Helpful community: Active forums, Discord, Reddit

### Use Cases
- Web servers and APIs (like this project!)
- Command-line tools
- Systems programming
- Game engines
- Embedded systems
- Blockchain and cryptocurrency
- WebAssembly applications

---

## Ownership and Memory Management

Ownership is Rust's most unique feature. It's how Rust achieves memory safety without a garbage collector.

### The Three Rules

1. **Each value has one owner**
   ```rust
   let s = String::from("hello"); // s is the owner
   ```

2. **Only one owner at a time**
   ```rust
   let s1 = String::from("hello");
   let s2 = s1;  // Ownership moves to s2
   // s1 is no longer valid!
   ```

3. **Value is dropped when owner goes out of scope**
   ```rust
   {
       let s = String::from("hello"); // s is valid here
   } // s goes out of scope and is dropped
   ```

### Stack vs Heap

**Stack**: Fast, fixed size, known at compile time
```rust
let x = 5;        // i32 on stack
let y = true;     // bool on stack
let z = 'a';      // char on stack
```

**Heap**: Slower, dynamic size, runtime allocation
```rust
let s = String::from("hello");  // data on heap
let v = vec![1, 2, 3];          // data on heap
```

### Move Semantics

```rust
let s1 = String::from("hello");
let s2 = s1;  // s1 is moved to s2

// This won't compile:
// println!("{}", s1);  // ERROR: value used after move
```

### Clone for Deep Copies

```rust
let s1 = String::from("hello");
let s2 = s1.clone();  // Deep copy

// Both are valid:
println!("s1 = {}, s2 = {}", s1, s2);
```

### Copy Trait for Stack Types

```rust
let x = 5;
let y = x;  // x is copied (not moved)

// Both are valid:
println!("x = {}, y = {}", x, y);
```

Types that implement `Copy`:
- All integers: `i32`, `u64`, etc.
- Boolean: `bool`
- Floating point: `f32`, `f64`
- Character: `char`
- Tuples (if all fields are `Copy`)

### Why This Matters

```rust
// Without ownership (hypothetical code):
let s = String::from("hello");
let s2 = s;
drop(s);   // Free memory
drop(s2);  // Double free! 💥 Crash!

// With ownership:
let s = String::from("hello");
let s2 = s;  // s is moved
drop(s2);    // Only s2 is dropped ✅
```

---

## Borrowing and References

Borrowing lets you refer to data without taking ownership.

### Immutable References (&T)

```rust
fn calculate_length(s: &String) -> usize {
    s.len()
}  // s goes out of scope, but nothing is dropped

let s1 = String::from("hello");
let len = calculate_length(&s1);
println!("Length of '{}' is {}", s1, len);  // s1 still valid!
```

### Mutable References (&mut T)

```rust
fn change(s: &mut String) {
    s.push_str(", world");
}

let mut s = String::from("hello");
change(&mut s);
println!("{}", s);  // "hello, world"
```

### The Borrowing Rules

**Rule 1**: Either one mutable reference OR any number of immutable references

```rust
let mut s = String::from("hello");

// OK: Multiple immutable references
let r1 = &s;
let r2 = &s;
println!("{} and {}", r1, r2);

// OK: One mutable reference (after immutable refs are done)
let r3 = &mut s;
r3.push_str(", world");

// NOT OK: Mixing mutable and immutable
// let r1 = &s;
// let r2 = &mut s;  // ERROR!
// println!("{}", r1);
```

**Rule 2**: References must always be valid (no dangling references)

```rust
// This won't compile:
fn dangle() -> &String {
    let s = String::from("hello");
    &s  // ERROR: s is dropped, reference would be invalid
}

// Correct way:
fn no_dangle() -> String {
    let s = String::from("hello");
    s  // Return ownership
}
```

### Reference Lifetimes

The compiler tracks how long references are valid:

```rust
let r;                      // Declare r
{
    let x = 5;
    r = &x;                 // r references x
}                           // x is dropped
// println!("{}", r);       // ERROR: r references dropped value
```

### String Slices

Slices are references to a contiguous sequence:

```rust
let s = String::from("hello world");

let hello = &s[0..5];   // "hello"
let world = &s[6..11];  // "world"
let whole = &s[..];     // "hello world"

// Function that takes string slice
fn first_word(s: &str) -> &str {
    let bytes = s.as_bytes();
    for (i, &item) in bytes.iter().enumerate() {
        if item == b' ' {
            return &s[0..i];
        }
    }
    &s[..]
}
```

---

## Types and Variables

### Scalar Types

**Integers**:
```rust
let a: i8 = -128;          // 8-bit signed
let b: u8 = 255;           // 8-bit unsigned
let c: i32 = -2_147_483_648;  // 32-bit signed (default)
let d: u64 = 18_446_744_073_709_551_615;  // 64-bit unsigned
let e: isize = -1;         // pointer-sized signed
```

**Floating Point**:
```rust
let x: f32 = 3.14;         // 32-bit float
let y: f64 = 2.71828;      // 64-bit float (default)
```

**Boolean**:
```rust
let t: bool = true;
let f: bool = false;
```

**Character**:
```rust
let c: char = 'a';
let emoji: char = '😊';    // Unicode scalar values
```

### Compound Types

**Tuples**:
```rust
let tup: (i32, f64, u8) = (500, 6.4, 1);

// Destructuring
let (x, y, z) = tup;

// Index access
let five_hundred = tup.0;
let six_point_four = tup.1;
```

**Arrays** (fixed size):
```rust
let a: [i32; 5] = [1, 2, 3, 4, 5];
let first = a[0];

// Initialize with same value
let zeros = [0; 100];  // [0, 0, 0, ... (100 times)]
```

### String Types

**String Slice (`&str`)**: Immutable view into string data
```rust
let s: &str = "hello";  // String literal
```

**String**: Owned, growable string
```rust
let mut s = String::from("hello");
s.push_str(", world!");
```

### Type Inference

Rust can often infer types:
```rust
let x = 5;              // i32 inferred
let y = 3.14;           // f64 inferred
let s = "hello";        // &str inferred
let v = vec![1, 2, 3];  // Vec<i32> inferred
```

### Type Aliases

```rust
type Kilometers = i32;

let distance: Kilometers = 5;
```

---

## Control Flow

### If Expressions

```rust
let number = 7;

if number < 5 {
    println!("less than 5");
} else if number < 10 {
    println!("less than 10");
} else {
    println!("10 or more");
}

// if is an expression
let result = if number < 10 { "small" } else { "large" };
```

### Loops

**loop**: Infinite loop
```rust
let mut counter = 0;
let result = loop {
    counter += 1;
    if counter == 10 {
        break counter * 2;  // Return value
    }
};
```

**while**: Conditional loop
```rust
let mut number = 3;
while number != 0 {
    println!("{}!", number);
    number -= 1;
}
```

**for**: Iterate over collection
```rust
let arr = [10, 20, 30, 40, 50];
for element in arr {
    println!("{}", element);
}

// Range
for number in 1..4 {  // 1, 2, 3 (4 excluded)
    println!("{}", number);
}

// Inclusive range
for number in 1..=3 {  // 1, 2, 3 (3 included)
    println!("{}", number);
}
```

### Match Expressions

Pattern matching (like switch on steroids):

```rust
let number = 3;

match number {
    1 => println!("one"),
    2 | 3 => println!("two or three"),
    4..=9 => println!("four through nine"),
    _ => println!("something else"),  // _ is catch-all
}

// Match is an expression
let description = match number {
    1 => "one",
    2 => "two",
    _ => "other",
};
```

**Match with Option**:
```rust
let some_number = Some(5);

match some_number {
    Some(x) => println!("got {}", x),
    None => println!("got nothing"),
}
```

**Match with Result**:
```rust
let result: Result<i32, &str> = Ok(42);

match result {
    Ok(value) => println!("success: {}", value),
    Err(e) => println!("error: {}", e),
}
```

### If Let

Concise pattern matching for one case:

```rust
let some_value = Some(3);

// Instead of:
match some_value {
    Some(3) => println!("three"),
    _ => (),
}

// Use if let:
if let Some(3) = some_value {
    println!("three");
}
```

---

## Error Handling

Rust doesn't have exceptions. Instead, it uses types to represent errors.

### Option<T>

For values that might not exist:

```rust
fn find_user(id: u32) -> Option<User> {
    if id == 1 {
        Some(User { name: "Alice".to_string() })
    } else {
        None
    }
}

// Pattern matching
match find_user(1) {
    Some(user) => println!("Found {}", user.name),
    None => println!("User not found"),
}

// if let
if let Some(user) = find_user(1) {
    println!("Found {}", user.name);
}
```

**Option Methods**:
```rust
let x = Some(5);

// unwrap_or: provide default
let value = x.unwrap_or(0);

// map: transform if Some
let doubled = x.map(|n| n * 2);  // Some(10)

// and_then: chain operations
let result = x.and_then(|n| {
    if n > 0 { Some(n * 2) } else { None }
});

// filter: conditional Some
let filtered = x.filter(|&n| n > 3);
```

### Result<T, E>

For operations that can fail:

```rust
use std::fs::File;
use std::io::ErrorKind;

fn open_file() -> Result<File, std::io::Error> {
    File::open("hello.txt")
}

// Pattern matching
match open_file() {
    Ok(file) => println!("File opened"),
    Err(error) => println!("Failed to open: {:?}", error),
}
```

### The ? Operator

Propagate errors upward:

```rust
use std::fs::File;
use std::io::{self, Read};

fn read_username() -> Result<String, io::Error> {
    let mut file = File::open("username.txt")?;  // Return Err if fails
    let mut username = String::new();
    file.read_to_string(&mut username)?;         // Return Err if fails
    Ok(username)                                  // Return Ok if success
}

// Even more concise:
fn read_username_short() -> Result<String, io::Error> {
    std::fs::read_to_string("username.txt")
}
```

### Custom Error Types

```rust
#[derive(Debug)]
enum AppError {
    NotFound,
    InvalidInput(String),
    DatabaseError(String),
}

fn validate_age(age: i32) -> Result<i32, AppError> {
    if age < 0 {
        Err(AppError::InvalidInput("Age cannot be negative".to_string()))
    } else if age > 150 {
        Err(AppError::InvalidInput("Age unrealistic".to_string()))
    } else {
        Ok(age)
    }
}
```

### Panic!

For unrecoverable errors:

```rust
panic!("Something went terribly wrong!");

// Or with formatting:
panic!("Error code: {}", error_code);
```

**unwrap and expect** (use sparingly):
```rust
let x = Some(5);
let value = x.unwrap();  // Panics if None

let value = x.expect("x should have a value");  // Custom panic message
```

---

## Traits and Generics

### Traits (Interfaces)

Define shared behavior:

```rust
trait Summary {
    fn summarize(&self) -> String;

    // Default implementation
    fn announce(&self) -> String {
        format!("Breaking news: {}", self.summarize())
    }
}

struct Article {
    title: String,
    author: String,
}

impl Summary for Article {
    fn summarize(&self) -> String {
        format!("{} by {}", self.title, self.author)
    }
}

let article = Article {
    title: "Rust is awesome".to_string(),
    author: "John Doe".to_string(),
};

println!("{}", article.summarize());
println!("{}", article.announce());
```

### Trait Bounds

Constrain generic types:

```rust
// impl Trait syntax
fn notify(item: &impl Summary) {
    println!("News: {}", item.summarize());
}

// Trait bound syntax
fn notify<T: Summary>(item: &T) {
    println!("News: {}", item.summarize());
}

// Multiple trait bounds
fn process<T: Summary + Display>(item: &T) {
    println!("{}", item);
}

// Where clause (cleaner for complex bounds)
fn complex<T, U>(t: &T, u: &U)
where
    T: Summary + Clone,
    U: Clone + Debug,
{
    // function body
}
```

### Generics

Write code that works with multiple types:

```rust
// Generic function
fn largest<T: PartialOrd>(list: &[T]) -> &T {
    let mut largest = &list[0];
    for item in list {
        if item > largest {
            largest = item;
        }
    }
    largest
}

// Generic struct
struct Point<T> {
    x: T,
    y: T,
}

impl<T> Point<T> {
    fn x(&self) -> &T {
        &self.x
    }
}

// Implementation for specific type
impl Point<f32> {
    fn distance_from_origin(&self) -> f32 {
        (self.x.powi(2) + self.y.powi(2)).sqrt()
    }
}
```

### Common Traits

**Debug**: Format with `{:?}`
```rust
#[derive(Debug)]
struct User {
    name: String,
}
println!("{:?}", user);
```

**Clone**: Create deep copies
```rust
#[derive(Clone)]
struct User {
    name: String,
}
let user2 = user1.clone();
```

**Copy**: Implicit copies for stack types
```rust
#[derive(Copy, Clone)]
struct Point {
    x: i32,
    y: i32,
}
```

**PartialEq, Eq**: Equality comparison
```rust
#[derive(PartialEq, Eq)]
struct User {
    id: u32,
}
assert_eq!(user1, user2);
```

---

## Collections

### Vec<T>

Growable array:

```rust
// Create
let mut v: Vec<i32> = Vec::new();
let v = vec![1, 2, 3];

// Add/remove
v.push(4);
let last = v.pop();  // Option<i32>

// Access
let third = &v[2];           // Panics if out of bounds
let third = v.get(2);        // Option<&i32>

// Iterate
for item in &v {
    println!("{}", item);
}

// Mutate while iterating
for item in &mut v {
    *item *= 2;
}
```

### String

UTF-8 encoded text:

```rust
// Create
let mut s = String::new();
let s = String::from("hello");
let s = "hello".to_string();

// Append
s.push_str(" world");
s.push('!');

// Concatenate
let s1 = String::from("Hello, ");
let s2 = String::from("world!");
let s3 = s1 + &s2;  // s1 is moved

// format! (doesn't take ownership)
let s = format!("{}-{}-{}", "tic", "tac", "toe");

// Iterate
for c in s.chars() {
    println!("{}", c);
}
```

### HashMap<K, V>

Key-value store:

```rust
use std::collections::HashMap;

// Create
let mut scores = HashMap::new();

// Insert
scores.insert(String::from("Blue"), 10);
scores.insert(String::from("Yellow"), 50);

// Get
let score = scores.get("Blue");  // Option<&i32>

// Iterate
for (key, value) in &scores {
    println!("{}: {}", key, value);
}

// Update or insert
scores.entry(String::from("Yellow")).or_insert(50);

// Update based on old value
let text = "hello world wonderful world";
let mut map = HashMap::new();
for word in text.split_whitespace() {
    let count = map.entry(word).or_insert(0);
    *count += 1;
}
```

---

## Async Programming

Rust's async model is based on futures and the async/await syntax.

### Async Functions

```rust
async fn fetch_data() -> Result<String, Error> {
    // Async operations
    let response = http_client.get("https://api.example.com").await?;
    let text = response.text().await?;
    Ok(text)
}
```

### Awaiting Futures

```rust
#[tokio::main]
async fn main() {
    let result = fetch_data().await;
    match result {
        Ok(data) => println!("Got: {}", data),
        Err(e) => println!("Error: {}", e),
    }
}
```

### Concurrent Execution

```rust
use tokio::join;

async fn task1() -> i32 { 1 }
async fn task2() -> i32 { 2 }

let (result1, result2) = join!(task1(), task2());
```

### Spawning Tasks

```rust
use tokio::task;

let handle = task::spawn(async {
    // This runs on a separate task
    expensive_computation().await
});

let result = handle.await.unwrap();
```

---

## Common Patterns

### Builder Pattern

```rust
struct User {
    name: String,
    email: String,
    age: Option<u32>,
}

impl User {
    fn builder() -> UserBuilder {
        UserBuilder::default()
    }
}

#[derive(Default)]
struct UserBuilder {
    name: Option<String>,
    email: Option<String>,
    age: Option<u32>,
}

impl UserBuilder {
    fn name(mut self, name: String) -> Self {
        self.name = Some(name);
        self
    }

    fn email(mut self, email: String) -> Self {
        self.email = Some(email);
        self
    }

    fn age(mut self, age: u32) -> Self {
        self.age = Some(age);
        self
    }

    fn build(self) -> Result<User, String> {
        Ok(User {
            name: self.name.ok_or("name required")?,
            email: self.email.ok_or("email required")?,
            age: self.age,
        })
    }
}

// Usage
let user = User::builder()
    .name("Alice".to_string())
    .email("alice@example.com".to_string())
    .age(30)
    .build()?;
```

### Newtype Pattern

Wrap existing types for type safety:

```rust
struct UserId(u32);
struct PostId(u32);

// Can't mix them up!
fn get_user(id: UserId) -> User {
    // ...
}

let user_id = UserId(1);
let post_id = PostId(1);

get_user(user_id);      // OK
// get_user(post_id);   // ERROR: type mismatch
```

### State Pattern

Type-safe state machines:

```rust
struct Draft {}
struct Published {}

struct Post<State> {
    content: String,
    state: State,
}

impl Post<Draft> {
    fn new() -> Self {
        Post {
            content: String::new(),
            state: Draft {},
        }
    }

    fn add_content(&mut self, text: &str) {
        self.content.push_str(text);
    }

    fn publish(self) -> Post<Published> {
        Post {
            content: self.content,
            state: Published {},
        }
    }
}

impl Post<Published> {
    fn content(&self) -> &str {
        &self.content
    }
}
```

---

## Next Steps

1. **Practice**: Complete [Rustlings](https://github.com/rust-lang/rustlings) exercises
2. **Read**: Work through [The Rust Book](https://doc.rust-lang.org/book/)
3. **Build**: Create small projects (CLI tools, web APIs, etc.)
4. **Explore**: Check out [Rust by Example](https://doc.rust-lang.org/rust-by-example/)
5. **Engage**: Join the [Rust community](https://www.rust-lang.org/community)

Remember: Rust has a steep learning curve, but it's worth it. Take your time, experiment, and don't be afraid to make mistakes. The compiler is your friend!
