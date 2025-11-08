//! # Smart Pointers in Rust
//!
//! Smart pointers are data structures that act like pointers but have additional
//! metadata and capabilities. They enable patterns that would be impossible with
//! regular references due to Rust's borrowing rules.
//!
//! ## Core Smart Pointers
//!
//! - `Box<T>`: Heap allocation for single ownership
//! - `Rc<T>`: Reference counting for shared ownership (single-threaded)
//! - `Arc<T>`: Atomic reference counting for shared ownership (multi-threaded)
//! - `RefCell<T>`: Interior mutability with runtime borrow checking
//! - `Mutex<T>`: Mutual exclusion for thread-safe interior mutability
//! - `RwLock<T>`: Reader-writer lock for thread-safe interior mutability
//!
//! ## When to Use Which
//!
//! - Use `Box<T>` when you need heap allocation or recursive types
//! - Use `Rc<T>` when you need shared ownership in single-threaded code
//! - Use `Arc<T>` when you need shared ownership across threads
//! - Use `RefCell<T>` when you need interior mutability with compile-time unknown borrowing
//! - Use `Mutex<T>` when you need thread-safe mutable access
//! - Use `RwLock<T>` when you have many readers and few writers

use std::cell::RefCell;
use std::rc::Rc;
use std::sync::{Arc, Mutex, RwLock};

/// # Box<T>: Heap Allocation
///
/// Box<T> provides the simplest form of heap allocation.
/// Use it when:
/// - You have a large amount of data and want to transfer ownership without copying
/// - You have a type whose size can't be known at compile time
/// - You want to own a value and only care that it implements a particular trait
pub fn box_basics() {
    println!("=== Box Basics ===");

    // Store a value on the heap
    let b = Box::new(5);
    println!("Box value: {}", b);

    // Boxes are automatically deallocated when they go out of scope
    {
        let boxed_string = Box::new(String::from("Hello"));
        println!("Boxed string: {}", boxed_string);
    } // boxed_string is dropped here

    // Box is useful for large data structures
    let large_array = Box::new([0; 1_000_000]);
    println!(
        "Created large array on heap (first element: {})",
        large_array[0]
    );
}

/// # Recursive Types with Box
///
/// Box enables recursive data structures since it has a known size.
#[derive(Debug)]
pub enum List {
    Cons(i32, Box<List>),
    Nil,
}

impl List {
    pub fn new() -> List {
        List::Nil
    }

    pub fn prepend(self, elem: i32) -> List {
        List::Cons(elem, Box::new(self))
    }

    pub fn len(&self) -> usize {
        match self {
            List::Cons(_, tail) => 1 + tail.len(),
            List::Nil => 0,
        }
    }

    pub fn stringify(&self) -> String {
        match self {
            List::Cons(head, tail) => format!("{}, {}", head, tail.stringify()),
            List::Nil => String::from("Nil"),
        }
    }
}

pub fn recursive_type_example() {
    println!("\n=== Recursive Types ===");

    let list = List::new().prepend(1).prepend(2).prepend(3);
    println!("List: {}", list.stringify());
    println!("Length: {}", list.len());
}

/// # Rc<T>: Reference Counting (Single-threaded)
///
/// Rc<T> enables multiple ownership by keeping track of the number of references.
/// When the last reference is dropped, the value is cleaned up.
/// Only use in single-threaded scenarios.
pub fn rc_basics() {
    println!("\n=== Rc Basics ===");

    let a = Rc::new(String::from("Hello, Rc!"));
    println!("a: {}, ref count: {}", a, Rc::strong_count(&a));

    {
        let b = Rc::clone(&a); // Increment reference count
        println!("b: {}, ref count: {}", b, Rc::strong_count(&a));

        let c = Rc::clone(&a);
        println!("c: {}, ref count: {}", c, Rc::strong_count(&a));
    } // b and c go out of scope, ref count decreases

    println!("After scope, ref count: {}", Rc::strong_count(&a));
}

/// # Rc for Shared Data Structures
///
/// Demonstrates using Rc to share data between multiple owners.
#[derive(Debug)]
pub struct Node {
    pub value: i32,
    pub children: Vec<Rc<Node>>,
}

impl Node {
    pub fn new(value: i32) -> Rc<Node> {
        Rc::new(Node {
            value,
            children: Vec::new(),
        })
    }
}

pub fn rc_shared_data() {
    println!("\n=== Rc Shared Data ===");

    let leaf1 = Node::new(3);
    let leaf2 = Node::new(4);

    let branch = Rc::new(Node {
        value: 2,
        children: vec![Rc::clone(&leaf1), Rc::clone(&leaf2)],
    });

    println!("leaf1 ref count: {}", Rc::strong_count(&leaf1));
    println!("leaf2 ref count: {}", Rc::strong_count(&leaf2));
    println!("branch ref count: {}", Rc::strong_count(&branch));
}

