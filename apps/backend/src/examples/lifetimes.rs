//! # Lifetimes in Rust
//!
//! Lifetimes are Rust's way of ensuring that references are always valid.
//! They prevent dangling references and ensure memory safety without garbage collection.
//!
//! ## Key Concepts
//!
//! - Every reference has a lifetime (the scope for which it's valid)
//! - The compiler uses lifetimes to prevent references from outliving the data they point to
//! - Most of the time, lifetimes are implicit and inferred
//! - When the compiler can't infer lifetimes, you must annotate them explicitly
//! - Lifetime parameters don't change how long references live - they describe relationships
//!
//! ## Lifetime Annotation Syntax
//!
//! ```rust
//! &i32        // a reference
//! &'a i32     // a reference with an explicit lifetime 'a
//! &'a mut i32 // a mutable reference with an explicit lifetime 'a
//! ```

/// # Basic Lifetime Example
///
/// This function takes two string slices and returns the longer one.
/// We need lifetime annotations because the compiler can't determine
/// whether the return value refers to `x` or `y`.
///
/// The lifetime `'a` means: "the returned reference will be valid for
/// at least as long as both `x` and `y` are valid."
///
/// ## Example
///
/// ```rust
/// let string1 = String::from("long string is long");
/// let result;
/// {
///     let string2 = String::from("short");
///     result = longest(&string1, &string2);
///     println!("The longest string is {}", result); // Works here
/// }
/// // `result` would be invalid here if it referred to string2
/// ```
pub fn longest<'a>(x: &'a str, y: &'a str) -> &'a str {
    if x.len() > y.len() { x } else { y }
}

/// # Different Lifetime Parameters
///
/// Sometimes we need different lifetime parameters when the output
/// lifetime is tied to only one input.
///
/// Here, the returned reference will always be valid for as long as `x` is valid,
/// regardless of how long `y` is valid.
pub fn first_word<'a, 'b>(x: &'a str, _y: &'b str) -> &'a str {
    x.split_whitespace().next().unwrap_or("")
}

/// # Lifetime with Structs
///
/// When a struct holds references, we must annotate lifetimes.
/// This tells Rust how long the references must remain valid.
///
/// The lifetime annotation `'a` means: "An instance of ImportantExcerpt
/// cannot outlive the reference it holds in its `part` field."
///
/// ## Example
///
/// ```rust
/// let novel = String::from("Call me Ishmael. Some years ago...");
/// let first_sentence = novel.split('.').next().expect("Could not find a '.'");
/// let excerpt = ImportantExcerpt {
///     part: first_sentence,
/// };
/// // `excerpt` is valid as long as `novel` is in scope
/// ```
#[derive(Debug)]
pub struct ImportantExcerpt<'a> {
    pub part: &'a str,
}

impl<'a> ImportantExcerpt<'a> {
    /// Methods on structs with lifetime parameters need to declare them
    pub fn level(&self) -> i32 {
        3
    }

    /// When returning a reference from a method, the lifetime must be
    /// tied to either self or one of the parameters
    pub fn announce_and_return_part(&self, announcement: &str) -> &str {
        println!("Attention please: {}", announcement);
        self.part // Returns a reference with the same lifetime as self
    }
}

/// # Lifetime Elision Rules
///
/// Rust's compiler can infer lifetimes in many cases using "lifetime elision rules".
/// These functions demonstrate when you DON'T need explicit lifetime annotations.

/// Rule 1: Each parameter that is a reference gets its own lifetime parameter
/// Rule 2: If there's exactly one input lifetime, it's assigned to all output lifetimes
///
/// This function doesn't need explicit lifetimes because of Rule 2
pub fn first_word_no_annotation(s: &str) -> &str {
    s.split_whitespace().next().unwrap_or("")
}

/// Rule 3: If there are multiple input lifetime parameters, but one is &self or &mut self,
/// the lifetime of self is assigned to all output lifetime parameters
///
/// This is why methods often don't need lifetime annotations
impl<'a> ImportantExcerpt<'a> {
    /// No need to annotate the return lifetime - it's inferred from &self
    pub fn get_part(&self) -> &str {
        self.part
    }
}

/// # Static Lifetime
///
/// The `'static` lifetime is special - it means the reference can live for
/// the entire duration of the program. All string literals have 'static lifetime.
pub fn static_lifetime_example() -> &'static str {
    // String literals are stored in the program's binary and always available
    "I have a static lifetime"
}

