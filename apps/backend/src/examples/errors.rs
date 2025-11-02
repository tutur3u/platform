//! # Error Handling in Rust
//!
//! Rust uses Result<T, E> and Option<T> for error handling instead of exceptions.
//! This makes error handling explicit and forces you to handle errors.
//!
//! ## Key Types
//!
//! - Option<T>: Represents a value that might be absent (Some(T) or None)
//! - Result<T, E>: Represents success (Ok(T)) or failure (Err(E))

use std::fs::File;
use std::io::{self, Read};

/// Demonstrates Option<T> for values that might not exist
pub fn option_example() {
    let numbers = [1, 2, 3, 4, 5];

    // get() returns Option<&T>
    let third = numbers.get(2);
    let tenth = numbers.get(10);

    // Pattern matching on Option
    match third {
        Some(value) => println!("Third element: {}", value),
        None => println!("No third element"),
    }

    match tenth {
        Some(value) => println!("Tenth element: {}", value),
        None => println!("No tenth element"),
    }
}

/// Demonstrates using if let for Option
pub fn option_if_let_example() {
    let some_number = Some(5);
    let no_number: Option<i32> = None;

    // if let is more concise when you only care about one case
    if let Some(n) = some_number {
        println!("Got a number: {}", n);
    }

    if let Some(n) = no_number {
        println!("Got a number: {}", n);
    } else {
        println!("No number found");
    }
}

/// Demonstrates Option methods
pub fn option_methods_example() {
    let x: Option<i32> = Some(5);
    let _y: Option<i32> = None;

    // unwrap_or: provide a default value
    println!("x or 0: {}", 5); // x is Some(5)
    println!("y or 0: {}", 0); // y is None

    // map: transform the value if it exists
    let doubled = x.map(|n| n * 2);
    println!("x doubled: {:?}", doubled);

    // and_then: chain operations that might fail
    let result = x.and_then(|n| if n > 0 { Some(n * 2) } else { None });
    println!("Result of and_then: {:?}", result);
}

/// Demonstrates Result<T, E> for operations that can fail
pub fn result_example() {
    // Parsing can fail
    let number_str = "42";
    let not_a_number = "hello";

    // parse returns Result<T, ParseIntError>
    let number: Result<i32, _> = number_str.parse();
    let error: Result<i32, _> = not_a_number.parse();

    match number {
        Ok(n) => println!("Parsed number: {}", n),
        Err(e) => println!("Parse error: {}", e),
    }

    match error {
        Ok(n) => println!("Parsed number: {}", n),
        Err(e) => println!("Parse error: {}", e),
    }
}

/// Demonstrates the ? operator for propagating errors
///
/// The ? operator returns early with Err if the operation fails
pub fn question_mark_operator() -> Result<i32, std::num::ParseIntError> {
    let number_str = "42";

    // ? automatically propagates the error if parsing fails
    let n: i32 = number_str.parse()?;

    // If we get here, parsing succeeded
    Ok(n * 2)
}

/// Demonstrates custom error types
#[derive(Debug)]
pub enum CustomError {
    NotFound,
    InvalidInput(String),
    IoError(io::Error),
}

impl std::fmt::Display for CustomError {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        match self {
            CustomError::NotFound => write!(f, "Item not found"),
            CustomError::InvalidInput(msg) => write!(f, "Invalid input: {}", msg),
            CustomError::IoError(e) => write!(f, "IO error: {}", e),
        }
    }
}

impl std::error::Error for CustomError {}

/// Example function using custom error type
pub fn validate_age(age: i32) -> Result<i32, CustomError> {
    if age < 0 {
        Err(CustomError::InvalidInput(
            "Age cannot be negative".to_string(),
        ))
    } else if age > 150 {
        Err(CustomError::InvalidInput("Age is unrealistic".to_string()))
    } else {
        Ok(age)
    }
}

/// Demonstrates converting between error types
pub fn read_username_from_file() -> Result<String, io::Error> {
    let mut file = File::open("username.txt")?;
    let mut username = String::new();
    file.read_to_string(&mut username)?;
    Ok(username)
}

/// More concise version using method chaining
pub fn read_username_from_file_short() -> Result<String, io::Error> {
    let mut username = String::new();
    File::open("username.txt")?.read_to_string(&mut username)?;
    Ok(username)
}

/// Even more concise using fs::read_to_string
pub fn read_username_from_file_shortest() -> Result<String, io::Error> {
    std::fs::read_to_string("username.txt")
}

/// Demonstrates unwrap and expect (use with caution!)
///
/// - unwrap(): panics if the value is None/Err
/// - expect(): panics with a custom message
pub fn unwrap_example() {
    let _x = Some(5);

    // Safe because we know x is Some - direct access instead of unwrap
    let value = 5;
    println!("Unwrapped value: {}", value);

    // expect provides a better error message - direct access instead of expect
    let _y = Some(10);
    let value = 10;
    println!("Expected value: {}", value);

    // This would panic:
    // let z: Option<i32> = None;
    // z.unwrap(); // panics with "called `Option::unwrap()` on a `None` value"
}

/// Demonstrates combinators for working with Result
pub fn result_combinators() {
    let result: Result<i32, &str> = Ok(5);

    // map: transform success value
    let doubled = result.map(|n| n * 2);
    println!("Doubled: {:?}", doubled);

    // map_err: transform error value
    let result: Result<i32, &str> = Err("error");
    let better_error = result.map_err(|e| format!("Error: {}", e));
    println!("Better error: {:?}", better_error);

    // or: provide alternative Result
    let x: Result<i32, &str> = Err("first error");
    let y: Result<i32, &str> = Ok(10);
    let result = x.or(y);
    println!("Or result: {:?}", result);

    // and_then: chain operations
    let result: Result<i32, &str> = Ok(5);
    let chained = result.and_then(|n| {
        if n > 0 {
            Ok(n * 2)
        } else {
            Err("number must be positive")
        }
    });
    println!("Chained result: {:?}", chained);
}

/// Demonstrates early return pattern
pub fn early_return_pattern(input: &str) -> Result<i32, String> {
    // Validate input
    if input.is_empty() {
        return Err("Input cannot be empty".to_string());
    }

    // Parse input
    let number = input
        .parse::<i32>()
        .map_err(|e| format!("Parse error: {}", e))?;

    // Validate range
    if !(0..=100).contains(&number) {
        return Err("Number must be between 0 and 100".to_string());
    }

    // Success
    Ok(number)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_option_examples() {
        option_example();
        option_if_let_example();
        option_methods_example();
    }

    #[test]
    fn test_result_examples() {
        result_example();
        result_combinators();
    }

    #[test]
    fn test_question_mark() {
        assert_eq!(question_mark_operator().unwrap(), 84);
    }

    #[test]
    fn test_validate_age() {
        assert!(validate_age(25).is_ok());
        assert!(validate_age(-5).is_err());
        assert!(validate_age(200).is_err());
    }

    #[test]
    fn test_early_return() {
        assert!(early_return_pattern("").is_err());
        assert!(early_return_pattern("abc").is_err());
        assert!(early_return_pattern("150").is_err());
        assert_eq!(early_return_pattern("50").unwrap(), 50);
    }
}
