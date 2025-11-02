//! # Borrowing and References in Rust
//!
//! Borrowing allows you to refer to a value without taking ownership.
//! This is done through references (&T for immutable, &mut T for mutable).
//!
//! ## Rules of References
//!
//! 1. At any given time, you can have EITHER:
//!    - One mutable reference, OR
//!    - Any number of immutable references
//! 2. References must always be valid (no dangling references)

/// Demonstrates immutable borrowing
///
/// Using &T lets you read data without taking ownership
pub fn immutable_borrow_example() {
    let s1 = String::from("hello");

    // Borrow s1 immutably
    let len = calculate_length(&s1);

    // s1 is still valid because we only borrowed it
    println!("The length of '{}' is {}", s1, len);
}

fn calculate_length(s: &str) -> usize {
    // s is a reference, we can read but not modify
    s.len()
} // s goes out of scope, but nothing is dropped because we don't own it

/// Demonstrates mutable borrowing
///
/// Using &mut T lets you modify borrowed data
pub fn mutable_borrow_example() {
    let mut s = String::from("hello");

    // Borrow s mutably
    change(&mut s);

    println!("Modified string: {}", s);
}

fn change(some_string: &mut String) {
    // We can modify the borrowed value
    some_string.push_str(", world");
}

/// Demonstrates the one mutable reference rule
///
/// You can't have multiple mutable references to the same data
pub fn multiple_mutable_borrows() {
    let mut s = String::from("hello");

    {
        // This mutable borrow is in its own scope
        let r1 = &mut s;
        r1.push_str(", world");
    } // r1 goes out of scope here

    // Now we can create another mutable borrow
    let r2 = &mut s;
    r2.push('!');

    println!("{}", r2);
}

/// Demonstrates mixing mutable and immutable references
///
/// You can't have a mutable reference while immutable references exist
pub fn mixed_references() {
    let mut s = String::from("hello");

    let r1 = &s; // immutable borrow
    let r2 = &s; // another immutable borrow
    println!("{} and {}", r1, r2);
    // r1 and r2 are no longer used after this point

    // Now we can create a mutable borrow
    let r3 = &mut s;
    r3.push_str(", world");
    println!("{}", r3);
}

/// Demonstrates reference scope and lifetime
///
/// References are valid from their creation until their last use
pub fn reference_scope_example() {
    let mut s = String::from("hello");

    let r1 = &s;
    let r2 = &s;
    println!("{} and {}", r1, r2);
    // r1 and r2's scope ends here (last use)

    let r3 = &mut s;
    println!("{}", r3);
    // r3's scope ends here
}

/// Demonstrates that Rust prevents dangling references
///
/// This function would NOT compile - it's here for educational purposes
///
/// ```compile_fail
/// fn dangle() -> &String {
///     let s = String::from("hello");
///     &s // ERROR: s is dropped, reference would be invalid
/// }
/// ```
///
/// The correct way is to return ownership:
pub fn no_dangle() -> String {
    String::from("hello") // ownership is transferred to caller
}

/// User struct for demonstration
#[derive(Debug)]
struct User {
    name: String,
    email: String,
}

/// Demonstrates borrowing with structs
pub fn struct_borrowing_example() {
    let user = User {
        name: String::from("Alice"),
        email: String::from("alice@example.com"),
    };

    // Borrow fields immutably
    print_user(&user);

    // user is still valid
    println!("User after borrowing: {:?}", user);
}

fn print_user(user: &User) {
    println!("Name: {}, Email: {}", user.name, user.email);
}

/// Demonstrates borrowing in collections
pub fn collection_borrowing_example() {
    let mut numbers = vec![1, 2, 3, 4, 5];

    // Immutable borrow for reading
    let first = &numbers[0];
    println!("First number: {}", first);
    // first is last used here

    // Now we can mutably borrow
    numbers.push(6);

    println!("Numbers: {:?}", numbers);
}

/// Practical example: String slices
///
/// String slices are references to part of a String
pub fn string_slice_example() {
    let s = String::from("hello world");

    // Slices are references to a contiguous sequence
    let hello = &s[0..5]; // or &s[..5]
    let world = &s[6..11]; // or &s[6..]
    let whole = &s[..]; // entire string

    println!("First word: {}", hello);
    println!("Second word: {}", world);
    println!("Whole string: {}", whole);
}

/// Finding the first word using slices
pub fn first_word(s: &str) -> &str {
    let bytes = s.as_bytes();

    for (i, &item) in bytes.iter().enumerate() {
        if item == b' ' {
            return &s[0..i];
        }
    }

    s
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_borrowing_examples() {
        immutable_borrow_example();
        mutable_borrow_example();
        multiple_mutable_borrows();
        mixed_references();
        reference_scope_example();
        struct_borrowing_example();
        collection_borrowing_example();
        string_slice_example();
    }

    #[test]
    fn test_first_word() {
        assert_eq!(first_word("hello world"), "hello");
        assert_eq!(first_word("hello"), "hello");
    }
}
