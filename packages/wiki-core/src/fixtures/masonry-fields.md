```wiki-table
- - type: tableHeader
    body: |
      Name
  - type: tableHeader
    body: |
      Type
  - type: tableHeader
    body: |
      Required
  - type: tableHeader
    body: |
      Default
  - type: tableHeader
    body: |
      Description
- - type: tableCell
    body: |
      breakpoints
  - type: tableCell
    body: |
      object
  - type: tableCell
    body: |
      No
  - type: tableCell
    body: |
      undefined
  - type: tableCell
    body: |
      **Optional** responsive breakpoint configuration. Keys are viewport widths in pixels, values are the number of columns to display at or above that width.

      **v0.3.0 Breaking Change**: Now optional (default: `undefined`). When not provided, uses fixed `columns` value.

      Example configuration:

      - `640px`: 1 column (mobile)

      - `768px`: 2 columns (tablet)

      - `1024px`: 3 columns (desktop)

      - `1280px`: 4 columns (large desktop)
```
