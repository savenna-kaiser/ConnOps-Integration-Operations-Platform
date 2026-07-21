# ConnOps — IT Operations Platform

> A full-stack internal IT operations platform that centralizes Active Directory administration, asset management, Citrix session visibility, and operational workflows into a single, secure, and auditable web application.

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![Express](https://img.shields.io/badge/Express-Backend-000000?logo=express&logoColor=white)](https://expressjs.com)
[![PowerShell](https://img.shields.io/badge/PowerShell-5.1+-5391FE?logo=powershell&logoColor=white)](https://learn.microsoft.com/powershell/)
[![SQLite](https://img.shields.io/badge/SQLite-Audit_Log-003B57?logo=sqlite&logoColor=white)](https://sqlite.org)
[![License](https://img.shields.io/badge/License-Private-red)]()

---

# Table of Contents

- [Overview](#overview)
- [Why ConnOps?](#why-connops)
- [Core Features](#core-features)
- [Architecture](#architecture)
- [System Integrations](#system-integrations)
- [Security](#security)
- [Audit & Observability](#audit--observability)

---

# Overview

ConnOps is an internal IT operations platform developed to simplify and standardize administrative tasks across multiple enterprise systems.

Instead of switching between Active Directory consoles, PowerShell scripts, inventory tools, Citrix administration, and IT service management systems, administrators perform their daily work through a single web application with centralized authentication, authorization, auditing, and automation support.

The project follows a clear architectural principle:

> **Integrate existing enterprise systems instead of replacing them.**

ConnOps acts as the orchestration layer between established infrastructure components while keeping each external system responsible for its own data.

Current integrations include:

- Microsoft Active Directory
- Microsoft Exchange (internal integration)
- Citrix
- Docusnap
- TopDesk
- PDF document generation
- Centralized audit logging

---

# Why ConnOps?

Like many organizations, our IT department relied on several disconnected administration tools and numerous PowerShell scripts.

Typical workflows required administrators to switch continuously between different applications:

- Active Directory Users & Computers
- Exchange administration
- Citrix administration
- Asset management
- ITSM software
- Custom PowerShell scripts

This caused several operational problems:

- repetitive manual work
- inconsistent workflows
- duplicated information
- missing auditability
- difficult permission management
- high context switching
- limited automation possibilities

ConnOps was created to consolidate these workflows into one consistent platform.

Rather than introducing another isolated management tool, ConnOps provides a common operational layer that connects existing systems and enables future automation.

---

# Core Features

| Feature | Description |
|----------|-------------|
| **Active Directory User Management** | Search users, edit user information, enable/disable accounts, unlock users, reset passwords and manage group memberships. |
| **Computer Management** | Search Active Directory computer accounts and enable or disable computers. |
| **Citrix Integration** | Display active Citrix sessions for users and computers and perform administrative session actions. |
| **Asset Management** | Import Docusnap inventory data, display asset information and manage device lifecycle states. |
| **QR-Code Workflows** | Manage hardware status changes using QR-code based workflows. |
| **Audit Logging** | Record administrative operations with timestamps, actors, targets and execution results. |
| **Role Based Access Control** | Server-side permission model based on Active Directory groups. |
| **Organization Management** | Manage organizational structures that serve as the foundation for workflow automation. |
| **TopDesk Integration** | Foundation for automated processing of ITSM-driven operational workflows. |
| **Health Monitoring** | Central system health information for integrated components. |
| **Reporting** | Generate operational reports from collected audit information. |

The platform is designed as a modular system where additional integrations can be added without changing the existing application architecture.

---

# Architecture

ConnOps follows a layered architecture with clearly separated responsibilities.

```
                React Frontend
                      │
                      ▼
              REST API (Express)
                      │
                      ▼
              Business Layer
                      │
          ┌───────────┼───────────┐
          ▼           ▼           ▼
   Active Directory  Citrix   Docusnap
          │
          ▼
   PowerShell Worker
```

The API layer is intentionally kept thin.

Its responsibilities are limited to:

- receiving requests
- validating input
- authentication
- authorization
- delegating work to the Business Layer
- returning responses

Business logic is implemented outside the routing layer, making the system easier to maintain, extend and test.

This separation significantly reduces coupling between HTTP endpoints and operational functionality.

---

## Backend

The backend is implemented using **Node.js** and **Express**.

Major architectural goals include:

- clear separation of responsibilities
- centralized authorization
- reusable business actions
- structured error handling
- consistent audit logging
- integration of existing enterprise systems

Administrative operations are executed through dedicated service components rather than directly inside API routes.

---

## Frontend

The frontend is built with **React**, **Vite** and **Tailwind CSS**.

It focuses on operational efficiency rather than visual complexity.

Key design goals include:

- fast navigation
- low cognitive load
- minimal clicks for common tasks
- responsive search
- clear status indicators
- consistent interaction patterns

The frontend intentionally contains very little business logic.

Operational decisions remain on the server.

---

## Layered Design

The platform distinguishes several architectural layers.

| Layer | Responsibility |
|--------|----------------|
| Presentation | React user interface |
| API | HTTP endpoints, authentication, authorization |
| Business Layer | Business rules and workflow orchestration |
| Services | Communication with external systems |
| Workers | Execution of PowerShell operations |
| External Systems | Active Directory, Exchange, Citrix, Docusnap, TopDesk |

Each layer has a clearly defined responsibility and communicates only through its adjacent layers.

This minimizes dependencies and allows individual components to evolve independently.

---

# System Integrations

ConnOps intentionally does **not** attempt to replace existing enterprise systems.

Instead, it provides a unified operational interface while leaving authoritative data inside the original systems.

### Active Directory

Active Directory is the primary identity source.

Current functionality includes:

- user search
- computer search
- account enable/disable
- password reset
- account unlock
- attribute editing
- group membership management

---

### Microsoft Exchange

Exchange is integrated internally as part of operational workflows.

ConnOps currently exposes **no public Exchange API endpoints**.

Exchange operations are executed only as part of higher-level business processes where mailbox administration is required.

---

### Citrix

Citrix session information is imported into the platform to provide operational visibility.

This allows administrators to correlate users, computers and active sessions without switching to separate management consoles.

---

### Docusnap

Inventory information from Docusnap is integrated to enrich computer information with asset-related data.

This enables administrators to combine directory information and inventory information inside one interface.

Examples include:

- device status
- manufacturer
- operating system
- serial number
- assigned user
- inventory metadata

---

### TopDesk

TopDesk serves as the IT Service Management integration.

The long-term goal is to automate operational workflows triggered by approved service requests while preserving clear approval boundaries and complete auditability.

---

# Security

Security is treated as an architectural concern rather than an afterthought.

Major security principles include:

- server-side authorization
- session-based authentication
- role-based access control
- centralized permission enforcement
- request validation
- security headers
- rate limiting for authentication endpoints
- audit logging of administrative operations

Permissions are evaluated on every protected request.

Authentication, authorization and business logic remain clearly separated throughout the application.

Sensitive operations are never delegated directly to the client.

---

# Audit & Observability

Every administrative operation is designed to be traceable.

Typical audit information includes:

- actor
- operation
- target
- timestamp
- execution result
- contextual metadata

The audit log provides the operational history required for troubleshooting, accountability and compliance.

Beyond security, audit information also serves as the foundation for operational reporting and future analytics.

Future reporting capabilities build upon the same structured audit information rather than introducing separate logging mechanisms.

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
| Audit Storage | SQLite |
| Process Data | PostgreSQL *(planned)* |
| Reporting | PDF generation |
| Asset Integration | Docusnap |
| ITSM | TopDesk |
| Virtualization | Citrix |

The project intentionally combines modern web technologies with existing enterprise infrastructure instead of replacing proven administrative systems.

---

# Repository Structure

```text
ConnOps/
├── backend/
│   ├── actions/
│   ├── middleware/
│   ├── routes/
│   ├── services/
│   ├── workers/
│   ├── data/
│   └── server.js
│
├── frontend/
│   ├── src/
│   ├── public/
│   └── ...
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── API.md
│   ├── SECURITY.md
│   ├── TECHNICAL.md
│   ├── DECISIONS.md
│   ├── PATTERNS.md
│   ├── PRODUCT.md
│   ├── ROADMAP.md
│   └── ...
│
└── README.md
```

The project follows a documentation-first approach. Architectural decisions, technical concepts and implementation guidelines are documented alongside the source code.

---

# Documentation

The repository contains comprehensive technical documentation describing both the architecture and the long-term design principles of the platform.

| Document | Purpose |
|----------|---------|
| **PRODUCT.md** | Product vision, goals and functional scope |
| **ROADMAP.md** | Planned features and development roadmap |
| **ARCHITECTURE.md** | Overall system architecture and responsibilities |
| **TECHNICAL.md** | Technical implementation details |
| **API.md** | Public REST API documentation |
| **SECURITY.md** | Authentication, authorization and security model |
| **PATTERNS.md** | Reusable implementation patterns |
| **DECISIONS.md** | Architectural Decision Records (ADRs) |
| **DOCUMENTATION.md** | Documentation standards and hierarchy |
| **GLOSSARY.md** | Shared terminology used across the project |

The documentation is maintained together with the codebase to ensure that architectural decisions remain transparent and reproducible.

---

# Getting Started

## Requirements

- Node.js 18+
- npm
- PowerShell 5.1 or newer
- Active Directory environment
- Windows Server (recommended for backend)

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

The application is intended to run inside an enterprise environment with access to the connected infrastructure components.

Some functionality depends on external systems such as Active Directory, Citrix or Docusnap and therefore cannot be fully demonstrated without those integrations.

---

# Project Status

ConnOps is under active development.

The current focus is on stabilizing the platform architecture before expanding automation capabilities.

Existing functionality already covers the core administrative workflows for user and computer management while additional integrations continue to evolve.

The project intentionally prioritizes architectural consistency and maintainability over rapid feature growth.

---

# Roadmap

Current development focuses on the following areas:

- Extended TopDesk workflow automation
- Organization and department management
- Expanded reporting capabilities
- Improved health monitoring
- Additional administrative configuration pages
- Enhanced asset lifecycle management
- Automated onboarding and offboarding workflows
- Additional enterprise system integrations

Future work is guided by operational requirements rather than technology trends.

Every new feature should simplify administrative work, improve traceability or reduce repetitive manual tasks.

---

# Design Principles

Several architectural principles guide the development of ConnOps.

### Integrate instead of replace

Existing enterprise systems remain the authoritative source of their respective data.

ConnOps coordinates workflows between those systems instead of duplicating functionality.

---

### Separation of responsibilities

Each architectural layer has a clearly defined responsibility.

Presentation, API, business logic, integrations and infrastructure remain independent from one another wherever possible.

---

### Security by design

Authentication, authorization, validation and auditing are built into the architecture rather than added afterwards.

Administrative operations should always be attributable and reproducible.

---

### Documentation as part of the product

Architecture documentation is treated as a first-class project artifact.

Every significant architectural decision is documented to preserve long-term maintainability and reduce onboarding effort.

---

### Operational simplicity

The platform is designed for real-world IT operations.

Reducing clicks, minimizing context switching and simplifying recurring administrative tasks are considered primary design goals.

---

# Contributing

At the current stage this repository is maintained as a private project.

Contributions are intentionally limited while the architecture and documentation continue to mature.

Once the overall platform architecture stabilizes, contribution guidelines may be published.

---

# License

This repository is currently **not licensed for public reuse**.

All rights reserved.

---

# Final Remarks

ConnOps is more than a collection of administration scripts.

It represents the gradual evolution from isolated operational tools towards a cohesive platform that emphasizes maintainability, security, traceability and automation.

Rather than replacing proven enterprise systems, ConnOps provides a consistent operational layer that connects them through clearly defined interfaces and documented architectural principles.

The project continues to evolve alongside operational requirements, with every architectural decision guided by one central objective:

> **Make daily IT operations simpler, safer and easier to understand.**
