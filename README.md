# Node + Vite + React + Hono Monorepo

A full-stack TypeScript monorepo template with React frontend (Vite) and Hono
backend (Node.js).

## Project Structure

This is a monorepo using npm workspaces with two independent packages:

```
node-vite-react-hono/
├── client/              # Frontend (React + Vite + TypeScript)
│   ├── src/
│   ├── build/          # Production build output
│   ├── package.json    # Frontend dependencies
│   ├── tsconfig.json   # TypeScript config for client
│   ├── vite.config.ts  # Vite configuration
│   └── eslint.config.js
├── server/             # Backend (Hono + Node.js + TypeScript)
│   ├── src/
│   ├── build/          # Production build output
│   ├── package.json    # Backend dependencies
│   ├── tsconfig.json   # TypeScript config for server
│   └── eslint.config.js
├── package.json        # Root workspace configuration
└── DEPLOYMENT.md       # Detailed deployment guide
```

## Tech Stack

**Frontend (client/):**

- React 19
- TypeScript
- Vite 7
- React Router 7
- Carbon Design System
- SCSS

**Backend (server/):**

- Hono 4
- Node.js
- TypeScript
- @hono/node-server

## Getting Started

### Prerequisites

- Node.js 20+
- npm 10+

### Installation

Install dependencies for all workspaces:

```bash
npm install
```

### Development

Run both frontend and backend in development mode:

```bash
npm run dev
```

The frontend will run on `http://localhost:3000` and the backend on
`http://localhost:8000`.

You can also run them individually:

```bash
npm run client:dev  # Frontend only
npm run server:dev  # Backend only
```

## Available Scripts

### Root Level (Workspace Orchestration)

```bash
npm run dev          # Run both client and server in development
npm run build        # Build both client and server for production
npm run lint         # Lint both workspaces
npm run preview      # Preview production builds

# Individual workspace commands
npm run client:dev
npm run client:build
npm run client:preview
npm run server:dev
npm run server:build
npm run server:start
```

### Client Commands (cd client/)

```bash
npm run dev          # Start Vite dev server (port 3000)
npm run build        # Build for production
npm run preview      # Preview production build
npm run lint         # Run ESLint
```

### Server Commands (cd server/)

```bash
npm run dev          # Start server with tsx watch (port 8000)
npm run build        # Compile TypeScript to JavaScript
npm start            # Run compiled JavaScript
npm run lint         # Run ESLint
```

## Building for Production

Build both client and server:

```bash
npm run build
```

This will:

- Compile the server TypeScript to `server/build/`
- Build the client React app to `client/build/`

## Key Features

### Independent Package Management

Each workspace (client and server) has its own:

- `package.json` with specific dependencies
- `node_modules` directory
- TypeScript configuration
- ESLint configuration
- Build output directory

This separation provides:

- Smaller production bundles (only install what you need)
- Clear dependency boundaries
- Easier deployment (deploy client and server separately if needed)
- Better security (server dependencies don't end up in frontend)

### Type Safety Across Frontend and Backend

The client can import types from the server for end-to-end type safety:

```typescript
// client/src/api/main.ts
import type { Users } from "@server/routes/users.route";
```

This is configured via path aliases in `client/tsconfig.json` and only imports
types, not runtime code.

### Strict TypeScript

Both workspaces use strict TypeScript settings:

- `strict: true`
- `noUnusedLocals: true`
- `noUnusedParameters: true`
- `noFallthroughCasesInSwitch: true`

### Modern ESLint

Both workspaces use ESLint 9 with flat config format:

- Client: React-specific rules with hooks and refresh plugins
- Server: Node.js-specific rules

## Environment Variables

### Client

Create `.env` files in the `client/` directory:

```bash
# .env.development
VITE_API_DOMAIN=http://localhost:8000

# .env.production
VITE_API_DOMAIN=https://api.yourdomain.com
```

### Server

Create `.env` file in the `server/` directory:

```bash
PORT=8000
NODE_ENV=development
```

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions
including:

- Single server deployment
- Separate frontend/backend deployment
- Docker deployment
- Environment configuration
- Production checklist

## Adding New Dependencies

**For the frontend:**

```bash
npm install package-name --workspace=client
```

**For the backend:**

```bash
npm install package-name --workspace=server
```

**For both:**

```bash
npm install package-name --workspaces
```

## Project Organization Tips

### Client Structure

Organize your React code in `client/src/`:

- `components/` - Reusable UI components
- `pages/` - Page components (routes)
- `layouts/` - Layout components
- `api/` - API client setup and type imports
- `util/` - Utility functions

### Server Structure

Organize your backend code in `server/src/`:

- `routes/` - Route handlers grouped by resource
- `middleware/` - Custom middleware
- `services/` - Business logic
- `models/` - Data models/schemas
- `utils/` - Utility functions

## Troubleshooting

### Build fails with TypeScript errors

Make sure both workspaces are installed:

```bash
rm -rf node_modules package-lock.json client/node_modules server/node_modules
npm install
```

### Ports already in use

Change the ports in:

- Frontend: `client/vite.config.ts` (default: 3000)
- Backend: `server/src/main.ts` (default: 8000)

### Type imports from server not working

Verify the path alias in `client/tsconfig.json` points to `../server/src/*`.

## Resources

- [Vite Documentation](https://vite.dev/)
- [React Documentation](https://react.dev/)
- [Hono Documentation](https://hono.dev/)
- [TypeScript Documentation](https://www.typescriptlang.org/)
- [npm Workspaces](https://docs.npmjs.com/cli/v10/using-npm/workspaces)

## License

MIT
