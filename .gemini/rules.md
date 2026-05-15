# Wiki-Lens — Project Rules

> This is the foundational rules file for the Wiki-Lens project.
> All AI assistants MUST read and adhere to this file before performing any changes.

---

## 1. Project Context

**Wiki-Lens** is a microservice (REST API) that serves as a **Pre-filter Layer** for the internal Automation Tool.

- **Purpose**: Receive ticket content from the Automation Tool → find and return **all Wiki cases that match** (Layer 2: every document with non-zero token overlap with the ticket, ordered by score) → the Automation Tool uses this result to enrich the prompt sent to the AI Agent. There is **no fixed cap** (e.g. not limited to 3).
- **Runtime**: Node.js v18+ · TypeScript · Express.js v5
- **Architecture**: Hexagonal Architecture (Ports & Adapters)
- **Data Source**: Markdown files on a GitHub Wiki repo, fetched via Axios.
- **Caching**: All Wiki data is stored in RAM (in-memory) using a `Map` and an `Inverted Index`.

---

## 2. Architecture Rules (Hexagonal)

### 2.1 Layer Dependencies — DO NOT VIOLATE

```
Domain ← Application ← Adapters ← Infrastructure
```

| Layer | Path | Imported From | MUST NOT Import |
|---|---|---|---|
| **Domain** | `src/domain/` | Does not import anything outside itself | Application, Adapters, Infrastructure |
| **Application** | `src/application/` | Domain (entities, ports) | Adapters, Infrastructure (except for logger) |
| **Adapters** | `src/adapters/` | Domain (entities, ports), Infrastructure (config, logger) | Application |
| **Infrastructure** | `src/infrastructure/` | All (where wiring/DI occurs) | — |

> **Sole Exception**: `SyncWikiService` (Application) is allowed to import `logger` from Infrastructure as it is a cross-cutting concern.

### 2.2 Directory Structure — Must Be Followed

```
src/
├── domain/
│   ├── entities/          # Ticket, WikiDocument, MatchResult
│   ├── errors/            # InvalidDataError, TicketNotFoundError
│   ├── wikiSearchText.ts  # English-oriented token fold + Layer 1/2 token helpers (shared with wiki sync)
│   └── ports/
│       ├── in/            # IMatchWikiUseCase, ISyncWikiUseCase
│       └── out/           # IWikiSourcePort, IKnowledgeCachePort
├── application/           # MatchWikiService, SyncWikiService
├── adapters/
│   ├── in/web/
│   │   ├── controllers/   # TicketController
│   │   └── routes/        # api.ts
│   ├── out/
│   │   ├── github/        # GithubWikiAdapter
│   │   ├── cache/         # RamKnowledgeCacheAdapter
│   │   ├── ai/            # Embedding adapters
│   │   └── db/            # LanceDB adapter
│   └── cache/             # Shared cache adapters (if any)
├── infrastructure/
│   ├── config/            # .env validation (Zod + Fail-fast)
│   ├── logger/            # Pino logger
│   ├── server.ts          # Express app setup
│   └── di_container.ts    # Singleton wiring
└── index.ts               # Entry point
```

**Rules for adding new files:**
- New Entity → `src/domain/entities/`
- New Port/Interface → `src/domain/ports/in/` or `src/domain/ports/out/`
- New Use Case Service → `src/application/`
- New Adapter → `src/adapters/in/` or `src/adapters/out/`
- New Config/Infra → `src/infrastructure/`
- **Always** register new singletons in `di_container.ts`.

### 2.3 Path Aliases

The project uses `tsconfig paths` + `tsconfig-paths/register` (dev) + `tsc-alias` (build):

```
@domain/*       → src/domain/*
@application/*  → src/application/*
@adapters/*     → src/adapters/*
@infrastructure/* → src/infrastructure/*
```

> **Always** use path aliases when importing. DO NOT use relative paths (`../../../`).

---

## 3. Coding Conventions

### 3.1 TypeScript

- **Strict mode** enabled (`"strict": true`).
- **DO NOT** use `any`. Use `unknown` if necessary, then perform narrowing.
- Entity classes MUST have a constructor receiving a `Props` interface + call `this.validate()`.
- Port interfaces should be named with an `I` prefix (e.g., `IMatchWikiUseCase`).
- Service classes should be named after the use case: `<Action>WikiService`.
- All dependencies are injected via the constructor with `private readonly`.

### 3.2 API & Validation

- **All input** must be validated using **Zod** at the Controller before being passed to the Domain.
- Zod schemas are declared at the top of the Controller file, **outside** the class.
- Controllers do only 3 things: (1) Parse/Validate input → (2) Call Use Case → (3) Format & return response.
- **DO NOT** place business logic in the Controller.

### 3.3 Error Handling

- Domain errors inherit from `Error` and are located in `src/domain/errors/`.
- Custom errors MUST call `Object.setPrototypeOf(this, <ClassName>.prototype)` in the constructor.
- Global Error Handler Middleware (`error_handler.ts`) handles errors centrally:
  - `ZodError` → 400
  - `InvalidDataError` → 400
  - `TicketNotFoundError` → 404
  - Unhandled → 500 (DO NOT leak stack traces in production)
- **DO NOT** try/catch in the Controller — let errors bubble up to the Global Error Handler.

### 3.4 Naming Conventions

