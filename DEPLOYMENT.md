# Deployment Guide

This document explains how to build and deploy the client and server
applications.

## Project Structure

This is a monorepo with two separate packages:

```
node-vite-react-hono/
├── client/           # React + Vite frontend
│   ├── src/
│   ├── build/        # Production build output
│   ├── package.json  # Frontend dependencies
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── eslint.config.js
├── server/           # Hono backend
│   ├── src/
│   ├── build/        # Production build output
│   ├── package.json  # Backend dependencies
│   ├── tsconfig.json
│   └── eslint.config.js
└── package.json      # Root workspace configuration
```

Each package has its own dependencies, configs, and build outputs. This
separation makes deployment simpler and more secure.

## Installation

Install all dependencies for both packages (run from the repository root):

```bash
# Install all workspace dependencies from the root
npm install --workspaces
```

Running `npm install` from the root will also work, but `--workspaces` makes the intent explicit and is useful in CI.

## Development

Run both client and server in development mode:

```bash
npm run dev
```

Or run them individually:

```bash
npm run client:dev  # Frontend only (port 3000)
npm run server:dev  # Backend only (port 8000)
```

## Building for Production

Build both client and server:

```bash
npm run build
```

Or build individually:

```bash
npm run client:build  # Builds to client/build/
npm run server:build  # Builds to server/build/
```

## Deployment Options

### Option 1: Single Server Deployment (Recommended for Small Teams)

Deploy both frontend and backend on the same server.

1. Build both applications:

   ```bash
   npm run build
   ```

2. Copy the entire project to your server

3. On the server, install production dependencies only:

   ```bash
   npm install --production
   ```

4. Serve the static frontend using nginx or another web server pointing to
   `client/build/`

5. Run the backend:

   ```bash
   npm run server:start
   ```

6. Configure nginx to proxy API requests to the backend (port 8000) and serve
   static files from `client/build/`

Example nginx configuration:

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    # Serve static frontend files
    location / {
        root /path/to/node-vite-react-hono/client/build;
        try_files $uri $uri/ /index.html;
    }

    # Proxy API requests to backend
    location /api/ {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Option 2: Separate Deployments

Deploy frontend and backend separately (e.g., Vercel for frontend, Railway for
backend).

#### Deploying the Backend

1. Navigate to server directory:

   ```bash
   cd server
   ```

2. The server folder is self-contained with its own `package.json` and
   dependencies

3. Deploy just the `server/` folder to your Node.js hosting provider:
   - Railway
   - Render
   - DigitalOcean App Platform
   - AWS EC2 / Elastic Beanstalk

4. Make sure the hosting service runs:

   ```bash
   npm install
   npm run build
   npm start
   ```

5. Note the deployed backend URL (e.g., `https://api.yourdomain.com`)

#### Deploying the Frontend

1. Update `client/.env.production` with your backend URL:

   ```
   VITE_API_DOMAIN=https://api.yourdomain.com
   ```

2. The client folder is self-contained with its own `package.json`

3. Deploy just the `client/` folder to your static hosting provider:
   - Vercel
   - Netlify
   - Cloudflare Pages
   - AWS S3 + CloudFront

4. Build command: `npm run build`
5. Output directory: `build`

### Option 3: Docker Deployment

Create a `Dockerfile` in the server directory:

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy server files
COPY package*.json ./
COPY tsconfig.json ./
COPY src ./src

# Install dependencies and build
RUN npm install
RUN npm run build

# Remove dev dependencies
RUN npm prune --production

EXPOSE 8000

CMD ["npm", "start"]
```

Build and run:

```bash
cd server
docker build -t my-app-server .
docker run -p 8000:8000 my-app-server
```

Alternatively, use Docker Compose to build and run client and server together. Example `docker-compose.yml` (place at repository root):

```yaml
version: "3.8"
services:
  server:
    build: ./server
    ports:
      - "8000:8000"
    environment:
      - NODE_ENV=production
  client:
    build:
      context: ./client
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - VITE_API_DOMAIN=http://localhost:8000
    depends_on:
      - server
```

Notes:

- The client Dockerfile should serve static files or run a static server; adjust the `client` service accordingly for production (e.g., use nginx and point to `client/build/`).
- In many deployments you will build the client once (`npm run build`) and serve the static output from a small web server or CDN, rather than running the Vite dev server in production.

For the client, most static hosting providers support automatic deployment from
Git repositories.

## Environment Variables

### Client

Create `.env` files in the `client/` directory:

- `.env.development` - for local development
- `.env.production` - for production builds

Example:

```env
VITE_API_DOMAIN=http://localhost:8000
```

### Server

Create `.env` file in the `server/` directory:

```env
PORT=8000
NODE_ENV=production
DATABASE_URL=your_database_url
```

## Production Checklist

Before deploying to production:

- [ ] Set appropriate environment variables
- [ ] Configure CORS in server to allow frontend domain
- [ ] Set up proper database connection
- [ ] Configure logging and error tracking
- [ ] Set up SSL certificates (HTTPS)
- [ ] Configure rate limiting and security headers
- [ ] Set up monitoring and health checks
- [ ] Configure automatic restarts (PM2, systemd, or container orchestration)

## Process Management with PM2 (Optional)

For production servers, use PM2 to manage the backend process:

```bash
npm install -g pm2
cd server
pm2 start npm --name "api-server" -- start
pm2 save
pm2 startup
```

## Troubleshooting

### Build Failures

If you get TypeScript errors during build:

```bash
# Clean and rebuild
rm -rf node_modules package-lock.json client/node_modules server/node_modules
npm install
npm run build
```

### Port Already in Use

If ports 3000 or 8000 are already in use:

- Change the port in `client/vite.config.ts` (line 16)
- Change the port in `server/src/main.ts` (line 24)

### Import Type Errors

The client imports types from the server using `@server/*` path alias. This is
only for TypeScript type checking and doesn't include server code in the client
bundle. If you see import errors:

- Ensure both packages are installed
- Check that `client/tsconfig.json` has the correct path mapping
- The server code is never bundled into the client, only types are used

## Maintenance

Keep dependencies updated:

```bash
# Check for updates
npm outdated --workspaces

# Update dependencies
npm update --workspaces
```

Run linting:

```bash
npm run lint
```

For questions or issues, refer to:

- Vite documentation: https://vite.dev/
- Hono documentation: https://hono.dev/
- React documentation: https://react.dev/
