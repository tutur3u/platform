//! # Closures and Iterators in Rust
//!
//! This module covers two powerful functional programming features in Rust:
//! closures (anonymous functions) and iterators (lazy sequences).
//!
//! ## Closures
//!
//! Closures are anonymous functions that can capture their environment.
//! They are similar to lambdas in other languages.
//!
//! Key traits:
//! - `Fn`: Can be called multiple times, borrows values immutably
//! - `FnMut`: Can be called multiple times, borrows values mutably
//! - `FnOnce`: Can be called once, takes ownership of values
//!
//! ## Iterators
//!
//! Iterators provide a way to process sequences of elements lazily.
//! They are zero-cost abstractions - as fast as hand-written loops.

/// # Basic Closure Examples
///
/// Demonstrates closure syntax and basic usage.
pub fn closure_basics() {
    println!("=== Closure Basics ===");

    // Simple closure that adds two numbers
    let add = |a, b| a + b;
    println!("5 + 3 = {}", add(5, 3));

    // Closure with type annotations (usually inferred)
    let multiply = |a: i32, b: i32| -> i32 { a * b };
    println!("4 * 7 = {}", multiply(4, 7));

    // Closure with multiple statements
    let greet = |name: &str| {
        let greeting = format!("Hello, {}!", name);
        println!("{}", greeting);
        greeting
    };
    greet("World");

    // Closure that returns immediately (no braces needed for single expression)
    let square = |x| x * x;
    println!("5 squared = {}", square(5));
}

/// # Capturing Environment
///
/// Closures can capture variables from their enclosing scope.
pub fn capturing_environment() {
    println!("\n=== Capturing Environment ===");

    let x = 5;

    // Closure captures `x` by immutable reference (Fn trait)
    let print_x = || println!("x = {}", x);
    print_x();
    print_x(); // Can be called multiple times

    // Still can use x here
    println!("x is still available: {}", x);

    let mut count = 0;
    // Closure captures `count` by mutable reference (FnMut trait)
    let mut increment = || {
        count += 1;
        println!("Count is now: {}", count);
    };
    increment();
    increment();

    // After mutable borrows end, we can access count again
    println!("Final count: {}", count);
}

/// # Move Closures
///
/// Use the `move` keyword to take ownership of captured variables.
/// This is necessary when the closure might outlive the current scope.
pub fn move_closures() {
    println!("\n=== Move Closures ===");

    let name = String::from("Alice");

    // `move` keyword forces the closure to take ownership
    let greeter = move || {
        println!("Hello, {}!", name);
    };

    // name is no longer available here - it was moved into the closure
    // println!("{}", name); // This would cause a compile error

    greeter();

    // Example: returning a closure from a function
    fn create_counter(start: i32) -> impl FnMut() -> i32 {
        let mut count = start;
        move || {
            count += 1;
            count
        }
    }

    let mut counter = create_counter(10);
    println!("Counter: {}", counter());
    println!("Counter: {}", counter());
    println!("Counter: {}", counter());
}

/// # Closure Traits: Fn, FnMut, FnOnce
///
/// Demonstrates the three closure traits and when each is used.
pub fn closure_traits() {
    println!("\n=== Closure Traits ===");

    // FnOnce: Consumes captured variables (can only be called once)
    let name = String::from("Bob");
    let consume = || {
        let _owned = name; // Takes ownership
        println!("Consumed: {:?}", _owned);
    };
    consume();
    // consume(); // ERROR: can't call twice

    // FnMut: Mutably borrows (can be called multiple times)
    let mut data = vec![1, 2, 3];
    let mut modify = || {
        data.push(4);
        println!("Data: {:?}", data);
    };
    modify();
    modify();

    // Fn: Immutably borrows (can be called multiple times, most flexible)
    let x = 5;
    let read = || {
        println!("Reading x: {}", x);
    };
    read();
    read();
}

/// # Using Closures with Higher-Order Functions
///
/// Closures are commonly used with functions that take other functions as arguments.
pub fn higher_order_functions() {
    println!("\n=== Higher-Order Functions ===");

    // map: Transform each element
    let numbers = [1, 2, 3, 4, 5];
    let squared: Vec<i32> = numbers.iter().map(|x| x * x).collect();
    println!("Squared: {:?}", squared);

    // filter: Keep elements that match a condition
    let evens: Vec<i32> = numbers.iter().filter(|&x| x % 2 == 0).copied().collect();
    println!("Evens: {:?}", evens);

    // for_each: Apply a function to each element (consumes iterator)
    numbers.iter().for_each(|x| print!("{} ", x));
    println!();

    // Custom higher-order function
    fn apply_twice<F>(f: F, x: i32) -> i32
    where
        F: Fn(i32) -> i32,
    {
        f(f(x))
    }

    let result = apply_twice(|x| x + 1, 5);
    println!("Apply add_one twice to 5: {}", result);
}

