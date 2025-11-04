//! # Traits in Rust
//!
//! Traits are similar to interfaces in other languages. They define shared
//! behavior and allow for polymorphism. Traits are one of Rust's most powerful
//! features for abstraction.
//!
//! ## Key Concepts
//!
//! - Traits define method signatures that types must implement
//! - Types can implement multiple traits
//! - Traits can have default implementations
//! - Trait bounds constrain generic types

/// Simple trait example
pub trait Summary {
    /// Required method - must be implemented
    fn summarize(&self) -> String;

    /// Default implementation - can be overridden
    fn summarize_author(&self) -> String {
        String::from("Anonymous")
    }

    /// Method with default that calls other methods
    fn full_summary(&self) -> String {
        format!(
            "Summary by {}: {}",
            self.summarize_author(),
            self.summarize()
        )
    }
}

/// Example struct that implements Summary
pub struct Article {
    pub title: String,
    pub author: String,
    pub content: String,
}

impl Summary for Article {
    fn summarize(&self) -> String {
        format!("{} by {}", self.title, self.author)
    }

    fn summarize_author(&self) -> String {
        self.author.clone()
    }
}

/// Another struct implementing the same trait
pub struct Tweet {
    pub username: String,
    pub content: String,
    pub reply: bool,
    pub retweet: bool,
}

impl Summary for Tweet {
    fn summarize(&self) -> String {
        format!("{}: {}", self.username, self.content)
    }

    fn summarize_author(&self) -> String {
        format!("@{}", self.username)
    }
}

/// Function that accepts any type implementing Summary
pub fn notify(item: &impl Summary) {
    println!("Breaking news! {}", item.summarize());
}

/// Equivalent to above using trait bound syntax
pub fn notify_trait_bound<T: Summary>(item: &T) {
    println!("Breaking news! {}", item.summarize());
}

/// Multiple trait bounds
pub fn notify_multiple<T: Summary + std::fmt::Display>(item: &T) {
    println!("Breaking news! {}", item);
}

/// Using where clause for cleaner syntax
pub fn some_function<T, U>(t: &T, u: &U) -> String
where
    T: Summary + Clone,
    U: Clone + std::fmt::Debug,
{
    format!("{} - {:?}", t.summarize(), u)
}

/// Returning types that implement traits
///
/// Note: Can only return a single concrete type, not different types
pub fn returns_summarizable(is_article: bool) -> impl Summary {
    // This would only work if both branches return the same type
    if is_article {
        Article {
            title: String::from("Example Article"),
            author: String::from("John Doe"),
            content: String::from("Content here"),
        }
    } else {
        // Would need to return Article here too, not Tweet
        Article {
            title: String::from("Another Article"),
            author: String::from("Jane Doe"),
            content: String::from("More content"),
        }
    }
}

/// Trait for drawable objects (polymorphism example)
pub trait Draw {
    fn draw(&self);
}

pub struct Circle {
    pub radius: f64,
}

impl Draw for Circle {
    fn draw(&self) {
        println!("Drawing a circle with radius {}", self.radius);
    }
}

pub struct Rectangle {
    pub width: f64,
    pub height: f64,
}

impl Draw for Rectangle {
    fn draw(&self) {
        println!("Drawing a rectangle {}x{}", self.width, self.height);
    }
}

/// Using trait objects for dynamic dispatch
///
/// Box<dyn Draw> is a trait object that can hold any type implementing Draw
pub fn draw_all(shapes: Vec<Box<dyn Draw>>) {
    for shape in shapes {
        shape.draw();
    }
}

/// Example of using trait objects
pub fn trait_objects_example() {
    let shapes: Vec<Box<dyn Draw>> = vec![
        Box::new(Circle { radius: 5.0 }),
        Box::new(Rectangle {
            width: 10.0,
            height: 20.0,
        }),
        Box::new(Circle { radius: 3.0 }),
    ];

    draw_all(shapes);
}

/// Trait with associated types
pub trait Container {
    type Item;

    fn add(&mut self, item: Self::Item);
    fn get(&self, index: usize) -> Option<&Self::Item>;
    fn len(&self) -> usize;
}

pub struct NumberContainer {
    items: Vec<i32>,
}

impl Container for NumberContainer {
    type Item = i32;

    fn add(&mut self, item: i32) {
        self.items.push(item);
    }

    fn get(&self, index: usize) -> Option<&i32> {
        self.items.get(index)
    }

    fn len(&self) -> usize {
        self.items.len()
    }
}

/// Operator overloading using traits
use std::ops::Add;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Point {
    pub x: i32,
    pub y: i32,
}

impl Add for Point {
    type Output = Point;

    fn add(self, other: Point) -> Point {
        Point {
            x: self.x + other.x,
            y: self.y + other.y,
        }
    }
}

pub fn operator_overloading_example() {
    let p1 = Point { x: 1, y: 2 };
    let p2 = Point { x: 3, y: 4 };
    let p3 = p1 + p2;

    println!("p1 + p2 = {:?}", p3);
}

/// Common derive traits
///
/// Rust provides several traits that can be automatically implemented
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct User {
    pub id: u32,
    pub name: String,
}

/// Trait inheritance (supertraits)
pub trait Person {
    fn name(&self) -> String;
}

pub trait Student: Person {
    fn student_id(&self) -> u32;

    fn greeting(&self) -> String {
        format!("Student {} (ID: {})", self.name(), self.student_id())
    }
}

pub struct CollegeStudent {
    pub name: String,
    pub id: u32,
}

impl Person for CollegeStudent {
    fn name(&self) -> String {
        self.name.clone()
    }
}

impl Student for CollegeStudent {
    fn student_id(&self) -> u32 {
        self.id
    }
}

/// Blanket implementations
///
/// Implementing a trait for any type that implements another trait
pub trait Printable {
    fn print(&self);
}

// Implement Printable for any type that implements Display
impl<T: std::fmt::Display> Printable for T {
    fn print(&self) {
        println!("{}", self);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_summary_trait() {
        let article = Article {
            title: String::from("Rust is awesome"),
            author: String::from("John Doe"),
            content: String::from("Rust is a systems programming language..."),
        };

        assert!(article.summarize().contains("Rust is awesome"));
        assert_eq!(article.summarize_author(), "John Doe");
    }

    #[test]
    fn test_tweet_summary() {
        let tweet = Tweet {
            username: String::from("rustlang"),
            content: String::from("Check out our new features!"),
            reply: false,
            retweet: false,
        };

        assert!(tweet.summarize().contains("rustlang"));
    }

    #[test]
    fn test_point_add() {
        let p1 = Point { x: 1, y: 2 };
        let p2 = Point { x: 3, y: 4 };
        let p3 = p1 + p2;

        assert_eq!(p3, Point { x: 4, y: 6 });
    }

    #[test]
    fn test_container() {
        let mut container = NumberContainer { items: vec![] };
        container.add(1);
        container.add(2);
        container.add(3);

        assert_eq!(container.len(), 3);
        assert_eq!(container.get(1), Some(&2));
    }
}
