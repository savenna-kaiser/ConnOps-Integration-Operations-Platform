# ConnOps — IT Operations Platform

> A full-stack internal IT operations platform that centralizes administrative workflows across Active Directory, Citrix, Asset Management and IT Service Management into a single, secure and auditable web application.

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![Express](https://img.shields.io/badge/Express-Backend-000000?logo=express&logoColor=white)](https://expressjs.com)
[![PowerShell](https://img.shields.io/badge/PowerShell-5.1+-5391FE?logo=powershell&logoColor=white)](https://learn.microsoft.com/powershell/)
[![SQLite](https://img.shields.io/badge/SQLite-Audit_Log-003B57?logo=sqlite&logoColor=white)](https://sqlite.org)

---

# Overview

Enterprise IT administration often requires administrators to switch constantly between multiple management tools.

A typical workflow may involve Active Directory, Exchange, Citrix, inventory systems, ITSM software and numerous PowerShell scripts—each with its own interface, permission model and operational workflow.

ConnOps was created to reduce this operational friction.

Instead of replacing existing enterprise systems, ConnOps provides a unified operational layer that connects them through a consistent web interface, centralized authorization, structured audit logging and reusable business workflows.

> **Integrate existing systems instead of replacing them.**

This architectural principle guides every design decision within the project.

---

# Why ConnOps?

Daily administration should not require administrators to constantly change context between unrelated tools.

Typical operational challenges include:

- repetitive manual administration
- inconsistent workflows across systems
- duplicated information
- missing audit trails
- fragmented permission management
- excessive context switching
- limited automation possibilities

ConnOps addresses these problems by centralizing operational workflows while allowing each integrated system to remain the authoritative source for its own data.

The platform focuses on simplifying day-to-day administration rather than replacing mature enterprise infrastructure.

---

# Core Features

## Identity Management

- Active Directory user search
- User administration
- Password resets
- Account unlock
- Account enable / disable
- Group membership management

---

## Computer Management

- Active Directory computer search
- Computer enable / disable
- Integrated inventory information
- Device lifecycle management

---

## Operations

- Citrix session visibility
- QR-code supported asset workflows
- Operational reporting
- Health monitoring
- TopDesk workflow integration

---

## Platform Services

- Session-based authentication
- Role-Based Access Control (RBAC)
- Centralized audit logging
- REST API
- PDF document generation
- Modular integration architecture

---

# Architecture

ConnOps follows a layered architecture that separates presentation, business logic, integrations and infrastructure.

```text
                 React Frontend
                        │
                        ▼
                REST API (Express)
                        │
                        ▼
                 Business Layer
                        │
       ┌────────────────┼────────────────┐
       ▼                ▼                ▼
 Active Directory   Docusnap        TopDesk
       │
       ▼
 PowerShell Worker
```

The API layer intentionally contains no business logic.

Its responsibilities are limited to:

- receiving requests
- authentication
- authorization
- request validation
- delegation to the Business Layer
- returning responses

Business rules remain independent from HTTP routing, allowing workflows to evolve without affecting the public API.

---

# Design Principles

Several architectural principles shape the development of ConnOps.

## Integrate instead of replace

Existing enterprise systems remain responsible for their own data.

ConnOps coordinates workflows between those systems instead of duplicating their functionality.

---

## Separation of Responsibilities

Presentation, API, business logic, integrations and infrastructure each have clearly defined responsibilities.

This minimizes coupling and keeps the platform maintainable as it grows.

---

## Security by Design

Authentication, authorization, validation and audit logging are architectural concerns rather than optional additions.

Administrative actions should always be attributable and reproducible.

---

## Documentation First

Architecture documentation is treated as part of the product.

Design decisions, implementation patterns, security concepts and API contracts are maintained alongside the source code to support long-term maintainability.

---

# System Integrations

ConnOps currently integrates with the following enterprise systems.

| System | Purpose |
|---------|---------|
| **Microsoft Active Directory** | Identity management and directory administration |
| **Microsoft Exchange** | Internal mailbox operations as part of higher-level workflows |
| **Citrix** | Session visibility and operational administration |
| **Docusnap** | Asset inventory and device information |
| **TopDesk** | IT Service Management integration |
| **SQLite** | Central audit log storage |

Every integration follows the same architectural philosophy:

External systems remain authoritative.

ConnOps orchestrates workflows between them.

---

# Security

Security is implemented as a cross-cutting architectural concern.

Key security mechanisms include:

- Session-based authentication
- Server-side Role-Based Access Control
- Permission-based authorization
- Request validation
- Rate limiting
- Security headers
- Structured audit logging

Permissions are evaluated on every protected request.

No authorization decisions are delegated to the frontend.

---

# Audit & Observability

Administrative operations are fully traceable.

Every relevant action records structured audit information including:

- actor
- target
- operation
- timestamp
- execution result
- contextual metadata

The audit log provides the foundation for operational reporting, troubleshooting, accountability and future analytics.

Observability is treated as an integral part of the platform rather than a separate subsystem.

---

# Documentation

ConnOps follows a **documentation-first** approach.

The architecture, security model and technical decisions are documented alongside the source code. Documentation is considered part of the product and evolves together with the implementation.

| Document | Purpose |
|----------|---------|
| **PRODUCT.md** | Product vision, scope and functional goals |
| **ROADMAP.md** | Planned features and long-term development roadmap |
| **ARCHITECTURE.md** | System architecture and component responsibilities |
| **TECHNICAL.md** | Technical implementation details |
| **API.md** | Public REST API documentation |
| **SECURITY.md** | Authentication, authorization and security concepts |
| **PATTERNS.md** | Reusable architectural and implementation patterns |
| **DECISIONS.md** | Architectural Decision Records (ADRs) |
| **DOCUMENTATION.md** | Documentation standards and document hierarchy |
| **GLOSSARY.md** | Shared terminology used throughout the project |

The documentation is intentionally separated into focused documents rather than one large design specification. This keeps responsibilities clear and allows each document to evolve independently.

---

# Tech Stack

| Area | Technology |
|------|------------|
| Frontend | React 18, Vite, Tailwind CSS |
| Backend | Node.js, Express |
| Authentication | Session-based authentication |
| Authorization | Role-Based Access Control (RBAC) |
| Directory Services | Microsoft Active Directory |
| Automation | PowerShell |
| Asset Management | Docusnap |
| ITSM | TopDesk |
| Virtualization | Citrix |
| Audit Storage | SQLite |
| Process Data | PostgreSQL *(planned)* |

The technology choices intentionally favor operational simplicity and long-term maintainability over unnecessary complexity.

---

# Repository Structure

```text
ConnOps/
│
├── backend/
│   ├── actions/
│   ├── middleware/
│   ├── routes/
│   ├── services/
│   ├── workers/
│   └── data/
│
├── frontend/
│   ├── src/
│   └── public/
│
├── docs/
│   ├── PRODUCT.md
│   ├── ROADMAP.md
│   ├── ARCHITECTURE.md
│   ├── TECHNICAL.md
│   ├── API.md
│   ├── SECURITY.md
│   ├── PATTERNS.md
│   ├── DECISIONS.md
│   ├── DOCUMENTATION.md
│   └── GLOSSARY.md
│
└── README.md
```

---

# Getting Started

## Requirements

- Node.js 18+
- npm
- Windows
- PowerShell 5.1 or newer
- Active Directory environment

---

## Backend

```bash
cd backend
npm install
npm run dev
```

---

## Frontend

```bash
cd frontend
npm install
npm run dev
```

---

> **Note**
>
> ConnOps is designed for on-premises enterprise environments.
> Several features require connectivity to systems such as Active Directory, Citrix, Docusnap and TopDesk and therefore cannot be fully demonstrated in isolation.

---

# Project Status

ConnOps is under active development.

The current focus is on completing the platform architecture, refining existing workflows and expanding automation capabilities.

Implemented functionality already covers the core administrative workflows for user and computer management, while additional enterprise integrations continue to evolve.

Architectural consistency, maintainability and operational safety take precedence over rapid feature growth.

---

# Roadmap

Current priorities include:

- TopDesk workflow automation
- Organization management
- Reporting improvements
- Health monitoring
- Administrative configuration
- Asset lifecycle management
- Automated onboarding and offboarding
- Additional enterprise integrations

Future development is driven by operational requirements rather than technology trends.

Every feature should reduce manual effort, improve traceability or simplify recurring administrative tasks.

---

# Guiding Philosophy

ConnOps is built around a small number of long-term architectural principles.

- Existing enterprise systems remain authoritative.
- Business logic is separated from transport and presentation.
- Security is enforced on the server.
- Administrative actions must be traceable.
- Documentation is part of the product.
- Automation should simplify operations without hiding complexity.
- New integrations should extend the platform without changing its architecture.

These principles are intended to keep the platform maintainable as it grows.

---

# Contributing

At the current stage, ConnOps is maintained as a private project.

Contribution guidelines may be published once the platform architecture has stabilized.

---

# License

This repository is currently **not licensed for public reuse**.

All rights reserved.

---

# Closing Thoughts

ConnOps is not intended to replace established enterprise systems.

Instead, it provides a consistent operational layer that connects them through clearly defined APIs, reusable workflows and documented architectural principles.

The project continues to evolve alongside operational requirements, with one overarching objective:

> **Reduce operational complexity without sacrificing security, traceability or maintainability.**