| Type | Convention | Example |
|---|---|---|
| Entity/Service File | PascalCase | `MatchResult.ts`, `SyncWikiService.ts` |
| Config/Route File | snake_case or camelCase | `di_container.ts`, `api.ts` |
| Interface | Prefix `I` + PascalCase | `IKnowledgeCachePort` |
| Class | PascalCase | `RamKnowledgeCacheAdapter` |
| Variable/Function | camelCase | `matchWikiService`, `tokenize()` |
| Constant | UPPER_SNAKE_CASE | `PORT`, `API_SECRET_TOKEN` |

---

## 4. Security Rules

1. **API Authentication**: Every endpoint must pass through the `requireAuth` middleware. The service uses a **static shared secret** (`API_SECRET_TOKEN` from `.env`), **not** JWT. The client sends `Authorization: Bearer <API_SECRET_TOKEN>`; the middleware compares the header to that exact value.
2. **CORS**: Strict configuration, allowing only authorized domains/IPs.
3. **Environment Variables**: Validated using Zod at startup. Missing critical variables → `process.exit(1)` (**Fail-fast**).
4. **Secrets**: DO NOT hardcode tokens/keys. All must be retrieved from `.env`.
5. **Stack Trace**: DO NOT return stack traces to the client in production.

---

## 5. Performance & Concurrency

### 5.1 Atomic Cache Update

When the Sync Flow is complete, you MUST:
1. Build the **entire** new structure (`newCaseMap`, `newHistoryMap`, `newInvertedIndex`).
2. **Re-assign the reference** to the member variable (`this.caseMap = newCaseMap`).
3. **DO NOT** call `.clear()` on the active cache — this causes errors for requests currently being processed.

### 5.2 Two-Layer Search Strategy

```
Layer 1 (O(1)):  Canonical ticket signature → MD5 → historyMap lookup
  Text pipeline (English-oriented, shared with wiki tokenization at sync):
    fold Latin (NFD + strip combining marks) → lowercase → strip punctuation → split → drop tokens length ≤ 2
  Canonical: drop English function-word stoplist → sort keywords with locale "en" (case-insensitive)
             → join with single spaces → MD5(hex)
  If no keywords after stoplist → fallback canonical `__empty_keywords__:<layer2 tokens joined, else folded trimmed text>` then MD5
    ↓ miss
Layer 2 (Scoring): Same **keyword** tokenization as wiki index (`extractHistoryKeywords`) → Inverted Index → overlap score per doc. Results are filtered with a **relative cutoff** (~52% of the best score, with small-score edge cases handled) so documents far below the strongest matches are dropped, then sorted by score descending.
    ↓ found
Cache into historyMap under the same Layer 1 key
```

---

## 6. Logging

- Use **Pino** (pre-configured with `pino-pretty` for dev).
- Log levels: `info` for normal flow, `error` for errors, `fatal` for startup failure.
- **MUST** log: Sync Flow start/complete/fail, Unhandled exceptions.
- **SHOULD** log: Number of cases loaded, search miss/hit statistics.

---

## 7. API Contract

### Endpoint: `POST /api/tickets/match-wiki`

**Request Body:**
```json
{
  "tickets": [
    { "id": "TICKET-001", "message": "ticket content" }
  ]
}
```

**Response Body:**
```json
{
  "results": [
    {
      "ticket_id": "TICKET-001",
      "matches": [
        { "markdown_content": "**template.html** | Description..." }
      ]
    },
    {
      "ticket_id": "TICKET-002",
      "matches": [],
      "message": "No related wiki cases were found."
    }
  ]
}
```

When both Layer 1 and Layer 2 find nothing for a ticket, `matches` is an empty array and **`message`** is set to the English string `No related wiki cases were found.` (equivalent intent to “no related case”). On successful match, `message` is omitted.

`matches` lists **every** wiki case considered relevant for that ticket: **Layer 1** returns cached hits keyed by a **canonical English-oriented keyword signature** (Latin fold, English stopwords removed, sorted with locale `en`, hashed); **Layer 2** uses the **same tokenization** as wiki documents at sync time. Relevant cases are **sorted by relevance** (token overlap count, highest first). Length is not fixed.

**Auth**: `Authorization: Bearer <API_SECRET_TOKEN>` — static secret configured in `.env` (not a JWT).

**Error Responses:**
- `400` — Validation Error (Zod) or Bad Request
- `401` — Unauthorized (missing/incorrect `API_SECRET_TOKEN`)
- `404` — Not Found
- `500` — Internal Server Error

---

## 8. Testing

- Framework: **Jest** + **ts-jest**
- Config: `jest.config.js` with path alias mapping
- Test focus: Application Services (unit test) and Adapters (integration test)
- Domain entities: Test validation logic

---

## 9. Build & Run

```bash
# Development
npx ts-node -r tsconfig-paths/register src/index.ts

# Build
npm run build    # tsc && tsc-alias

# Type check (no emit)
npx tsc --noEmit
```

---

## 10. Checklist before committing changes

- [ ] Run `npx tsc --noEmit` — no TypeScript errors
- [ ] No violation of layer dependency (Domain does not import Adapter/Infra)
- [ ] All API inputs validated with Zod
- [ ] No use of `any`
- [ ] New errors have their own class in `domain/errors/`
- [ ] New adapters registered in `di_container.ts`
- [ ] Imports use path aliases (`@domain/`, `@adapters/`...), no relative paths
