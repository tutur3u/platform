//! # Collections in Rust
//!
//! Rust's standard library includes several useful data structures called
//! collections. Unlike arrays and tuples, collections store data on the heap
//! and can grow or shrink at runtime.
//!
//! ## Main Collection Types
//!
//! - Vec<T>: Growable array (most common)
//! - String: Collection of UTF-8 bytes
//! - HashMap<K, V>: Key-value store

use std::collections::HashMap;

/// Demonstrates Vec<T> - dynamic array
pub fn vector_examples() {
    // Creating vectors
    let mut v1: Vec<i32> = Vec::new();
    let v2 = vec![1, 2, 3]; // vec! macro for initialization

    // Adding elements
    v1.push(1);
    v1.push(2);
    v1.push(3);

    println!("v1: {:?}", v1);
    println!("v2: {:?}", v2);

    // Accessing elements
    let third = &v2[2]; // panics if out of bounds
    println!("Third element: {}", third);

    // Safe access with get()
    match v2.get(10) {
        Some(value) => println!("Element at index 10: {}", value),
        None => println!("No element at index 10"),
    }

    // Iterating
    println!("Iterating over v2:");
    for item in &v2 {
        println!("  {}", item);
    }

    // Mutating while iterating
    let mut v3 = vec![1, 2, 3];
    for item in &mut v3 {
        *item *= 2;
    }
    println!("v3 after doubling: {:?}", v3);
}

/// Demonstrates vector methods
pub fn vector_methods() {
    let mut numbers = vec![1, 2, 3, 4, 5];

    // Common methods
    println!("Length: {}", numbers.len());
    println!("Is empty: {}", numbers.is_empty());
    println!("First: {:?}", numbers.first());
    println!("Last: {:?}", numbers.last());

    // pop removes and returns last element
    let last = numbers.pop();
    println!("Popped: {:?}, remaining: {:?}", last, numbers);

    // insert at index
    numbers.insert(0, 0);
    println!("After insert at 0: {:?}", numbers);

    // remove at index
    numbers.remove(0);
    println!("After remove at 0: {:?}", numbers);

    // contains
    println!("Contains 3: {}", numbers.contains(&3));

    // clear all elements
    numbers.clear();
    println!("After clear: {:?}", numbers);
}

/// Demonstrates storing different types in a vector using enum
pub fn vector_different_types() {
    #[derive(Debug)]
    enum SpreadsheetCell {
        Int(i32),
        Float(f64),
        Text(String),
    }

    let row = vec![
        SpreadsheetCell::Int(3),
        SpreadsheetCell::Text(String::from("blue")),
        SpreadsheetCell::Float(10.12),
    ];

    for cell in &row {
        println!("{:?}", cell);
    }
}

/// Demonstrates String operations
pub fn string_examples() {
    // Creating strings
    let mut s1 = String::new();
    let s2 = "initial contents".to_string();
    let s3 = String::from("initial contents");

    println!("s2: {}, s3: {}", s2, s3);

    // Appending to strings
    s1.push_str("hello");
    s1.push(' ');
    s1.push_str("world");
    println!("s1: {}", s1);

    // Concatenation
    let s4 = String::from("Hello, ");
    let s5 = String::from("world!");
    let s6 = s4 + &s5; // s4 is moved, s5 is borrowed
    println!("s6: {}", s6);

    // format! macro (doesn't take ownership)
    let s7 = String::from("tic");
    let s8 = String::from("tac");
    let s9 = String::from("toe");
    let s10 = format!("{}-{}-{}", s7, s8, s9);
    println!("s10: {}", s10);
    println!("s7 still valid: {}", s7);
}

/// Demonstrates string indexing (or lack thereof)
pub fn string_indexing() {
    let hello = String::from("hello");

    // This doesn't work in Rust:
    // let h = hello[0];

    // Use chars() to iterate over characters
    println!("Characters in 'hello':");
    for c in hello.chars() {
        println!("  {}", c);
    }

    // Use bytes() for raw bytes
    println!("Bytes in 'hello':");
    for b in hello.bytes() {
        println!("  {}", b);
    }

    // Slicing works but be careful with UTF-8
    let hello = "Здравствуйте"; // Russian "Hello"
    let s = &hello[0..4]; // First 2 characters (2 bytes each)
    println!("Slice: {}", s);
}

