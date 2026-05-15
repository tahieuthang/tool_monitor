# Wiki-Lens — Development Workflow

> This is the standardized workflow file for handling tasks from requirement gathering to completion.
> All AI assistants MUST follow this workflow for every code change.
> Read in conjunction with `rules.md` to understand foundational constraints.

---

## Phase 1: Understand (Requirement Gathering)

### 1.1 Gathering Context

1. **Read** `rules.md` to grasp architecture, conventions, and constraints.
2. **Read** the main design document: `docs/WikiLens-docs-v1.md`.
3. **Determine** the type of requirement:

| Type | Example | Plan Required? |
|---|---|---|
| **Hotfix** | Fix TypeScript errors, fix validation | No |
| **Small Change** | Add field to response, rename | No |
| **Feature** | Add new endpoint, add search layer | Yes |
| **Refactor** | Split service, change architecture | Yes |

### 1.2 Impact Analysis

Before coding, list:
- **Files to modify** (in order: Domain → Application → Adapters → Infrastructure)
- **New files to create** (if any)
- **Contract changes** (Does API input/output change?)
- **Breaking changes** (Will it affect the Automation Tool calling the API?)

---

## Phase 2: Plan (Planning — Feature/Refactor Only)

### 2.1 Write Implementation Plan

Create `implementation_plan.md` including:

```markdown
# [Objective Description]

## Scope of Changes
- Domain: ...
- Application: ...
- Adapters: ...
- Infrastructure: ...

## Detailed Design
### [Component 1]
- File: `path/to/file.ts`
- Change: ...

## Open Questions (if any)
## Verification Plan
```

### 2.2 Wait for Approval

- **STOP** and wait for user approval before coding.
- If the user requests plan adjustments → update and wait for approval again.

---

## Phase 3: Execute (Implementation)

### 3.1 Order of Execution — ALWAYS Inside Out

```
1. Domain Layer    (entities, errors, ports)
2. Application     (services)
3. Adapters        (controllers, adapters)
4. Infrastructure  (DI container, config, routes)
```

> **Reason**: Outer layers depend on inner layers. Implementing from the inside out ensures each step is compilable.

### 3.2 Process for Each Type of Change

#### A. Adding a New Entity

```
1. Create Props interface → class entity in domain/entities/
2. Add validate() if necessary
3. Export from the new file
```

#### B. Adding/Modifying a Use Case

```
1. Update or create Port interface (domain/ports/in/)
2. Implement service (application/)
3. If a new outbound port is needed → create interface in domain/ports/out/
4. Implement adapter (adapters/out/)
5. Register in di_container.ts
```

#### C. Adding/Modifying an API Endpoint

```
1. Determine request/response contract
2. Create Zod schema for request validation
3. Create/modify Controller (adapters/in/web/controllers/)
4. Register route (adapters/in/web/routes/api.ts)
5. If new Controller → register in di_container.ts
```

#### D. Changing Response Format

```
1. Update entity MatchResult (if necessary)
2. Update Controller response mapping
3. Update API Contract in rules.md
4. Update docs/WikiLens-docs-v1.md
```

#### E. Adding a New Error

```
1. Create class extending Error in domain/errors/
2. Call Object.setPrototypeOf() in constructor
3. Add handling case to error_handler.ts
```

### 3.3 Anti-patterns — DO NOT DO

| ❌ Do Not | ✅ Instead |
|---|---|
| Business logic in Controller | Place in Application Service |
| Import adapter in Domain | Create Port interface |
| Call `.clear()` on active cache | Build new and re-assign reference |
| Use `any` | Use `unknown` + type narrowing |
| Hardcode config values | Read from `.env` via config module |
| Relative import (`../../..`) | Path alias (`@domain/`, `@adapters/`) |
| Try/catch in Controller | Let Global Error Handler process |
| Skip Zod validation | Always validate at the Controller layer |

---

## Phase 4: Verify (Verification)

### 4.1 Mandatory Checklist

After each change, run in order:

```bash
# 1. Type check
npx tsc --noEmit

# 2. Unit tests (if any)
npx jest --passWithNoTests

# 3. Trial run (for major changes)
npx ts-node -r tsconfig-paths/register src/index.ts
```

### 4.2 Verify by Change Type

| Change | Verify |
|---|---|
| API response format | `tsc --noEmit` + manual test with curl/Postman |
| New entity/port | `tsc --noEmit` — ensure compilation |
| New adapter | `tsc --noEmit` + check DI container |
| Error handling | `tsc --noEmit` + test case triggering error |
| Cache logic | Unit test for RamKnowledgeCacheAdapter |

### 4.3 Automatic Review

Before reporting completion, self-check:
- [ ] No TypeScript errors (`tsc --noEmit` exit code 0)
- [ ] Layer dependency not violated
- [ ] Imports use path aliases
- [ ] No `any` in new code
- [ ] Response format matches API Contract in `rules.md`
- [ ] If endpoint added → auth middleware included

---

## Phase 5: Document (Documentation)

### 5.1 Update Documentation

If changes affect:
- **API Contract** → update `rules.md` section 7 + `docs/WikiLens-docs-v1.md` section 3
- **Architecture** → update `rules.md` section 2 + `docs/WikiLens-docs-v1.md` section 4
- **New conventions** → update `rules.md`

### 5.2 Create Walkthrough

After completing a feature/refactor, create `walkthrough.md` summarizing:
- What changed
- Design rationale
- Verification results

---

## Quick Reference: File Map

To quickly know which file to modify when receiving a request:

```
"Add field to response"
  → MatchResult.ts → TicketController.ts

"Add new endpoint"
  → Port interface → Service → Controller → api.ts → di_container.ts

"Change search/match method"
  → MatchWikiService.ts → IKnowledgeCachePort.ts → RamKnowledgeCacheAdapter.ts

"Change data source"
  → IWikiSourcePort.ts → GithubWikiAdapter.ts (or new adapter)

"Add env variable"
  → .env → config/index.ts (Zod schema)

"Fix validation error"
  → TicketController.ts (Zod schema) or domain entities validate()

"Change sync logic"
  → SyncWikiService.ts → GithubWikiAdapter.ts
```