/// # RefCell<T>: Interior Mutability
///
/// RefCell<T> allows you to mutate data even when there are immutable references to it.
/// Borrow rules are enforced at runtime instead of compile time.
///
/// Use when you're certain the borrow rules are followed but the compiler can't verify it.
pub fn refcell_basics() {
    println!("\n=== RefCell Basics ===");

    let data = RefCell::new(5);

    // Borrow immutably
    {
        let borrowed = data.borrow();
        println!("Borrowed value: {}", borrowed);
    }

    // Borrow mutably
    {
        let mut borrowed_mut = data.borrow_mut();
        *borrowed_mut += 10;
        println!("Modified value: {}", borrowed_mut);
    }

    println!("Final value: {}", data.borrow());
}

/// # Combining Rc and RefCell
///
/// Rc<RefCell<T>> is a common pattern for shared mutable state in single-threaded code.
pub fn rc_refcell_pattern() {
    println!("\n=== Rc<RefCell> Pattern ===");

    let value = Rc::new(RefCell::new(5));

    let a = Rc::clone(&value);
    let b = Rc::clone(&value);

    *a.borrow_mut() += 10;
    println!("After a modifies: {}", b.borrow());

    *b.borrow_mut() += 20;
    println!("After b modifies: {}", a.borrow());
}

/// # Mock Object Pattern with RefCell
///
/// Demonstrates using RefCell for test mocks that need to record method calls.
pub struct MockMessenger {
    pub sent_messages: RefCell<Vec<String>>,
}

impl MockMessenger {
    pub fn new() -> MockMessenger {
        MockMessenger {
            sent_messages: RefCell::new(vec![]),
        }
    }

    pub fn send(&self, message: &str) {
        // Interior mutability: mutate through immutable reference
        self.sent_messages.borrow_mut().push(String::from(message));
    }
}

pub fn mock_object_example() {
    println!("\n=== Mock Object Pattern ===");

    let messenger = MockMessenger::new();
    messenger.send("Hello");
    messenger.send("World");

    println!("Sent {} messages", messenger.sent_messages.borrow().len());
    for msg in messenger.sent_messages.borrow().iter() {
        println!("  - {}", msg);
    }
}

/// # Arc<T>: Atomic Reference Counting (Multi-threaded)
///
/// Arc<T> is like Rc<T> but safe to use across threads.
/// Use it when you need to share ownership of data between threads.
pub fn arc_basics() {
    println!("\n=== Arc Basics ===");

    let data = Arc::new(vec![1, 2, 3, 4, 5]);

    println!("Original ref count: {}", Arc::strong_count(&data));

    let data_clone = Arc::clone(&data);
    println!("After clone ref count: {}", Arc::strong_count(&data));

    println!("Data: {:?}", data_clone);
}

/// # Mutex<T>: Mutual Exclusion for Thread Safety
///
/// Mutex<T> provides interior mutability with thread safety.
/// Only one thread can access the data at a time.
pub fn mutex_basics() {
    println!("\n=== Mutex Basics ===");

    let m = Mutex::new(5);

    {
        let mut num = m.lock().unwrap(); // Acquire lock
        *num = 6;
        println!("Modified value: {}", num);
    } // Lock is automatically released here

    println!("Final value: {}", m.lock().unwrap());
}

/// # Arc<Mutex<T>>: Shared Mutable State Across Threads
///
/// The most common pattern for sharing mutable data between threads.
pub fn arc_mutex_pattern() {
    use std::thread;

    println!("\n=== Arc<Mutex> Pattern ===");

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

    println!("Final counter value: {}", *counter.lock().unwrap());
}

/// # RwLock<T>: Reader-Writer Lock
///
/// RwLock<T> allows either multiple readers OR one writer.
/// More efficient than Mutex when you have many reads and few writes.
pub fn rwlock_basics() {
    println!("\n=== RwLock Basics ===");

    let lock = RwLock::new(5);

    // Multiple readers can acquire the lock simultaneously
    {
        let r1 = lock.read().unwrap();
        let r2 = lock.read().unwrap();
        println!("r1: {}, r2: {}", r1, r2);
    }

    // Only one writer can acquire the lock
    {
        let mut w = lock.write().unwrap();
        *w += 1;
        println!("Modified to: {}", w);
    }

    println!("Final value: {}", lock.read().unwrap());
}

