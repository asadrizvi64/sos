# Project Structure Reference - Official Architecture

**Last Updated:** November 17, 2025  
**Status:** ✅ Official Structure - Use This Going Forward

---

## ⚠️ IMPORTANT: This is the Official Structure

**All future updates to this codebase MUST follow this structure. This document serves as the single source of truth for the project architecture.**

---

## Root Directory Structure

```
SOS/
├── package.json              ✅ SINGLE root package.json (ALL dependencies)
├── package-lock.json         ✅ SINGLE lock file
├── node_modules/             ✅ SINGLE node_modules (ALL packages here)
│
├── Config Files (ALL at root) ✅
│   ├── vite.config.ts
│   ├── drizzle.config.ts
│   ├── jest.config.js
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── tsconfig.backend.json
│   ├── tsconfig.frontend.json
│   ├── tsconfig.node.json
│   ├── .eslintrc.json
│   └── .npmrc
│
├── Documentation (Root - Main docs only)
│   ├── README.md             ✅ Main project README
│   ├── BUILD.md              ✅ Build documentation
│   └── PRD.md                ✅ Product requirements
│
├── docs/                     ✅ ALL other documentation (251+ files)
│   └── *.md
│
├── backend/                  ✅ Source code ONLY
│   ├── src/
│   ├── dist/
│   ├── drizzle/
│   ├── scripts/
│   └── (NO package.json, NO node_modules, NO config files)
│
├── frontend/                 ✅ Source code ONLY
│   ├── src/
│   ├── dist/
│   └── (NO package.json, NO node_modules, NO config files)
│
├── shared/                   ✅ Shared code
│   ├── src/
│   ├── dist/
│   └── tsconfig.json
│
├── index.html                ✅ Frontend entry point (at root)
├── render.yaml               ✅ Render deployment config
├── test-alerts.js            ✅ Test scripts (at root)
└── test-connection.js        ✅ Test scripts (at root)
```

---

## Core Principles

### 1. Single Root Package.json ✅
- **ALL dependencies** (frontend + backend + shared) in `root/package.json`
- **NO package.json** in `backend/`, `frontend/`, or `shared/`
- **Single source of truth** for all dependencies

### 2. Single Node Modules ✅
- **ONLY** `root/node_modules/` should exist
- **NO node_modules** in `backend/`, `frontend/`, or `shared/`
- All packages resolved from root

### 3. All Config Files at Root ✅
- **ALL build/config files** at root level
- Configs reference paths relative to root
- **NO config files** in subdirectories (except `shared/tsconfig.json`)

### 4. Documentation Structure ✅
- **Root:** Only `README.md`, `BUILD.md`, `PRD.md`
- **docs/:** ALL other `.md` files
- **NO .md files** in root (except the 3 main docs)
- **NO .md files** in `backend/`, `frontend/`, or `shared/`

### 5. Source Code Only in Subdirectories ✅
- `backend/` contains ONLY source code (`src/`, `dist/`, `scripts/`, `drizzle/`)
- `frontend/` contains ONLY source code (`src/`, `dist/`)
- `shared/` contains ONLY shared code (`src/`, `dist/`)

---

## File Placement Rules

### ✅ DO Place at Root:
- `package.json` - Single root package.json
- `package-lock.json` - Single lock file
- All config files (`.config.*`, `tsconfig.*.json`)
- `index.html` - Frontend entry point
- `render.yaml` - Deployment config
- Test scripts (`test-*.js`)
- Main docs (`README.md`, `BUILD.md`, `PRD.md`)

### ✅ DO Place in `docs/`:
- ALL other `.md` files
- Architecture documentation
- Implementation guides
- Deployment guides
- API documentation
- Any project documentation

### ❌ DO NOT Place:
- `package.json` in subdirectories
- `node_modules` in subdirectories
- Config files in subdirectories (except `shared/tsconfig.json`)
- `.md` files in root (except README.md, BUILD.md, PRD.md)
- `.md` files in `backend/`, `frontend/`, or `shared/`

---

## Build Scripts (package.json)

All scripts run from root and reference root-level configs:

```json
{
  "scripts": {
    "dev": "concurrently \"npm run dev:backend\" \"npm run dev:frontend\"",
    "dev:frontend": "vite --config vite.config.ts",
    "dev:backend": "cd backend && tsx watch src/index.ts",
    "build": "npm run build:shared && npm run build:backend && npm run build:frontend",
    "build:shared": "cd shared && tsc",
    "build:backend": "tsc -p tsconfig.backend.json",
    "build:frontend": "tsc -p tsconfig.frontend.json && vite build --config vite.config.ts && cd backend && mkdir -p public && cp -r ../frontend/dist/* public/",
    "start": "cd backend && node dist/index.js",
    "test:backend": "jest --config jest.config.js",
    "test:frontend": "cd frontend && vitest",
    "db:generate": "drizzle-kit generate --config drizzle.config.ts"
  }
}
```