/// Demonstrates HashMap<K, V>
pub fn hashmap_examples() {
    // Creating a hash map
    let mut scores = HashMap::new();

    // Inserting key-value pairs
    scores.insert(String::from("Blue"), 10);
    scores.insert(String::from("Yellow"), 50);

    println!("Scores: {:?}", scores);

    // Accessing values
    let team_name = String::from("Blue");
    let score = scores.get(&team_name);
    println!("Blue team score: {:?}", score);

    // Iterating
    println!("All scores:");
    for (key, value) in &scores {
        println!("  {}: {}", key, value);
    }
}

/// Demonstrates HashMap methods
pub fn hashmap_methods() {
    let mut map = HashMap::new();

    // Insert or update
    map.insert("a", 1);
    map.insert("b", 2);

    // Only insert if key doesn't exist
    map.entry("c").or_insert(3);
    map.entry("a").or_insert(100); // won't change "a"

    println!("Map: {:?}", map);

    // Update based on old value
    let text = "hello world wonderful world";
    let mut word_count = HashMap::new();

    for word in text.split_whitespace() {
        let count = word_count.entry(word).or_insert(0);
        *count += 1;
    }

    println!("Word count: {:?}", word_count);
}

/// Practical example: Building a frequency map
pub fn frequency_map(numbers: Vec<i32>) -> HashMap<i32, usize> {
    let mut freq = HashMap::new();

    for num in numbers {
        *freq.entry(num).or_insert(0) += 1;
    }

    freq
}

/// Practical example: Grouping items
pub fn group_by_first_letter(words: Vec<String>) -> HashMap<char, Vec<String>> {
    let mut groups = HashMap::new();

    for word in words {
        if let Some(first_char) = word.chars().next() {
            groups.entry(first_char).or_insert_with(Vec::new).push(word);
        }
    }

    groups
}

/// Demonstrates collection conversions
pub fn collection_conversions() {
    // Vec to HashMap
    let teams = vec![String::from("Blue"), String::from("Yellow")];
    let initial_scores = vec![10, 50];

    let scores: HashMap<_, _> = teams.iter().zip(initial_scores.iter()).collect();
    println!("Scores from vec: {:?}", scores);

    // String to Vec<char>
    let s = String::from("hello");
    let chars: Vec<char> = s.chars().collect();
    println!("Chars: {:?}", chars);

    // Vec to String
    let words = vec!["hello", "world"];
    let sentence = words.join(" ");
    println!("Sentence: {}", sentence);
}

/// Demonstrates filtering and mapping collections
pub fn functional_operations() {
    let numbers = vec![1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    // Filter even numbers
    let evens: Vec<i32> = numbers.iter().filter(|&&x| x % 2 == 0).copied().collect();
    println!("Even numbers: {:?}", evens);

    // Map: double each number
    let doubled: Vec<i32> = numbers.iter().map(|&x| x * 2).collect();
    println!("Doubled: {:?}", doubled);

    // Filter and map combined
    let result: Vec<i32> = numbers.iter().filter(|&&x| x > 5).map(|&x| x * x).collect();
    println!("Squares of numbers > 5: {:?}", result);

    // Sum with fold
    let sum: i32 = numbers.iter().fold(0, |acc, &x| acc + x);
    println!("Sum: {}", sum);

    // Find first element matching condition
    let first_even = numbers.iter().find(|&&x| x % 2 == 0);
    println!("First even: {:?}", first_even);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_vector_operations() {
        vector_examples();
        vector_methods();
        vector_different_types();
    }

    #[test]
    fn test_string_operations() {
        string_examples();
        string_indexing();
    }

    #[test]
    fn test_hashmap_operations() {
        hashmap_examples();
        hashmap_methods();
    }

    #[test]
    fn test_frequency_map() {
        let numbers = vec![1, 2, 3, 2, 1, 3, 3];
        let freq = frequency_map(numbers);

        assert_eq!(freq.get(&1), Some(&2));
        assert_eq!(freq.get(&2), Some(&2));
        assert_eq!(freq.get(&3), Some(&3));
    }

    #[test]
    fn test_group_by_first_letter() {
        let words = vec![
            "apple".to_string(),
            "banana".to_string(),
            "apricot".to_string(),
            "berry".to_string(),
        ];

        let groups = group_by_first_letter(words);
        assert_eq!(groups.get(&'a').unwrap().len(), 2);
        assert_eq!(groups.get(&'b').unwrap().len(), 2);
    }
}
