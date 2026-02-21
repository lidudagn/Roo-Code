# Shared Agent Knowledge Base

## Project Context
- Repository: Roo-Code governance system
- Active intents: INT-001 (Weather API), GOV-TEST-001 (Governance verification)

## Lessons Learned

### 2026-02-21: Path Resolution
- Always use projectRoot = workspaceRoot.replace(/\/src$/, '') for file paths
- .orchestration/ must be at project root, not in /src/

### 2026-02-21: Scope Enforcement
- owned_scope patterns use glob syntax (e.g., "src/weather/**")
- Constitutional Gate protects .orchestration/, .env, node_modules/

### 2026-02-21: Phase 4 Setup
- Added optimistic locking to prevent concurrent file edits
- Created record_lesson tool for sharing knowledge
- CLAUDE.md serves as shared brain between agents

## Coding Standards
- All file operations must have active intent
- Always check scope before writing files
- Use TraceService for all file writes
- Always check file locks before editing

## Architecture Decisions
- Governance uses two-phase validation: Intent → Scope → Approval
- Traces stored in agent_trace.jsonl with content hashes

## Guidelines
- Record lessons when you encounter issues
- Check CLAUDE.md for known solutions before starting new tasks
### 2026-02-21: Locking
- Always check file locks
