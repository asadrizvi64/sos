# Why We Have a `shared` Directory

## Overview

The `shared` directory is a **common code package** that contains TypeScript types, interfaces, and validation schemas that are used by **both the frontend and backend**. This is a common pattern in monorepo architectures to ensure type safety and consistency across the entire application.

## Why It Exists Separately

### 1. **Code Reuse Between Frontend and Backend**

Both the frontend (React/TypeScript) and backend (Node.js/Express) need to work with the same data structures:

- **Workflow definitions** - The structure of workflows (nodes, edges, groups)
- **Execution results** - How workflow executions are represented
- **User types** - User data structures
- **Node definitions** - What nodes look like and how they're configured
- **Validation schemas** - Zod schemas for validating data on both sides

### 2. **Type Safety Across the Stack**

By sharing types, we ensure:
- ✅ Frontend and backend always agree on data structures
- ✅ TypeScript catches mismatches at compile time
- ✅ API contracts are automatically enforced
- ✅ No need to maintain duplicate type definitions

### 3. **Single Source of Truth**

Instead of defining types in multiple places:
- ❌ **Without shared**: Define `Workflow` type in frontend, duplicate it in backend
- ✅ **With shared**: Define `Workflow` type once in `shared`, import it everywhere

## What's in the `shared` Directory

```
shared/
├── src/
│   ├── types/          # TypeScript type definitions
│   │   ├── workflow.ts # Workflow, WorkflowDefinition, etc.
│   │   ├── execution.ts # ExecutionStatus, ExecutionResult, etc.
│   │   ├── node.ts     # NodeType, NodeDefinition, etc.
│   │   └── user.ts     # User, UserPreferences, etc.
│   ├── schemas/        # Zod validation schemas
│   │   ├── workflow.ts # CreateWorkflowSchema, UpdateWorkflowSchema
│   │   └── node.ts     # NodeConfigSchema, etc.
│   └── index.ts        # Main export file
└── dist/               # Compiled JavaScript (ESM)
```

## Real-World Examples

### Example 1: Workflow Definition

**In `shared/src/types/workflow.ts`:**
```typescript
export interface WorkflowDefinition {
  nodes: Node[];
  edges: Edge[];
  groups?: Group[];
  viewport?: Viewport;
}
```

**Used in Frontend (`frontend/src/pages/WorkflowBuilder.tsx`):**
```typescript
import { WorkflowGroup } from '@sos/shared';
// Frontend uses this to render the workflow builder UI
```

**Used in Backend (`backend/src/services/emailTriggerService.ts`):**
```typescript
import { WorkflowDefinition } from '@sos/shared';
// Backend uses this to validate and execute workflows
```

### Example 2: Node Execution Context

**In `shared/src/types/node.ts`:**
```typescript
export interface NodeExecutionContext {
  nodeId: string;
  workflowId: string;
  executionId: string;
  input: Record<string, unknown>;
  previousOutputs: Record<string, unknown>;
  config: Record<string, unknown>;
}

export interface NodeExecutionResult {
  success: boolean;
  output?: Record<string, unknown>;
  error?: {
    message: string;
    code?: string;
    details?: unknown;
  };
}
```

**Used in Backend (`backend/src/services/nodeExecutors/connector.ts`):**
```typescript
import { NodeExecutionContext, NodeExecutionResult } from '@sos/shared';

export async function executeConnector(
  context: NodeExecutionContext
): Promise<NodeExecutionResult> {
  // Backend uses these types to execute nodes
}
```

**Used in Frontend (implicitly):**
- Frontend sends execution requests that match `NodeExecutionContext`
- Frontend receives responses that match `NodeExecutionResult`
- TypeScript ensures they match the shared types

### Example 3: Validation Schemas

**In `shared/src/schemas/workflow.ts`:**
```typescript
export const CreateWorkflowSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  workspaceId: z.string(),
  definition: WorkflowDefinitionSchema,
  settings: WorkflowSettingsSchema.optional(),
  tags: z.array(z.string()).optional(),
});
```

**Used in Backend (`backend/src/routes/workflows.ts`):**
```typescript
import { CreateWorkflowSchema } from '@sos/shared';

router.post('/', async (req, res) => {
  // Validate request body using shared schema
  const validated = CreateWorkflowSchema.parse(req.body);
  // ...
});
```

**Used in Frontend:**
- Frontend can use the same schema for client-side validation
- Ensures frontend and backend validation rules match exactly

## How It Works Technically

### 1. **Build Process**

The shared package is compiled separately:
```bash
npm run build:shared  # Compiles shared/src → shared/dist
```

This creates JavaScript files that both frontend and backend can import.

### 2. **Module Resolution**

Both frontend and backend import from `@sos/shared`:

**In `tsconfig.backend.json`:**
```json
{
  "compilerOptions": {
    "paths": {
      "@sos/shared": ["./shared/src"]
    }
  }
}
```

**In `tsconfig.frontend.json`:**
```json
{
  "compilerOptions": {
    "paths": {
      "@sos/shared": ["./shared/src"]
    }
  }
}
```

**At runtime**, Node.js resolves `@sos/shared` via a symlink:
```bash
node_modules/@sos/shared → shared/dist
```

### 3. **Package Structure**

The shared package is treated as a separate npm package:
- Has its own `tsconfig.json`
- Compiles to `dist/` directory
- Exports everything through `index.ts`
- Can be imported like any other npm package

## Benefits of This Architecture

### ✅ **Type Safety**
- Frontend and backend share the same types
- TypeScript catches API mismatches at compile time
- No runtime surprises from type mismatches

### ✅ **DRY Principle (Don't Repeat Yourself)**
- Define types once, use everywhere
- Changes propagate automatically
- No need to update multiple files

### ✅ **Consistency**
- Frontend and backend always agree on data structures
- API contracts are enforced by types
- Validation rules are consistent

### ✅ **Maintainability**
- Single place to update types
- Easier to refactor
- Clear separation of concerns

### ✅ **Developer Experience**
- Autocomplete works across frontend and backend
- Better IDE support
- Easier onboarding

## Alternative Approaches (and why we don't use them)

### ❌ **Duplicate Types**
```typescript
// frontend/src/types/workflow.ts
export interface Workflow { ... }

// backend/src/types/workflow.ts  
export interface Workflow { ... }  // Duplicate!
```
**Problem**: Types can drift apart, causing bugs

### ❌ **Backend-Only Types**
```typescript
// Only backend has types
// Frontend uses `any` or manual type definitions
```
**Problem**: No type safety on frontend, API mismatches

### ❌ **Frontend-Only Types**
```typescript
// Only frontend has types
// Backend doesn't validate structure
```
**Problem**: Backend can't validate, runtime errors

## When to Add to `shared`

Add to `shared` when:
- ✅ Type/interface is used by both frontend and backend
- ✅ Data structure represents a domain concept (Workflow, User, etc.)
- ✅ Validation schema needs to match on both sides
- ✅ API contract needs to be enforced

Don't add to `shared` when:
- ❌ Code is only used by frontend (put in `frontend/src`)
- ❌ Code is only used by backend (put in `backend/src`)
- ❌ Implementation details (utilities, helpers)
- ❌ UI-specific types (React component props)

## Summary

The `shared` directory is essential for:
1. **Type safety** across the entire stack
2. **Code reuse** between frontend and backend
3. **Consistency** in data structures
4. **Maintainability** through a single source of truth

It's a best practice in modern TypeScript monorepos to have a shared package for common types and schemas. This ensures that your frontend and backend always stay in sync, and TypeScript can catch mismatches before they become bugs.