/// # Iterator Basics
///
/// Demonstrates basic iterator usage and common methods.
pub fn iterator_basics() {
    println!("\n=== Iterator Basics ===");

    let v = [1, 2, 3, 4, 5];

    // Iterators are lazy - nothing happens until consumed
    let mut iter = v.iter();

    // next() returns Option<&T>
    println!("First element: {:?}", iter.next());
    println!("Second element: {:?}", iter.next());

    // for loop consumes the iterator
    for val in v.iter() {
        print!("{} ", val);
    }
    println!();

    // Three ways to iterate:
    // .iter() - borrows each element (&T)
    // .iter_mut() - mutably borrows each element (&mut T)
    // .into_iter() - takes ownership of each element (T)

    let mut v2 = vec![1, 2, 3];
    for val in v2.iter_mut() {
        *val *= 2;
    }
    println!("After doubling: {:?}", v2);
}

/// # Iterator Adaptors
///
/// Methods that transform iterators into other iterators (lazy evaluation).
pub fn iterator_adaptors() {
    println!("\n=== Iterator Adaptors ===");

    let numbers = vec![1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    // Chain multiple adaptors
    let result: Vec<i32> = numbers
        .iter()
        .filter(|&&x| x % 2 == 0) // Keep evens
        .map(|x| x * x) // Square them
        .take(3) // Take first 3
        .collect();
    println!("Evens squared (first 3): {:?}", result);

    // skip and take for pagination
    let page_2: Vec<i32> = numbers.iter().skip(3).take(3).copied().collect();
    println!("Page 2 (items 4-6): {:?}", page_2);

    // enumerate for indices
    for (i, val) in numbers.iter().enumerate() {
        if i < 3 {
            println!("Index {}: {}", i, val);
        }
    }

    // zip to combine two iterators
    let letters = ['a', 'b', 'c'];
    let zipped: Vec<(i32, char)> = numbers
        .iter()
        .copied()
        .zip(letters.iter().copied())
        .collect();
    println!("Zipped: {:?}", zipped);
}

/// # Iterator Consumers
///
/// Methods that consume the iterator and produce a final value.
pub fn iterator_consumers() {
    println!("\n=== Iterator Consumers ===");

    let numbers = [1, 2, 3, 4, 5];

    // sum: Add all elements
    let sum: i32 = numbers.iter().sum();
    println!("Sum: {}", sum);

    // product: Multiply all elements
    let product: i32 = numbers.iter().product();
    println!("Product: {}", product);

    // collect: Convert to a collection
    let doubled: Vec<i32> = numbers.iter().map(|x| x * 2).collect();
    println!("Doubled: {:?}", doubled);

    // fold: General-purpose accumulator (like reduce in other languages)
    let factorial = (1..=5).product::<i32>();
    println!("5! = {}", factorial);

    // reduce: Similar to fold but uses first element as initial value
    let max = numbers.iter().copied().reduce(|a, b| a.max(b));
    println!("Max: {:?}", max);

    // any and all: Check conditions
    let has_even = numbers.iter().any(|&x| x % 2 == 0);
    let all_positive = numbers.iter().all(|&x| x > 0);
    println!("Has even: {}, All positive: {}", has_even, all_positive);

    // find: Get first matching element
    let first_even = numbers.iter().find(|&&x| x % 2 == 0);
    println!("First even: {:?}", first_even);

    // position: Get index of first match
    let pos = numbers.iter().position(|&x| x == 3);
    println!("Position of 3: {:?}", pos);
}

/// # Custom Iterator Implementation
///
/// Demonstrates how to implement the Iterator trait for custom types.
pub struct Counter {
    count: u32,
    max: u32,
}

impl Counter {
    pub fn new(max: u32) -> Counter {
        Counter { count: 0, max }
    }
}

impl Iterator for Counter {
    type Item = u32;

    fn next(&mut self) -> Option<Self::Item> {
        if self.count < self.max {
            self.count += 1;
            Some(self.count)
        } else {
            None
        }
    }
}

pub fn custom_iterator_example() {
    println!("\n=== Custom Iterator ===");

    let counter = Counter::new(5);
    for num in counter {
        print!("{} ", num);
    }
    println!();

    // Use iterator methods on our custom iterator
    let sum: u32 = Counter::new(10).sum();
    println!("Sum of 1-10: {}", sum);
}

/// # Advanced Iterator Patterns
///
/// More complex iterator usage patterns.
pub fn advanced_patterns() {
    println!("\n=== Advanced Patterns ===");

    // Flatten nested iterators
    let nested = [vec![1, 2], vec![3, 4], vec![5, 6]];
    let flat: Vec<i32> = nested.iter().flatten().copied().collect();
    println!("Flattened: {:?}", flat);

    // Partition: Split into two collections
    let numbers = [1, 2, 3, 4, 5, 6];
    let (evens, odds): (Vec<i32>, Vec<i32>) = numbers.iter().copied().partition(|&x| x % 2 == 0);
    println!("Evens: {:?}, Odds: {:?}", evens, odds);

    // Cycle: Repeat iterator infinitely (use with take!)
    let repeated: Vec<i32> = [1, 2, 3].iter().copied().cycle().take(10).collect();
    println!("Repeated: {:?}", repeated);

    // Chain: Combine iterators
    let v1 = [1, 2, 3];
    let v2 = [4, 5, 6];
    let chained: Vec<i32> = v1.iter().chain(v2.iter()).copied().collect();
    println!("Chained: {:?}", chained);

    // Scan: Stateful map
    let cumulative: Vec<i32> = [1, 2, 3, 4, 5]
        .iter()
        .scan(0, |acc, &x| {
            *acc += x;
            Some(*acc)
        })
        .collect();
    println!("Cumulative sum: {:?}", cumulative);
}

/// # Performance: Iterator vs. Loop
///
/// Demonstrates that iterators are zero-cost abstractions.
pub fn performance_comparison() {
    println!("\n=== Performance Comparison ===");

    let numbers: Vec<i32> = (1..=1000).collect();

    // Iterator style (compiles to the same machine code as loop)
    let sum_iter: i32 = numbers.iter().sum();

    // Traditional loop
    let mut sum_loop = 0;
    for &num in &numbers {
        sum_loop += num;
    }

    assert_eq!(sum_iter, sum_loop);
    println!("Iterator sum: {}, Loop sum: {}", sum_iter, sum_loop);
    println!("Both produce identical machine code!");
}

/// # Practical Examples
///
/// Real-world use cases for closures and iterators.
/// Count word frequencies in text
pub fn word_frequency(text: &str) -> std::collections::HashMap<String, usize> {
    text.split_whitespace()
        .map(|word| word.to_lowercase())
        .fold(std::collections::HashMap::new(), |mut map, word| {
            *map.entry(word).or_insert(0) += 1;
            map
        })
}

/// Filter and transform data pipeline
pub fn process_data(values: Vec<i32>) -> Vec<String> {
    values
        .into_iter()
        .filter(|&x| x > 0) // Keep positive
        .map(|x| x * 2) // Double
        .filter(|&x| x < 100) // Keep under 100
        .map(|x| format!("Value: {}", x)) // Format
        .collect()
}

/// Lazy evaluation example: only processes what's needed
pub fn find_first_large_square(numbers: Vec<i32>) -> Option<i32> {
    numbers
        .iter()
        .map(|&x| {
            println!("Squaring {}", x); // Shows lazy evaluation
            x * x
        })
        .find(|&x| x > 100)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_closures() {
        let add = |a, b| a + b;
        assert_eq!(add(2, 3), 5);

        let mut count = 0;
        let mut inc = || count += 1;
        inc();
        inc();
        assert_eq!(count, 2);
    }

    #[test]
    fn test_move_closure() {
        let x = 5;
        let f = move || x + 1;
        assert_eq!(f(), 6);
    }

    #[test]
    fn test_iterator_adaptors() {
        let v = vec![1, 2, 3, 4, 5];
        let result: Vec<i32> = v.iter().map(|x| x * 2).filter(|&x| x > 5).collect();
        assert_eq!(result, vec![6, 8, 10]);
    }

    #[test]
    fn test_counter() {
        let sum: u32 = Counter::new(5).sum();
        assert_eq!(sum, 15); // 1 + 2 + 3 + 4 + 5
    }

    #[test]
    fn test_word_frequency() {
        let text = "hello world hello rust world";
        let freq = word_frequency(text);
        assert_eq!(freq.get("hello"), Some(&2));
        assert_eq!(freq.get("world"), Some(&2));
        assert_eq!(freq.get("rust"), Some(&1));
    }

    #[test]
    fn test_process_data() {
        let input = vec![-5, 10, 20, 60, 100];
        let result = process_data(input);
        assert_eq!(result, vec!["Value: 20", "Value: 40"]);
    }

    #[test]
    fn test_find_first_large_square() {
        let numbers = vec![1, 2, 5, 15, 20];
        let result = find_first_large_square(numbers);
        assert_eq!(result, Some(225)); // 15^2 = 225
    }

    #[test]
    fn test_partition() {
        let numbers = vec![1, 2, 3, 4, 5, 6];
        let (evens, odds): (Vec<i32>, Vec<i32>) =
            numbers.iter().copied().partition(|&x| x % 2 == 0);
        assert_eq!(evens, vec![2, 4, 6]);
        assert_eq!(odds, vec![1, 3, 5]);
    }

    #[test]
    fn test_flatten() {
        let nested = vec![vec![1, 2], vec![3, 4]];
        let flat: Vec<i32> = nested.iter().flatten().copied().collect();
        assert_eq!(flat, vec![1, 2, 3, 4]);
    }

    #[test]
    fn test_fold() {
        let numbers = vec![1, 2, 3, 4];
        let sum = numbers.iter().fold(0, |acc, x| acc + x);
        assert_eq!(sum, 10);
    }

    #[test]
    fn test_any_all() {
        let numbers = vec![1, 2, 3, 4, 5];
        assert!(numbers.iter().any(|&x| x > 4));
        assert!(numbers.iter().all(|&x| x > 0));
        assert!(!numbers.iter().all(|&x| x > 3));
    }
}
