use super::*;

// ---------- Value shaping ----------

pub(super) fn task_list_to_value(list: &TaskListRow, tasks: Vec<Value>) -> Value {
    let mut map = Map::new();
    map.insert("id".to_owned(), Value::String(list.id.clone()));
    map.insert("name".to_owned(), clone_opt(&list.name));
    map.insert("status".to_owned(), clone_opt(&list.status));
    map.insert("color".to_owned(), clone_opt(&list.color));
    map.insert("position".to_owned(), clone_opt(&list.position));
    map.insert("archived".to_owned(), clone_opt(&list.archived));
    map.insert(
        "board_id".to_owned(),
        list.board_id
            .clone()
            .map(Value::String)
            .unwrap_or(Value::Null),
    );
    map.insert("tasks".to_owned(), Value::Array(tasks));
    Value::Object(map)
}

pub(super) fn task_to_value(task: &TaskRow) -> Value {
    let mut map = Map::new();
    map.insert("id".to_owned(), Value::String(task.id.clone()));
    map.insert(
        "list_id".to_owned(),
        task.list_id
            .clone()
            .map(Value::String)
            .unwrap_or(Value::Null),
    );
    for (key, value) in &task.rest {
        map.insert(key.clone(), value.clone());
    }
    Value::Object(map)
}

pub(super) fn clone_opt(value: &Option<Value>) -> Value {
    value.clone().unwrap_or(Value::Null)
}

pub(super) fn board_id(board: &Map<String, Value>) -> Option<String> {
    board.get("id").and_then(Value::as_str).map(str::to_owned)
}