/// # Multiple Structs with Different Lifetimes
///
/// You can have multiple lifetime parameters to express complex relationships.
#[derive(Debug)]
pub struct Context<'a> {
    pub text: &'a str,
}

#[derive(Debug)]
pub struct Parser<'c, 'a> {
    pub context: &'c Context<'a>,
}

impl<'c, 'a> Parser<'c, 'a> {
    /// Parse the context and return a reference to part of it
    /// The lifetime of the returned reference is tied to 'a (the text in Context),
    /// not 'c (the Context struct itself)
    pub fn parse(&self) -> &'a str {
        self.context.text
    }
}

/// # Lifetime Bounds in Generic Types
///
/// You can require that a generic type has a certain lifetime.
/// `T: 'a` means "T must live at least as long as 'a"
pub struct Ref<'a, T: 'a> {
    pub reference: &'a T,
}

/// # Advanced: Lifetime Subtyping
///
/// Longer lifetimes can be coerced into shorter ones (subtyping).
/// This is useful in complex scenarios.
pub fn print_refs<'a, 'b>(x: &'a str, y: &'b str)
where
    'a: 'b, // 'a must outlive 'b (lifetime bound)
{
    println!("x: {}, y: {}", x, y);
}

/// # Higher-Ranked Trait Bounds (HRTB)
///
/// `for<'a>` syntax is used when you need to express that a trait is implemented
/// for any lifetime.
pub fn process_string<F>(f: F)
where
    F: for<'a> Fn(&'a str) -> &'a str,
{
    let s = "test";
    let result = f(s);
    println!("Processed: {}", result);
}

/// # Combining Lifetimes, Generics, and Traits
///
/// This demonstrates all three concepts working together.
use std::fmt::Display;

/// A function with:
/// - Generic type T that must implement Display
/// - Two lifetime parameters
/// - Lifetime bounds
pub fn longest_with_announcement<'a, T>(x: &'a str, y: &'a str, ann: T) -> &'a str
where
    T: Display,
{
    println!("Announcement! {}", ann);
    if x.len() > y.len() { x } else { y }
}

/// # Practical Example: Linked List Node
///
/// A more realistic example showing lifetimes in a data structure.
#[derive(Debug)]
pub struct Node<'a, T> {
    pub data: T,
    pub next: Option<&'a Node<'a, T>>,
}

impl<'a, T> Node<'a, T> {
    /// Create a new node without a next pointer
    pub fn new(data: T) -> Self {
        Node { data, next: None }
    }

    /// Traverse the linked list and count nodes
    pub fn count(&self) -> usize {
        1 + self.next.map_or(0, |node| node.count())
    }
}

/// # Common Lifetime Patterns
///
/// Collection of common patterns you'll encounter.

/// Pattern 1: Factory function returning a struct with a lifetime
pub fn create_excerpt(text: &str) -> ImportantExcerpt {
    ImportantExcerpt {
        part: text.split('.').next().unwrap_or(text),
    }
}

/// Pattern 2: Lifetime in iterators
pub struct Words<'a> {
    text: &'a str,
}

impl<'a> Iterator for Words<'a> {
    type Item = &'a str;

    fn next(&mut self) -> Option<Self::Item> {
        if self.text.is_empty() {
            return None;
        }

        match self.text.find(' ') {
            Some(pos) => {
                let word = &self.text[..pos];
                self.text = &self.text[pos + 1..];
                Some(word)
            }
            None => {
                let word = self.text;
                self.text = "";
                Some(word)
            }
        }
    }
}

pub fn split_into_words(text: &str) -> Words {
    Words { text }
}

/// Pattern 3: Builder pattern with lifetimes
#[derive(Debug)]
pub struct QueryBuilder<'a> {
    table: &'a str,
    conditions: Vec<&'a str>,
}

impl<'a> QueryBuilder<'a> {
    pub fn new(table: &'a str) -> Self {
        QueryBuilder {
            table,
            conditions: Vec::new(),
        }
    }

    pub fn where_clause(&mut self, condition: &'a str) -> &mut Self {
        self.conditions.push(condition);
        self
    }

    pub fn build(&self) -> String {
        format!(
            "SELECT * FROM {} WHERE {}",
            self.table,
            self.conditions.join(" AND ")
        )
    }
}

/// # Common Lifetime Mistakes and Solutions

/// MISTAKE: Returning a reference to a local variable
/// This would not compile:
/// ```compile_fail
/// fn dangle() -> &str {
///     let s = String::from("hello");
///     &s  // ERROR: s is dropped when function returns
/// }
/// ```
/// SOLUTION: Return owned data instead
pub fn no_dangle() -> String {
    String::from("hello")
}

