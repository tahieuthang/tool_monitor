# 📄 System Design Plan: Wiki-Lens (RAG Pre-filter)

## 1. Project Overview

**Wiki-Lens** is an independent microservice (API) that acts as a **Pre-filter Layer** for the existing Automation Tool.

Instead of the Automation Tool stuffing a long list of brief Wiki descriptions into the AI Agent's prompt (which leads to lack of context and hallucinations), it will send the ticket content to Wiki-Lens via API.

Wiki-Lens retrieves the **Top N** (e.g., 3-5) most relevant Wiki documents and returns them to the Automation Tool to enrich the prompt, enabling the AI Agent to make more accurate and confident decisions.

## 2. Tech Stack & Technologies

*   **Runtime:** Node.js (v18+)
*   **Language:** TypeScript
*   **Architecture:** Hexagonal Architecture (Ports and Adapters)
*   **Web Framework:** Express.js (REST API)
*   **Data Source:** GitHub Wiki (Using Axios to fetch Raw Content from Markdown files in a GitHub Wiki repository).

---

## 3. Workflow Logic & Input/Output

### Overall Workflow

1.  **Synchronization Flow (Sync Flow) - Every 60 minutes**
    *   **Fetch:** Call GitHub API/URL to get the source file (e.g., `5.5-Template-Description.md`) using Axios.
    *   **Transform:** Use Regex to parse Markdown into a JSON array of cases (including tokens filtered for stop-words) and store them in RAM.
    *   **Refresh RAM:** Overwrite the cases array, clear the `historyMap` (`historyMap.clear()`), and rebuild the inverted index (`rebuildInvertedIndex()`).

2.  **Query Flow (Search Flow) - 2 Layers**

    *   **Layer 1: Exact Match (Fast Response)**
        *   **Input:** Ticket content.
        *   **Logic:** MD5 Hash the content → Lookup in `historyMap`.
        *   **Result:** If found, return Top N immediately ($O(1)$).
    *   **Layer 2: Inverted Index (Deep Analysis) - Fallback if Layer 1 misses**
        *   **Tokenize:** Break the ticket message into a list of keywords.
        *   **Scoring:** Iterate keywords through the `invertedIndex` → Aggregate scores for relevant cases.
        *   **Rank & Cache:** Sort by score → Take Top N → Cache result in `historyMap` (for future Layer 1 hits).

**Note:** The two layers run sequentially (Layer 1 → Layer 2). If Layer 1 returns results, Layer 2 is skipped. If Layer 2 finds results, they are cached in `historyMap`.

**In-Memory Data Structure:**
```json
{
  "last_updated": "2026-05-08T14:20:00Z",
  "cases": [
    { 
      "id": "case_01", 
      "markdown_content": "| **allocation.html** | Use this when... |", 
      "tokens": ["allocation", "use", "this", "when"] 
    },
    { 
      "id": "case_02", 
      "markdown_content": "| **pay-not-full.html** | Use this when... |", 
      "tokens": ["pay", "not", "full"] 
    }
  ],
  "history_map": {
    "a1b2c3d4_hash": ["case_01", "case_03"],
    "e5f6g7h8_hash": ["case_02"]
  }
}
```

### API Input / Output

**Endpoint:** `POST /api/tickets/match-wiki`

**Request Body (Input):**
```json
{
  "tickets": [
    { "id": "TICKET-001", "message": "ticket content 1" },
    { "id": "TICKET-002", "message": "ticket content 2" }
  ]
}
```

**Response Body (Output):**
```json
{
  "results": [
    {
      "ticket_id": "TICKET-001",
      "matches": [
        {
          "markdown_content": "**allocation.html** | Use this when..."
        },
        {
          "markdown_content": "**pay-not-full.html** | Use this when..."
        }
      ]
    },
    {
      "ticket_id": "TICKET-002",
      "matches": []
    }
  ]
}
```

---

## 4. Hexagonal Architecture (Directory Structure)

The project follows the Hexagonal Architecture (Ports & Adapters) pattern to decouple Domain logic from external technical concerns (Express, GitHub).

### Proposed Directory Structure

