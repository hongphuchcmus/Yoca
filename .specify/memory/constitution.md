<!--
Sync Impact Report:
Version: 0.0.0 → 1.0.0
Rationale: Initial constitution establishing foundational governance for the Yoca project

Modified principles: N/A (Initial creation)

Added sections:
  - Core Principles (7 principles focused on code quality, testing, UX, and performance)
  - Performance Standards (Frontend, Backend, and Monitoring Requirements)
  - Development Workflow (Code Quality Gates, Review Standards, Branch Strategy)
  - Governance (Amendment Process, Versioning Rules, Compliance Enforcement)

Removed sections: N/A

Templates requiring updates:
  ✅ plan-template.md - Updated with Yoca-specific Technical Context and Constitution Check checklist
  ✅ spec-template.md - No changes required; user scenarios align with testing principles
  ✅ tasks-template.md - No changes required; test-first approach and story independence supported

Follow-up TODOs: None - All placeholders filled, all templates validated
-->

# Yoca Project Constitution

## Core Principles

### I. Type Safety First (NON-NEGOTIABLE)

TypeScript strict mode MUST be enabled across all codebases (frontend and backend). Every function, parameter, and return value MUST have explicit types. The `any` type is PROHIBITED except when interfacing with untyped third-party libraries, and even then MUST be wrapped with proper type guards or assertions.

**Rationale**: Type safety catches errors at compile time, provides superior IDE support, enables confident refactoring, and serves as living documentation. In a monorepo with shared types between client and server, this principle ensures end-to-end type safety and prevents runtime type mismatches.

**Requirements**:

- All `.ts` and `.tsx` files MUST pass TypeScript strict mode checks
- Shared types between client and server MUST be defined in appropriate locations with clear import paths
- Generic types MUST be used appropriately to maintain type safety in reusable components and services
- Type assertions MUST be justified with inline comments explaining why runtime type checking isn't possible

### II. Service Layer Abstraction

Business logic MUST be separated from presentation (frontend) and routing (backend) layers. Services MUST be independently testable, accept typed parameters, and return typed results. External API calls MUST be centralized in dedicated service classes with standardized error handling.

**Rationale**: Service layer abstraction enables unit testing without UI or HTTP dependencies, allows reuse of business logic across different interfaces, centralizes error handling patterns, and makes the codebase more maintainable as complexity grows.

**Requirements**:

- Backend services MUST be in `server/src/services/` directory
- Frontend services MUST be in `client/src/services/` or `client/src/api/` directory
- Services MUST NOT directly manipulate DOM or HTTP response objects
- External API integration MUST use a consistent error handling pattern (see ApiService pattern)
- Services MUST export well-typed interfaces for their public methods

### III. Validation at Boundaries (NON-NEGOTIABLE)

All data entering the system—API requests, user input, external API responses—MUST be validated using schema validators (Zod for TypeScript). Raw data MUST NOT propagate into business logic without validation. Validation errors MUST provide actionable feedback to users or calling systems.

**Rationale**: Validation at system boundaries prevents invalid data from corrupting application state, provides clear contract definitions, enables better error messages, and protects against malicious input. Schema-based validation ensures consistency between runtime checks and TypeScript types.

**Requirements**:

- All API endpoints MUST validate request parameters using Zod schemas
- All form inputs MUST be validated before submission
- External API responses MUST be validated before transformation
- Validation schemas MUST be co-located with the code that uses them
- Validation errors MUST return structured, human-readable messages

### IV. Component Modularity

UI components MUST be self-contained, reusable, and follow single responsibility principle. Components MUST accept typed props, avoid direct API calls (use services), and maintain minimal internal state. Shared components MUST be documented with usage examples.

**Rationale**: Modular components are easier to test, reuse, and maintain. Separating data fetching from presentation makes components more flexible and reduces coupling. Documentation ensures consistent usage patterns across the team.

**Requirements**:

- Components MUST be organized by feature or shared status (`components/`, `pages/`, `layouts/`)
- Props MUST be typed using TypeScript interfaces or types
- Components MUST NOT contain business logic beyond UI state management
- Shared components MUST include JSDoc comments with usage examples
- Component files SHOULD be co-located with their styles (SCSS modules preferred)

### V. Performance Budgets

Frontend bundle size MUST NOT exceed 500KB gzipped for initial load. API endpoints MUST respond within 200ms (p95) for read operations and 500ms (p95) for write operations. Database queries MUST be monitored and optimized to prevent N+1 queries. Large lists MUST implement pagination or virtualization.

**Rationale**: Performance directly impacts user experience and adoption. Setting measurable budgets prevents gradual degradation. Monitoring ensures issues are caught early before they impact users.

**Requirements**:

- Run `npm run build` and check bundle analyzer output before merging features that add significant dependencies
- API response times MUST be logged and monitored in production
- Database queries MUST use indexes on commonly filtered/joined columns
- Lists exceeding 50 items MUST implement pagination, infinite scroll, or virtual scrolling
- Images MUST be optimized and served in appropriate formats (WebP with fallbacks)

### VI. Error Handling & Observability

Errors MUST be caught, logged with context, and transformed into user-friendly messages. Backend errors MUST include error codes and structured details. Frontend MUST handle loading, error, and empty states explicitly. Console logs MUST be structured (JSON in production) and include correlation IDs for request tracing.

**Rationale**: Comprehensive error handling improves debugging, user experience, and system reliability. Structured logging with correlation IDs enables tracing requests across client, server, and external services.

