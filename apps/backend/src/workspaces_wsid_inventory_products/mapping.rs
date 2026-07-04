use super::*;

// ---------------------------------------------------------------------------
// Product response mapping
// ---------------------------------------------------------------------------

pub(super) fn select_primary_inventory(inventories: &[Value]) -> Option<&Value> {
    if inventories.is_empty() {
        return None;
    }

    inventories.iter().min_by(|a, b| {
        let key_a = inventory_sort_key(a);
        let key_b = inventory_sort_key(b);
        key_a.cmp(&key_b)
    })
}

pub(super) fn inventory_sort_key(inv: &Value) -> String {
    let warehouse_id = inv
        .get("warehouse_id")
        .and_then(Value::as_str)
        .unwrap_or("");
    let unit_id = inv.get("unit_id").and_then(Value::as_str).unwrap_or("");
    let created_at = inv.get("created_at").and_then(Value::as_str).unwrap_or("");
    format!("{warehouse_id}|{unit_id}|{created_at}")
}

pub(super) fn map_product(
    item: &Value,
    can_view_stock: bool,
    avatar_map: &std::collections::HashMap<String, Value>,
) -> Value {
    let id = item.get("id").cloned().unwrap_or(Value::Null);
    let id_str = id.as_str().unwrap_or("");

    let avatar_url = avatar_map.get(id_str).cloned().unwrap_or(Value::Null);

    let inventory_products: &[Value] = item
        .get("inventory_products")
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or(&[]);

    let primary = select_primary_inventory(inventory_products);

    let unit = if can_view_stock {
        primary
            .and_then(|p| p.get("inventory_units"))
            .and_then(|u| u.get("name"))
            .cloned()
            .unwrap_or(Value::Null)
    } else {
        Value::Null
    };

    let stock: Value = if can_view_stock {
        Value::Array(
            inventory_products
                .iter()
                .map(|inv| {
                    json!({
                        "amount": inv.get("amount").cloned().unwrap_or(Value::Null),
                        "min_amount": inv.get("min_amount").cloned().unwrap_or(Value::Null),
                        "unit": inv.get("inventory_units").and_then(|u| u.get("name")).cloned().unwrap_or(Value::Null),
                        "warehouse": inv.get("inventory_warehouses").and_then(|w| w.get("name")).cloned().unwrap_or(Value::Null),
                        "price": inv.get("price").cloned().unwrap_or(Value::Null),
                    })
                })
                .collect(),
        )
    } else {
        Value::Array(Vec::new())
    };

    let inventory: Value = if can_view_stock {
        Value::Array(
            inventory_products
                .iter()
                .map(|inv| {
                    json!({
                        "unit_id": inv.get("unit_id").cloned().unwrap_or(Value::Null),
                        "warehouse_id": inv.get("warehouse_id").cloned().unwrap_or(Value::Null),
                        "amount": inv.get("amount").cloned().unwrap_or(Value::Null),
                        "min_amount": inv.get("min_amount").and_then(Value::as_f64).unwrap_or(0.0),
                        "price": inv.get("price").and_then(Value::as_f64).unwrap_or(0.0),
                        "unit_name": inv.get("inventory_units").and_then(|u| u.get("name")).cloned().unwrap_or(Value::Null),
                        "warehouse_name": inv.get("inventory_warehouses").and_then(|w| w.get("name")).cloned().unwrap_or(Value::Null),
                    })
                })
                .collect(),
        )
    } else {
        Value::Array(Vec::new())
    };

    let min_amount = if can_view_stock {
        primary
            .and_then(|p| p.get("min_amount"))
            .cloned()
            .unwrap_or(Value::Null)
    } else {
        Value::Null
    };

    let warehouse = if can_view_stock {
        primary
            .and_then(|p| p.get("inventory_warehouses"))
            .and_then(|w| w.get("name"))
            .cloned()
            .unwrap_or(Value::Null)
    } else {
        Value::Null
    };

    let owner = item.get("inventory_owners").and_then(|o| {
        if o.is_null() {
            None
        } else {
            Some(json!({
                "id": o.get("id").cloned().unwrap_or(Value::Null),
                "name": o.get("name").cloned().unwrap_or(Value::Null),
                "avatar_url": o.get("avatar_url").cloned().unwrap_or(Value::Null),
                "linked_workspace_user_id": o.get("linked_workspace_user_id").cloned().unwrap_or(Value::Null),
            }))
        }
    });

    let finance_category = item.get("transaction_categories").and_then(|tc| {
        if tc.is_null() {
            None
        } else {
            Some(json!({
                "id": tc.get("id").cloned().unwrap_or(Value::Null),
                "name": tc.get("name").cloned().unwrap_or(Value::Null),
                "color": tc.get("color").cloned().unwrap_or(Value::Null),
                "icon": tc.get("icon").cloned().unwrap_or(Value::Null),
            }))
        }
    });

    json!({
        "archived": item.get("archived").and_then(Value::as_bool).unwrap_or(false),
        "avatar_url": avatar_url,
        "id": id,
        "name": item.get("name").cloned().unwrap_or(Value::Null),
        "manufacturer_id": item.get("manufacturer_id").cloned().unwrap_or(Value::Null),
        "manufacturer": item.get("inventory_manufacturers").and_then(|m| m.get("name")).cloned().unwrap_or(Value::Null),
        "description": item.get("description").cloned().unwrap_or(Value::Null),
        "usage": item.get("usage").cloned().unwrap_or(Value::Null),
        "unit": unit,
        "stock": stock,
        "inventory": inventory,
        "min_amount": min_amount,
        "warehouse": warehouse,
        "category": item.get("product_categories").and_then(|c| c.get("name")).cloned().unwrap_or(Value::Null),
        "category_id": item.get("category_id").cloned().unwrap_or(Value::Null),
        "owner_id": item.get("owner_id").cloned().unwrap_or(Value::Null),
        "owner": owner.unwrap_or(Value::Null),
        "finance_category_id": item.get("finance_category_id").cloned().unwrap_or(Value::Null),
        "finance_category": finance_category.unwrap_or(Value::Null),
        "ws_id": item.get("ws_id").cloned().unwrap_or(Value::Null),
        "created_at": item.get("created_at").cloned().unwrap_or(Value::Null),
    })
}
