# Migration Guide - Refactored Monorepo Structure

This document explains what changed in the refactor and what you need to do.

## What Changed?

The project was restructured from a mixed monorepo (all configs at root) to a
proper workspace monorepo with separate packages.

### Before (Old Structure)

```
node-vite-react-hono/
├── client/               # Frontend code
├── server/               # Backend code
├── package.json          # ALL dependencies mixed together
├── tsconfig.json         # Complex project references
├── tsconfig.client.json
├── tsconfig.server.json
├── tsconfig.base.lint.json
├── eslint.config.js      # React-focused config for everything
└── vite.config.ts        # At root
```

Problems with old structure:

- Server runtime included React and Vite dependencies
- Client bundle included Hono dependencies
- Complex TypeScript project references
- ESLint configured for React ran on server code
- Harder to deploy (couldn't just deploy client/ or server/ separately)

### After (New Structure)

```
node-vite-react-hono/
├── client/
│   ├── src/
│   ├── package.json      # ONLY frontend dependencies
│   ├── tsconfig.json     # Simple, standalone config
│   ├── eslint.config.js  # React-specific rules
│   ├── vite.config.ts    # Moved here
│   └── build/            # Output
├── server/
│   ├── src/
│   ├── package.json      # ONLY backend dependencies
│   ├── tsconfig.json     # Simple, standalone config
│   ├── eslint.config.js  # Node.js-specific rules
│   └── build/            # Output
└── package.json          # Workspace orchestration only
```

Benefits of new structure:

- Each package is independent and self-contained
- Smaller production bundles
- Clearer dependency boundaries
- Each package can be deployed separately
- Easier for beginners to understand
- Standard npm workspaces pattern

## Files Removed

These old config files were removed:

- `tsconfig.json` (old project references)
- `tsconfig.client.json`
- `tsconfig.client.app.json`
- `tsconfig.client.vite.json`
- `tsconfig.server.json`
- `tsconfig.base.lint.json`
- `eslint.config.js` (moved to client/ and server/)
- `vite.config.ts` (moved to client/)

## Files Added

New files:

- `client/package.json` - Frontend dependencies only
- `client/tsconfig.json` - Simplified TypeScript config
- `client/eslint.config.js` - React ESLint rules
- `client/vite.config.ts` - Moved from root
- `client/tsconfig.vite.json` - For Vite config file itself
- `server/package.json` - Backend dependencies only
- `server/tsconfig.json` - Simplified TypeScript config
- `server/eslint.config.js` - Node.js ESLint rules
- `DEPLOYMENT.md` - Comprehensive deployment guide
- `MIGRATION.md` - This file

## Files Modified

- `package.json` (root) - Now uses npm workspaces
- `README.md` - Updated with new structure explanation
- `.gitignore` - Added environment variable patterns
- `server/src/routes/*.ts` - Fixed unused parameter warnings

## What You Need to Do

### 1. Clean Installation (REQUIRED)

You MUST reinstall dependencies:

```bash
# Remove old dependencies
rm -rf node_modules package-lock.json

# Install with new workspace structure
npm install
```

This is required because the old `node_modules` had all dependencies mixed
together.

### 2. Update Your Scripts/Commands

If you have any scripts or CI/CD pipelines, update them:

**Old commands:**

```bash
npm run client:dev
npm run server:dev
```

**New commands (same, but now use workspaces):**

```bash
npm run client:dev
npm run server:dev
# or just
npm run dev  # runs both
```

### 3. Update IDE/Editor Settings (Optional)

If you use VS Code or other IDEs with TypeScript:

**Old:** TypeScript might have looked at root `tsconfig.json` **New:** Your IDE
should recognize the workspace structure automatically

For VS Code, the TypeScript language server will find both
`client/tsconfig.json` and `server/tsconfig.json` based on which file you're
editing.

### 4. Update Environment Variables (Important)

Create separate `.env` files:

**For client (`client/.env.development`):**

```env
VITE_API_DOMAIN=http://localhost:8000
```

**For server (`server/.env`):**

```env
PORT=8000
NODE_ENV=development
```

The old approach of having env files at root should be updated.

### 5. Update Deployment Process

If you've already deployed this project, see `DEPLOYMENT.md` for new deployment
instructions.

**Key change:** You can now deploy `client/` and `server/` completely
independently since each has its own `package.json`.

## Breaking Changes

### None for runtime behavior

The application works the same way. The refactor only changed:

- How dependencies are organized
- Where config files live
- Build commands (now use workspaces)

### For development workflow

- You must run `npm install` at the root (not in client/ or server/
  individually)
- Use workspace commands: `npm run dev --workspace=client` or the shortcuts in
  root `package.json`

## FAQ

**Q: Do I need to install dependencies separately in client/ and server/?** No!
Running `npm install` at the root installs everything. npm workspaces handles
it.

**Q: Can I still add dependencies like before?** Yes, but specify the workspace:

```bash
npm install package-name --workspace=client
npm install package-name --workspace=server
```

**Q: Why did you do this?** The old structure was clever but non-standard. This
new structure is the recommended way to structure npm workspace monorepos. It's
easier to understand, deploy, and maintain for teams without deep monorepo
experience.

**Q: Is this structure used by other projects?** Yes! This is the standard
pattern used by:

- Turborepo examples
- Nx monorepo workspaces
- Many open source projects on GitHub

**Q: Can I deploy frontend and backend separately now?** Yes! That's one of the
benefits. Each folder is self-contained:

- Deploy `client/` to Vercel/Netlify
- Deploy `server/` to Railway/Render Or deploy both together on a single server.

**Q: Will this affect performance?** No. Runtime performance is identical. Build
times might be slightly faster since TypeScript doesn't need project references
anymore.

**Q: Do I lose type safety between client and server?** No. The client can still
import types from server via the `@server/*` path alias in
`client/tsconfig.json`. This only imports types, not runtime code.

## Getting Help

If you encounter issues after the migration:

1. Make sure you ran `rm -rf node_modules package-lock.json && npm install`
2. Check that you're running commands from the root directory
3. Verify both `client/` and `server/` have their own `node_modules/` folders
   after install
4. See `README.md` and `DEPLOYMENT.md` for detailed documentation

## Rollback (If Needed)

If you need to rollback to the old structure, the changes are in git history.
However, the new structure is recommended for long-term maintainability.

## Summary

This refactor improves your project structure without changing how the
application works. After running `npm install`, everything should work the same
but be easier to understand, deploy, and maintain.

The structure now follows industry best practices for npm workspace monorepos,
making it easier for new team members to onboard and for you to find help online
when issues arise.