---

## Config File Paths (All Relative to Root)

### TypeScript Configs
- `tsconfig.backend.json` - `baseUrl: "./backend"`, `outDir: "./backend/dist"`
- `tsconfig.frontend.json` - `baseUrl: "./frontend"`, includes `frontend/src`
- `tsconfig.node.json` - Node config

### Build Tool Configs
- `vite.config.ts` - `root: './frontend'`, `outDir: './frontend/dist'`
- `drizzle.config.ts` - `schema: './backend/drizzle/schema.ts'`
- `jest.config.js` - `roots: ['<rootDir>/backend']`
- `tailwind.config.js` - `content: ['./index.html', './frontend/src/**/*.{js,ts,jsx,tsx}']`

---

## Import Path Aliases

### Backend
- `@/*` → `./backend/src/*`
- `@sos/shared` → `./shared/src`

### Frontend
- `@/*` → `./frontend/src/*`
- `@sos/shared` → `./shared/src`

---

## Module Resolution

### How It Works
1. **Node.js** resolves packages from `root/node_modules/` (walks up directory tree)
2. **TypeScript** uses path aliases configured in `tsconfig.*.json`
3. **Build tools** (Vite, Jest) use root-installed packages from `root/node_modules/.bin/`

### Why It Works
- Single `node_modules` at root
- All packages installed once
- Node.js module resolution automatically finds root `node_modules`
- TypeScript path aliases handle source code imports

---

## Render Deployment

### render.yaml Configuration
- Builds from root (no `rootDir` specified)
- `buildCommand: npm ci --legacy-peer-deps --no-audit --no-fund && npm run build`
- References all root-level config files in `buildFilter`

---

## When Adding New Files

### New Dependencies
- ✅ Add to `root/package.json`
- ❌ Do NOT create new `package.json` files

### New Config Files
- ✅ Create at root
- ✅ Reference paths relative to root
- ❌ Do NOT create in subdirectories

### New Documentation
- ✅ Create in `docs/` directory
- ❌ Do NOT create in root (except README.md, BUILD.md, PRD.md)
- ❌ Do NOT create in `backend/`, `frontend/`, or `shared/`

### New Test Files
- ✅ Create at root (for standalone test scripts)
- ✅ Or in `backend/src/__tests__/` (for unit tests)
- ✅ Or in `frontend/src/__tests__/` (for unit tests)

---

## Verification Checklist

Before committing changes, verify:

- [ ] No new `package.json` files created in subdirectories
- [ ] No new `node_modules` directories created
- [ ] All config files remain at root
- [ ] New `.md` files created in `docs/` (not root)
- [ ] Build scripts reference root-level configs
- [ ] Import paths use correct aliases (`@/*`, `@sos/shared`)

---

## Common Mistakes to Avoid

### ❌ DON'T:
1. Run `npm install` in `backend/` or `frontend/` subdirectories
2. Create `package.json` in subdirectories
3. Create config files in subdirectories
4. Create `.md` files in root (except the 3 main docs)
5. Create `node_modules` in subdirectories
6. Move config files to subdirectories

### ✅ DO:
1. Always run `npm install` from root
2. Add dependencies to `root/package.json`
3. Create config files at root
4. Create `.md` files in `docs/`
5. Keep all packages in `root/node_modules/`
6. Reference root-level configs in scripts

---

## Maintenance Notes

### If You See:
- `package.json` in subdirectories → **DELETE IT**
- `node_modules` in subdirectories → **DELETE IT**
- Config files in subdirectories → **MOVE TO ROOT**
- `.md` files in root (except README.md, BUILD.md, PRD.md) → **MOVE TO docs/**

### Always Remember:
- **Single root package.json** - All dependencies here
- **Single root node_modules** - All packages here
- **All configs at root** - Reference paths from root
- **All docs in docs/** - Except 3 main docs at root

---

## Quick Reference

| Item | Location | Notes |
|------|----------|-------|
| Dependencies | `root/package.json` | Single source of truth |
| Node Modules | `root/node_modules/` | Only one should exist |
| Config Files | `root/*.config.*` | All at root |
| TypeScript Configs | `root/tsconfig.*.json` | All at root |
| Main Docs | `root/README.md`, `BUILD.md`, `PRD.md` | Only 3 at root |
| Other Docs | `docs/*.md` | All other documentation |
| Backend Code | `backend/src/` | Source code only |
| Frontend Code | `frontend/src/` | Source code only |
| Shared Code | `shared/src/` | Shared code only |

---

## Conclusion

**This structure is the official architecture. All future updates MUST maintain this structure.**

**Key Principles:**
1. Single root `package.json`
2. Single root `node_modules`
3. All configs at root
4. All docs in `docs/` (except 3 main docs)
5. Source code only in subdirectories

**When in doubt, refer to this document.**