```text
wiki-lens/
├── src/
│   ├── domain/                      # (DOMAIN LAYER) Core business logic
│   │   ├── entities/                # Data entities
│   │   │   ├── Ticket.ts            # Input ticket (ID and content)
│   │   │   ├── WikiDocument.ts      # Parsed Wiki file information
│   │   │   └── MatchResult.ts       # Match result (Ticket ID + Markdown Content)
│   │   └── ports/                   # Interfaces
│   │       ├── in/                  # Inbound Ports (Use Cases)
│   │       │   ├── IMatchWikiUseCase.ts
│   │       │   └── ISyncWikiUseCase.ts
│   │       └── out/                 # Outbound Ports
│   │           ├── IWikiSourcePort.ts      # GitHub data retrieval
│   │           └── IKnowledgeCachePort.ts  # Hash & Inverted Index access
│   ├── application/                 # (APPLICATION LAYER) Use Case implementations
│   │   ├── MatchWikiService.ts      # Orchestration: Layer 1 (Hash) -> Layer 2 (Index)
│   │   └── SyncWikiService.ts       # Logic: Fetch GitHub -> Parse MD -> Rebuild RAM Cache
│   ├── adapters/                    # (ADAPTER LAYER) Concrete implementations
│   │   ├── in/                      # Driving Adapters (Inbound)
│   │   │   └── web/
│   │   │       ├── controllers/     # Express Controllers
│   │   │       │   └── TicketController.ts
│   │   │       └── routes/          # Express Routes
│   │   │           └── api.ts
│   │   └── out/                     # Driven Adapters (Outbound)
│   │       ├── github/              # GitHub Adapter
│   │       │   └── GithubWikiAdapter.ts      # simple-git or Axios raw MD calls
│   │       └── cache/               # RAM Cache (Core of Layer 1 & 2)
│   │           └── RamKnowledgeCacheAdapter.ts # Map (Hash) & Map<Set> (Index) implementation
│   ├── infrastructure/              # (INFRASTRUCTURE LAYER) System configuration
│   │   ├── config/                  # .env management (GITHUB_PAT, PORT)
│   │   ├── server.ts                # Express App initialization
│   │   └── di_container.ts          # Singleton registration (Cache, Services)
│   └── index.ts                     # Entry point
├── package.json                     # Dependencies: express, simple-git, crypto, cors, dotenv
└── tsconfig.json
```

---

**Guidelines & Best Practices**:

-   **Security**:
    -   Validate all API inputs using **Zod** before passing them to the Domain layer.
    -   Implement an authentication mechanism (e.g., API Key or Bearer Token) between the Automation Tool and Wiki-Lens to prevent unauthorized access.
    -   Configure **CORS** strictly to allow only authorized domains/IPs.
-   **Performance & Concurrency**:
    -   **Atomic Cache Update**: When the Sync flow (every 60 mins) completes, build the new Map/Index entirely before **re-assigning** the reference. Do not call `.clear()` on the active cache to avoid request failures during synchronization.
-   **Error Handling**:
    -   Return appropriate HTTP status codes (400 for Bad Request, 401/403 for Auth issues, 404 for Not Found, 500 for Internal Server Error).
    -   Implement a **Global Error Handler Middleware** in Express to catch all unhandled exceptions and return a standardized JSON format. Never leak stack traces to the client in production.
-   **Logging & Monitoring**: Integrate a logging library (e.g., **Winston** or **Pino**) to record critical requests/responses, system errors, and the status of the Sync Flow (success/failure).
-   **Environment Variables**: All environment variables (PORT, GITHUB_PAT, etc.) must be validated at startup. If critical variables are missing, the application should throw an error and stop immediately (**Fail-fast**).
-   **Graceful Shutdown**: Listen for system signals (SIGINT, SIGTERM) to shut down the Express server and clear any running intervals/timeouts gracefully.
-   **Directory Structure**: Adhere strictly to the Hexagonal Architecture rules as described in section 4.
-   **Code Style**: Follow TypeScript best practices and **Clean Code** principles. Avoid using the `any` type (use `unknown` if necessary).
-   **Core Principles**: Code should be readable, understandable, maintainable, scalable, and testable.
