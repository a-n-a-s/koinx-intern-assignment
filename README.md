# Transaction Reconciliation Engine

A robust, production-ready Node.js backend system designed to ingest, validate, and reconcile cryptocurrency transactions across multiple sources (User vs. Exchange).

## 🚀 Architecture & Tech Stack

- **Runtime:** Node.js (ES Modules)
- **Framework:** Express.js
- **Database:** MongoDB / Mongoose (Chosen for flexible schema handling of messy raw CSV data)
- **File Processing:** `csv-parser` streams for memory-efficient ingestion.

### High-Level Flow
1. **Ingestion Stream:** Reads CSV files asynchronously.
2. **Validation Layer:** Type-checks and sanitizes data. Invalid rows are flagged but NOT dropped, ensuring full data auditability.
3. **Normalization Layer:** Maps aliases (`bitcoin` -> `BTC`) and equivalent types (`TRANSFER_IN` -> `TRANSFER_OUT`).
4. **Matching Engine:** Evaluates transactions using configurable tolerances (Timestamp and Quantity) to categorize them into `Matched`, `Conflicting`, or `Unmatched`.

## ⚙️ Features & Edge Cases Handled

This engine was specifically designed to handle "messy" real-world data. The following edge cases are gracefully managed:

- **Malformed Dates:** Cast failures (e.g., `Invalid Date`) are caught before DB insertion.
- **Negative Quantities:** Flagged immediately as `isValid: false`.
- **Missing Required Fields:** Rows missing crucial identifiers are kept in the DB but excluded from the matching algorithm.
- **Duplicate Transaction IDs:** Handled cleanly; duplicates are tracked and prevented from skewing reports.
- **Asset Aliases:** Built-in mapping (e.g., converting `bitcoin` to `BTC`) to ensure proper matching.
- **Perspective Differences:** Automatically matches Exchange `TRANSFER_IN` with User `TRANSFER_OUT`.

## 🛠️ Setup & Installation

1. **Clone the repository and install dependencies:**
   ```bash
   npm install
   ```

2. **Environment Variables:**
   Create a `.env` file in the src directory:
   ```env
   PORT=3000
   MONGO_URI=mongodb://localhost:27017/koinx-reconciliation
   TIMESTAMP_TOLERANCE_SECONDS=300
   QUANTITY_TOLERANCE_PCT=0.01
   ```

3. **Run the server:**
   ```bash
   # Development mode with hot-reload
   npm run dev
   
   # Or directly
   node src/server.js
   ```

## 📖 API Documentation

### 1. Trigger Reconciliation
`POST /api/reconcile`
Initiates the ingestion and matching process. Accepts optional config overrides.

**Request Body (Optional):**
```json
{
  "timestampToleranceSeconds": 600,
  "quantityTolerancePct": 0.05
}
```

**Response:**
```json
{
  "success": true,
  "message": "Reconciliation process started",
  "runId": "uuid-v4-string"
}
```

### 2. Get Full Report
`GET /api/report/:runId`
Returns the complete structured reconciliation report including all categorized transactions.

### 3. Get Report Summary
`GET /api/report/:runId/summary`
Returns a lightweight overview of the results.

**Response:**
```json
{
  "success": true,
  "data": {
    "matched": 22,
    "conflicting": 0,
    "unmatchedUser": 0,
    "unmatchedExchange": 3
  }
}
```

### 4. Get Unmatched Transactions
`GET /api/report/:runId/unmatched`
Returns only the transactions that failed to find a pair, along with the reasons.

## 📈 Scalability Considerations (Future Scope)
- The current matching engine is $O(N \times M)$. For million-row files, transactions can be pre-bucketed/indexed by `type` and `asset` in MongoDB, and the matching engine can be offloaded to a Redis Queue / BullMQ worker.
- Implementing Streams for the `Matching Engine` instead of pulling all rows into memory at once.