/// # Arc<RwLock<T>>: Shared Read-Heavy State
///
/// Use when you have many readers and occasional writers across threads.
pub fn arc_rwlock_pattern() {
    use std::thread;

    println!("\n=== Arc<RwLock> Pattern ===");

    let data = Arc::new(RwLock::new(vec![1, 2, 3]));
    let mut handles = vec![];

    // Spawn reader threads
    for i in 0..3 {
        let data_clone = Arc::clone(&data);
        let handle = thread::spawn(move || {
            let vec = data_clone.read().unwrap();
            println!("Reader {} sees: {:?}", i, *vec);
        });
        handles.push(handle);
    }

    // Spawn a writer thread
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

/// # Memory Leak Prevention
///
/// Demonstrates potential pitfalls and how to avoid them.
pub fn memory_leak_prevention() {
    println!("\n=== Memory Leak Prevention ===");

    // Weak references prevent reference cycles
    use std::rc::Weak;

    #[derive(Debug)]
    struct Node {
        value: i32,
        parent: RefCell<Weak<Node>>,
        children: RefCell<Vec<Rc<Node>>>,
    }

    let leaf = Rc::new(Node {
        value: 3,
        parent: RefCell::new(Weak::new()),
        children: RefCell::new(vec![]),
    });

    println!("leaf strong count: {}", Rc::strong_count(&leaf));
    println!("leaf weak count: {}", Rc::weak_count(&leaf));

    {
        let branch = Rc::new(Node {
            value: 5,
            parent: RefCell::new(Weak::new()),
            children: RefCell::new(vec![Rc::clone(&leaf)]),
        });

        *leaf.parent.borrow_mut() = Rc::downgrade(&branch);

        println!("branch strong count: {}", Rc::strong_count(&branch));
        println!("branch weak count: {}", Rc::weak_count(&branch));
    }

    // branch is dropped, but leaf still exists without a reference cycle
    println!("leaf parent: {:?}", leaf.parent.borrow().upgrade());
}

/// # Smart Pointer Comparison Table
///
/// Quick reference for choosing the right smart pointer.
pub fn print_comparison_table() {
    println!("\n=== Smart Pointer Comparison ===");
    println!("┌──────────────┬─────────────┬───────────────┬─────────────┐");
    println!("│ Type         │ Ownership   │ Thread-Safe   │ Mutability  │");
    println!("├──────────────┼─────────────┼───────────────┼─────────────┤");
    println!("│ Box<T>       │ Single      │ No            │ Normal      │");
    println!("│ Rc<T>        │ Shared      │ No            │ No          │");
    println!("│ Arc<T>       │ Shared      │ Yes           │ No          │");
    println!("│ RefCell<T>   │ Single      │ No            │ Interior    │");
    println!("│ Mutex<T>     │ Single      │ Yes           │ Interior    │");
    println!("│ RwLock<T>    │ Single      │ Yes           │ Interior    │");
    println!("└──────────────┴─────────────┴───────────────┴─────────────┘");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread;

    #[test]
    fn test_box() {
        let b = Box::new(42);
        assert_eq!(*b, 42);
    }

    #[test]
    fn test_list() {
        let list = List::new().prepend(1).prepend(2).prepend(3);
        assert_eq!(list.len(), 3);
    }

    #[test]
    fn test_rc() {
        let a = Rc::new(5);
        let b = Rc::clone(&a);
        assert_eq!(*a, 5);
        assert_eq!(*b, 5);
        assert_eq!(Rc::strong_count(&a), 2);
    }

    #[test]
    fn test_refcell() {
        let data = RefCell::new(5);
        *data.borrow_mut() = 10;
        assert_eq!(*data.borrow(), 10);
    }

    #[test]
    fn test_rc_refcell() {
        let value = Rc::new(RefCell::new(5));
        let a = Rc::clone(&value);
        *a.borrow_mut() += 10;
        assert_eq!(*value.borrow(), 15);
    }

    #[test]
    fn test_mock_messenger() {
        let messenger = MockMessenger::new();
        messenger.send("test");
        assert_eq!(messenger.sent_messages.borrow().len(), 1);
    }

    #[test]
    fn test_arc() {
        let data = Arc::new(5);
        let data_clone = Arc::clone(&data);
        assert_eq!(*data, 5);
        assert_eq!(*data_clone, 5);
        assert_eq!(Arc::strong_count(&data), 2);
    }

    #[test]
    fn test_mutex() {
        let m = Mutex::new(5);
        {
            let mut num = m.lock().unwrap();
            *num = 6;
        }
        assert_eq!(*m.lock().unwrap(), 6);
    }

    #[test]
    fn test_arc_mutex_threads() {
        let counter = Arc::new(Mutex::new(0));
        let mut handles = vec![];

        for _ in 0..10 {
            let counter_clone = Arc::clone(&counter);
            let handle = thread::spawn(move || {
                let mut num = counter_clone.lock().unwrap();
                *num += 1;
            });
            handles.push(handle);
        }

        for handle in handles {
            handle.join().unwrap();
        }

        assert_eq!(*counter.lock().unwrap(), 10);
    }

    #[test]
    fn test_rwlock() {
        let lock = RwLock::new(5);
        {
            let mut w = lock.write().unwrap();
            *w += 1;
        }
        assert_eq!(*lock.read().unwrap(), 6);
    }

    #[test]
    fn test_rwlock_multiple_readers() {
        let lock = Arc::new(RwLock::new(5));
        let lock1 = Arc::clone(&lock);
        let lock2 = Arc::clone(&lock);

        let r1 = lock1.read().unwrap();
        let r2 = lock2.read().unwrap();

        assert_eq!(*r1, 5);
        assert_eq!(*r2, 5);
    }

    #[test]
    #[should_panic]
    fn test_refcell_runtime_borrow_check() {
        let data = RefCell::new(5);
        let _borrow1 = data.borrow_mut();
        let _borrow2 = data.borrow_mut(); // Panics: already borrowed
    }
}
