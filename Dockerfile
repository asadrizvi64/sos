# Multi-stage Dockerfile for SynthralOS Automation Platform
# Optimized for Sliplane deployment

# Stage 1: Build stage
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./
COPY shared/package.json ./shared/

# Install dependencies
RUN npm ci --legacy-peer-deps --no-audit --no-fund

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Verify backend/dist/index.js exists
RUN if [ ! -f backend/dist/index.js ]; then \
      echo "ERROR: backend/dist/index.js not found!"; \
      echo "Contents of backend/dist/:"; \
      ls -la backend/dist/ || true; \
      echo "Contents of backend/dist/src/ (if exists):"; \
      ls -la backend/dist/src/ 2>/dev/null || echo "backend/dist/src/ does not exist"; \
      exit 1; \
    else \
      echo "✓ backend/dist/index.js found"; \
      ls -lh backend/dist/index.js; \
    fi

# Verify frontend build exists
RUN if [ ! -d backend/public ] || [ -z "$(ls -A backend/public 2>/dev/null)" ]; then \
      echo "ERROR: backend/public directory is empty or missing!"; \
      ls -la backend/ 2>&1; \
      exit 1; \
    else \
      echo "✓ Frontend build found in backend/public"; \
      ls -lh backend/public/ | head -10; \
    fi

# Stage 2: Production stage
FROM node:20-alpine AS production

# Set working directory
WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy package files
COPY package*.json ./
COPY shared/package.json ./shared/

# Install production dependencies only
RUN npm ci --legacy-peer-deps --no-audit --no-fund --only=production && \
    npm cache clean --force

# Copy built application from builder stage
COPY --from=builder --chown=nodejs:nodejs /app/backend/dist ./backend/dist
COPY --from=builder --chown=nodejs:nodejs /app/backend/public ./backend/public
COPY --from=builder --chown=nodejs:nodejs /app/shared/dist ./shared/dist
COPY --from=builder --chown=nodejs:nodejs /app/backend/drizzle ./backend/drizzle

# Copy any necessary config files
COPY --chown=nodejs:nodejs drizzle.config.ts ./
COPY --chown=nodejs:nodejs tsconfig.*.json ./

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Set environment variables
ENV NODE_ENV=production
ENV PORT=4000
ENV HOST=0.0.0.0

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "backend/dist/index.js"]