/// MISTAKE: Trying to store references with insufficient lifetimes
/// This demonstrates the correct way to handle it
pub fn process_and_store<'a>(input: &'a str) -> ImportantExcerpt<'a> {
    ImportantExcerpt { part: input }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_longest() {
        let string1 = String::from("long string is long");
        let string2 = String::from("short");

        let result = longest(&string1, &string2);
        assert_eq!(result, "long string is long");

        let result = longest("xyz", &string2);
        assert_eq!(result, "short");
    }

    #[test]
    fn test_longest_with_different_scopes() {
        let string1 = String::from("long string");
        let result;
        {
            let string2 = String::from("short");
            result = longest(&string1, &string2);
            // result is used here while both strings are in scope
            assert_eq!(result, "long string");
        }
        // We can't use `result` here because string2 is out of scope
    }

    #[test]
    fn test_first_word() {
        let s1 = "hello world";
        let s2 = "goodbye";
        assert_eq!(first_word(s1, s2), "hello");
    }

    #[test]
    fn test_important_excerpt() {
        let novel = String::from("Call me Ishmael. Some years ago...");
        let first_sentence = novel.split('.').next().expect("Could not find a '.'");
        let excerpt = ImportantExcerpt {
            part: first_sentence,
        };

        assert_eq!(excerpt.part, "Call me Ishmael");
        assert_eq!(excerpt.level(), 3);
    }

    #[test]
    fn test_announce_and_return_part() {
        let novel = String::from("Some text.");
        let excerpt = ImportantExcerpt { part: &novel };
        let result = excerpt.announce_and_return_part("Important!");
        assert_eq!(result, "Some text.");
    }

    #[test]
    fn test_static_lifetime() {
        let s = static_lifetime_example();
        assert_eq!(s, "I have a static lifetime");
    }

    #[test]
    fn test_context_parser() {
        let text = "Hello, world!";
        let context = Context { text };
        let parser = Parser { context: &context };
        assert_eq!(parser.parse(), "Hello, world!");
    }

    #[test]
    fn test_ref_struct() {
        let x = 42;
        let r = Ref { reference: &x };
        assert_eq!(*r.reference, 42);
    }

    #[test]
    fn test_longest_with_announcement() {
        let result = longest_with_announcement("hi", "world", "Testing!");
        assert_eq!(result, "world");
    }

    #[test]
    fn test_node_count() {
        let node3 = Node::new(3);
        let node2 = Node {
            data: 2,
            next: Some(&node3),
        };
        let node1 = Node {
            data: 1,
            next: Some(&node2),
        };

        assert_eq!(node1.count(), 3);
        assert_eq!(node2.count(), 2);
        assert_eq!(node3.count(), 1);
    }

    #[test]
    fn test_create_excerpt() {
        let text = "First sentence. Second sentence.";
        let excerpt = create_excerpt(text);
        assert_eq!(excerpt.part, "First sentence");
    }

    #[test]
    fn test_words_iterator() {
        let text = "hello world rust programming";
        let words: Vec<&str> = split_into_words(text).collect();
        assert_eq!(words, vec!["hello", "world", "rust", "programming"]);
    }

    #[test]
    fn test_empty_words_iterator() {
        let text = "";
        let words: Vec<&str> = split_into_words(text).collect();
        assert!(words.is_empty());
    }

    #[test]
    fn test_query_builder() {
        let mut builder = QueryBuilder::new("users");
        let query = builder
            .where_clause("age > 18")
            .where_clause("active = true")
            .build();

        assert_eq!(
            query,
            "SELECT * FROM users WHERE age > 18 AND active = true"
        );
    }

    #[test]
    fn test_no_dangle() {
        let result = no_dangle();
        assert_eq!(result, "hello");
    }

    #[test]
    fn test_process_and_store() {
        let input = "test data";
        let excerpt = process_and_store(input);
        assert_eq!(excerpt.part, "test data");
    }

    #[test]
    fn test_lifetime_elision() {
        let s = "hello world";
        let result = first_word_no_annotation(s);
        assert_eq!(result, "hello");
    }

    #[test]
    fn test_get_part_method() {
        let text = "example text";
        let excerpt = ImportantExcerpt { part: text };
        assert_eq!(excerpt.get_part(), "example text");
    }

    #[test]
    fn test_process_string_hrtb() {
        // Test the higher-ranked trait bound function
        process_string(|s| s);
    }
}
