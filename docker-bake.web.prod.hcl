variable "COMPOSE_PROJECT_NAME" {
  default = "tuturuuu"
}

target "_platform_local" {
  output = ["type=docker"]
}

group "blue-green-web" {
  targets = ["web-blue", "web-green"]
}

group "blue-green-web-blue" {
  targets = ["web-blue"]
}

group "blue-green-web-green" {
  targets = ["web-green"]
}

group "blue-green-hive" {
  targets = ["hive-blue", "hive-green"]
}

group "blue-green-hive-blue" {
  targets = ["hive-blue"]
}

group "blue-green-hive-green" {
  targets = ["hive-green"]
}

group "blue-green-hive-realtime" {
  targets = ["hive-realtime"]
}

group "blue-green-support" {
  targets = ["backend", "chat-realtime", "meet-realtime", "markitdown", "storage-unzip-proxy", "supermemory", "web-cron-runner"]
}

target "web-blue" {
  inherits = ["_platform_local"]
  tags = ["${COMPOSE_PROJECT_NAME}-web-blue"]
}

target "web-green" {
  inherits = ["_platform_local"]
  tags = ["${COMPOSE_PROJECT_NAME}-web-green"]
}

target "hive-blue" {
  inherits = ["_platform_local"]
  tags = ["${COMPOSE_PROJECT_NAME}-hive-blue"]
}

target "hive-green" {
  inherits = ["_platform_local"]
  tags = ["${COMPOSE_PROJECT_NAME}-hive-green"]
}

target "hive-realtime" {
  inherits = ["_platform_local"]
  tags = ["${COMPOSE_PROJECT_NAME}-hive-realtime"]
}

target "meet-realtime" {
  inherits = ["_platform_local"]
  tags = ["${COMPOSE_PROJECT_NAME}-meet-realtime"]
}

target "chat-realtime" {
  inherits = ["_platform_local"]
  tags = ["${COMPOSE_PROJECT_NAME}-chat-realtime"]
}

target "backend" {
  inherits = ["_platform_local"]
  tags = ["${COMPOSE_PROJECT_NAME}-backend"]
}

target "markitdown" {
  inherits = ["_platform_local"]
  tags = ["${COMPOSE_PROJECT_NAME}-markitdown"]
}

target "storage-unzip-proxy" {
  inherits = ["_platform_local"]
  tags = ["${COMPOSE_PROJECT_NAME}-storage-unzip-proxy"]
}

target "supermemory" {
  inherits = ["_platform_local"]
  tags = ["${COMPOSE_PROJECT_NAME}-supermemory"]
}

target "web-cron-runner" {
  inherits = ["_platform_local"]
  tags = ["${COMPOSE_PROJECT_NAME}-web-cron-runner"]
}