**Requirements**:

- All async operations MUST handle both success and error cases
- Backend MUST return consistent error response structure: `{ error: string, message?: string, details?: unknown }`
- Frontend MUST display user-friendly error messages, not raw error objects
- All external API calls MUST be wrapped with error handling that logs context
- Production logs MUST be JSON-formatted with timestamp, level, message, and context fields

### VII. Testing Strategy

Unit tests are RECOMMENDED for complex business logic and utility functions. Integration tests are REQUIRED for API endpoints and critical user flows. E2E tests are RECOMMENDED for critical user journeys. All tests MUST be automated and run in CI/CD pipeline. Test coverage MUST be tracked but NOT used as the sole quality metric.

**Rationale**: Different test types serve different purposes. Unit tests catch logic errors early. Integration tests verify component interactions. E2E tests validate user workflows. Automation ensures consistent quality. Coverage is informative but doesn't guarantee meaningful tests.

**Requirements**:

- Critical API endpoints MUST have integration tests verifying request/response contracts
- Complex business logic functions SHOULD have unit tests with edge case coverage
- Authentication, authorization, and payment flows MUST have automated tests
- Tests MUST be runnable locally without external dependencies (use mocks/stubs)
- Failing tests MUST block merges to main branch

## Performance Standards

### Frontend Performance

- **Time to Interactive (TTI)**: < 3 seconds on 3G connection
- **Largest Contentful Paint (LCP)**: < 2.5 seconds
- **First Input Delay (FID)**: < 100ms
- **Cumulative Layout Shift (CLS)**: < 0.1
- **Bundle Size**: Initial load < 500KB gzipped, per-route chunks < 200KB gzipped

### Backend Performance

- **API Response Time**: p50 < 100ms, p95 < 200ms (read), p95 < 500ms (write)
- **Database Query Time**: p95 < 50ms for single-record queries, p95 < 200ms for complex queries
- **Memory Usage**: < 512MB per server instance under normal load
- **CPU Usage**: < 70% average, < 90% peak
- **Throughput**: Support 1000 concurrent users per instance

### Monitoring Requirements

- All performance metrics MUST be tracked in production environment
- Degradation beyond thresholds MUST trigger alerts
- Performance regression MUST be caught in CI/CD through automated performance testing
- Regular performance audits MUST be conducted quarterly

## Development Workflow

### Code Quality Gates

**Pre-Commit** (Automated):

- Linting MUST pass (ESLint with project configuration)
- Type checking MUST pass (TypeScript strict mode)
- Formatting MUST be consistent (Prettier)
- Unit tests MUST pass if present

**Pre-Merge** (Automated + Review):

- All pre-commit checks MUST pass
- Integration tests MUST pass
- No decrease in type safety (no new `any` types without justification)
- Code review approval from at least one other developer
- Changes MUST align with relevant principles in this constitution

**Pre-Deployment** (Automated):

- All tests MUST pass (unit, integration, E2E)
- Bundle size MUST be within budget
- No critical security vulnerabilities in dependencies
- Performance tests MUST not show regression
- Manual QA approval for major features

### Code Review Standards

**Reviewers MUST verify**:

1. Code follows architectural patterns established in codebase
2. No violation of constitution principles without documented justification
3. Error handling is comprehensive and user-friendly
4. Types are explicit and avoid `any`
5. Tests cover critical paths and edge cases
6. Performance implications are considered for data-heavy operations
7. Security implications are considered for user input and external data
8. Documentation is updated for public APIs or complex logic

**Review turnaround**: < 24 hours for normal PRs, < 4 hours for hotfixes

### Branch Strategy

- **Main branch**: Always deployable, protected, requires PR + review
- **Feature branches**: Named `feature/###-description` or `fix/###-description`
- **Release branches**: Created from main for version releases
- **Hotfix branches**: Fast-tracked fixes for production issues

## Governance

This constitution supersedes all other development practices and guidelines. It represents the agreed-upon foundation for maintaining code quality, user experience, and system performance across the Yoca project.

**Amendment Process**:

1. Proposed changes MUST be documented in a PR to this constitution file
2. Proposed changes MUST include rationale explaining why the amendment is needed
3. Proposed changes MUST be reviewed by at least two senior developers
4. Approved amendments MUST increment version number (see versioning rules below)
5. Major amendments MUST include a migration plan for existing code

**Versioning Rules**:

- **MAJOR** (X.0.0): Backward-incompatible principle changes, principle removals, or redefined requirements that require significant codebase refactoring
- **MINOR** (0.X.0): New principles added, existing principles materially expanded, or new sections added
- **PATCH** (0.0.X): Clarifications, wording improvements, typo fixes, or non-semantic refinements

**Compliance Enforcement**:

- All pull requests MUST verify compliance with applicable principles
- Violations MUST be justified in PR description with "Complexity Tracking" section explaining why deviation is necessary and what simpler alternatives were considered
- Constitution checks MUST be included in implementation plans (see plan-template.md)
- Regular audits SHOULD be conducted to identify constitution drift in existing code

**Continuous Improvement**:

- This constitution is a living document and SHOULD evolve with the project
- Team retrospectives SHOULD discuss whether constitution principles are serving the project well
- Feedback from development experience SHOULD inform amendments
- When patterns emerge that would benefit from standardization, consider adding them to the constitution

**Version**: 1.0.0 | **Ratified**: 2025-11-22 | **Last Amended**: 2025-11-22
