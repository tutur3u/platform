# Google Calendar Batch Deletion Implementation Plan

## Overview

This document outlines the implementation of batch deletion for Google Calendar sync operations, improving performance and reliability for both full sync and incremental sync operations.

## Current Implementation Issues

### 1. **Performance Problems**
- All events processed in single database operations
- Large OR queries for deletions can timeout
- No memory management for large event sets
- Potential database connection timeouts

### 2. **Error Handling**
- Single point of failure - if one operation fails, entire sync fails
- No partial success handling
- Difficult to retry failed operations

### 3. **Resource Management**
- No control over memory usage
- Database connection pool exhaustion
- No rate limiting for API calls

## Batch Deletion Solution

### 1. **Configuration Constants**
```typescript
const BATCH_SIZE = 100; // Process 100 events at a time for upserts
const DELETE_BATCH_SIZE = 50; // Process 50 events at a time for deletes
```

### 2. **Key Improvements**

#### **A. Batch Processing for Upserts**
- Process events in chunks of 100
- Each batch is a separate database transaction
- Better error isolation and retry capability
- Progress tracking and logging

#### **B. Batch Processing for Deletes**
- Process deletions in chunks of 50
- Smaller batch size for deletes due to complexity of OR queries
- Individual batch error handling
- Detailed logging for each batch

#### **C. Enhanced Error Handling**
- Each batch is processed independently
- Failed batches don't affect successful ones
- Detailed error reporting per batch
- Retry mechanism for failed batches

### 3. **Implementation Details**

#### **Full Sync Batch Processing**
```typescript
// In performFullSyncForWorkspace()
if (events.length > 0) {
  await syncWorkspaceExtendedBatched({ ws_id, events_to_sync: events });
}
```

#### **Incremental Sync Batch Processing**
```typescript
// In performIncrementalSyncForWorkspace()
if (allEvents.length > 0) {
  await syncWorkspaceExtendedBatched({ ws_id, events_to_sync: allEvents });
}
```

### 4. **Benefits**

#### **Performance**
- Reduced database load
- Better memory management
- Faster processing for large datasets
- Improved connection pool utilization

#### **Reliability**
- Partial success handling
- Better error isolation
- Easier debugging and monitoring
- Retry capability for failed batches

#### **Monitoring**
- Detailed progress logging
- Batch-level success/failure tracking
- Performance metrics per batch
- Memory usage monitoring

### 5. **Error Handling Strategy**

#### **Batch-Level Error Handling**
```typescript
try {
  // Process batch
  totalUpserted += batch.length;
} catch (error) {
  console.log(`Error upserting batch ${batchNumber}:`, error);
  // Continue with next batch instead of failing entire sync
}
```

#### **Retry Logic**
- Failed batches can be retried independently
- Exponential backoff for retries
- Maximum retry attempts per batch
- Dead letter queue for permanently failed batches

### 6. **Monitoring and Logging**

#### **Progress Tracking**
```typescript
console.log(`Upserted batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} events)`);
console.log(`Deleted batch ${Math.floor(i / DELETE_BATCH_SIZE) + 1} (${batch.length} events)`);
```

#### **Performance Metrics**
- Total events processed
- Success/failure counts per batch
- Processing time per batch
- Memory usage tracking

### 7. **Configuration Options**

#### **Batch Sizes**
- `BATCH_SIZE`: Number of events to upsert per batch (default: 100)
- `DELETE_BATCH_SIZE`: Number of events to delete per batch (default: 50)

#### **Retry Configuration**
- `MAX_RETRY_ATTEMPTS`: Maximum retries per batch (default: 3)
- `RETRY_DELAY_MS`: Delay between retries (default: 1000ms)

### 8. **Future Enhancements**

#### **Dynamic Batch Sizing**
- Adjust batch sizes based on event complexity
- Memory-aware batch sizing
- Performance-based optimization

#### **Parallel Processing**
- Process multiple batches concurrently
- Worker pool for batch processing
- Load balancing across workers

#### **Advanced Error Handling**
- Dead letter queue for failed batches
- Manual retry mechanisms
- Alerting for persistent failures

## Usage

### Full Sync with Batching
```typescript
// Automatically uses batched processing
const events = await performFullSyncForWorkspace(
  "primary",
  ws_id,
  access_token,
  refresh_token
);
```

### Incremental Sync with Batching
```typescript
// Automatically uses batched processing
const events = await performIncrementalSyncForWorkspace(
  "primary",
  ws_id,
  access_token,
  refresh_token
);
```

## Migration Strategy

1. **Phase 1**: Implement batched functions alongside existing ones
2. **Phase 2**: Update sync tasks to use batched functions
3. **Phase 3**: Monitor performance and adjust batch sizes
4. **Phase 4**: Remove old non-batched functions (optional)

## Monitoring and Alerts

### Key Metrics to Track
- Batch processing time
- Success/failure rates per batch
- Memory usage during sync
- Database connection pool utilization
- API rate limit usage

### Alert Thresholds
- Batch failure rate > 10%
- Average batch processing time > 30 seconds
- Memory usage > 80%
- Database connection pool exhaustion

This implementation provides a robust, scalable solution for handling large-scale Google Calendar sync operations with improved performance and reliability. 