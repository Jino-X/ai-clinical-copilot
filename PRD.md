# AI Clinical Copilot — PRD

## 1. Product Overview

Build a multi-tenant SaaS platform that acts as an **AI Clinical Copilot for doctors**.

The goal is to reduce the time doctors spend on:

- Writing consultation notes
- Reviewing previous patient records
- Comparing previous and current visits
- Organizing medical documents
- Searching patient history

The AI assists the doctor but **never replaces the doctor**.

The doctor must review and approve AI-generated clinical information before it becomes an official medical record.

---

# 2. Core User Flow

```text
Doctor Login
    ↓
Dashboard
    ↓
Search/Open Patient
    ↓
AI Patient Summary
    ↓
Review Previous History
    ↓
Start Consultation
    ↓
Record Doctor + Patient Conversation
    ↓
Speech-to-Text
    ↓
Medical Information Extraction
    ↓
Generate SOAP Note
    ↓
Doctor Reviews/Edits
    ↓
Doctor Approves
    ↓
Save Official Clinical Record
    ↓
Update Patient Timeline
```

---

# 3. Main Features

## Authentication

- Supabase Auth
- Login/signup
- Password reset
- Email verification
- Protected routes
- Role-based access

## Organizations

- Multi-tenant architecture
- Organization
- Doctors
- Staff
- Departments
- Role/permission management

## Patients

Doctor can:

- Create patient
- Search patient
- View patient
- Edit patient
- View medical history
- View medications
- View allergies
- View consultations
- View documents
- View timeline

## AI Patient Summary

When a doctor opens a patient, show:

- Current/recent complaints
- Relevant medical history
- Previous diagnoses
- Current medications
- Allergies
- Recent lab results
- Recent consultations
- Important changes

The summary must be grounded in the patient's records.

---

# 4. Consultation

Doctor clicks:

```text
Start Consultation
```

The system:

1. Requests recording consent.
2. Starts microphone recording.
3. Captures consultation audio.
4. Sends audio for transcription.
5. Separates doctor/patient speakers where supported.
6. Generates structured medical information.
7. Generates SOAP note.
8. Displays AI-generated draft.
9. Doctor edits/approves.
10. Saves the approved record.

The original transcript/audio must never be replaced by AI output.

---

# 5. SOAP Note

Generate:

```text
Subjective
Objective
Assessment
Plan
Follow-up
```

Assessment and Plan must be treated as **AI-generated drafts requiring doctor confirmation**.

The doctor can:

- Edit
- Accept
- Reject
- Approve

Only the approved version becomes the official clinical record.

---

# 6. Patient Timeline

Maintain a chronological timeline containing:

```text
Consultations
Diagnoses
Medications
Lab Reports
Documents
Procedures
Follow-ups
```

Example:

```text
Aug 20
Consultation

Aug 15
Lab Report

Aug 10
Medication Change

Jul 25
Consultation
```

Each timeline event must reference its source record.

---

# 7. Previous vs Current Visit

For returning patients, automatically show:

```text
Previous Visit
      ↓
Current Visit
      ↓
AI Comparison
```

Highlight:

- New symptoms
- Changed symptoms
- Improved symptoms
- Worsened symptoms
- New medications
- Medication changes
- New lab results
- Important historical changes

Never infer a change without supporting patient data.

---

# 8. AI Patient History Assistant

Doctor can ask questions such as:

```text
What medications has this patient used recently?

What changed since the previous visit?

Summarize the patient's history.

When was the last blood test?

Show previous consultations related to this condition.
```

The AI must answer only from authorized patient records.

Every answer should provide source references.

---

# 9. Medical Documents

Doctors can upload:

- PDF
- JPG
- PNG
- DOCX

Processing pipeline:

```text
Upload
 ↓
Private Storage
 ↓
OCR/Text Extraction
 ↓
Document Classification
 ↓
Medical Information Extraction
 ↓
Doctor Verification
 ↓
Patient Record
 ↓
Timeline
```

Documents must never be publicly accessible.

---

# 10. RAG

Use **Supabase PostgreSQL + pgvector** for the initial RAG system.

Do not introduce a separate vector database for MVP.

Store embeddings for relevant:

- consultations
- clinical notes
- documents
- lab reports
- medical history

Retrieval must always be scoped by:

```text
organization_id
patient_id
user authorization
```

AI answers must include source records.

---

# 11. AI Architecture

Do not tightly couple the application to one AI provider.

Create provider interfaces:

```python
class LLMProvider:
    ...

class TranscriptionProvider:
    ...

class EmbeddingProvider:
    ...
```

Support configurable providers.

AI tasks:

```text
transcription
medical extraction
SOAP generation
patient summary
history comparison
document extraction
patient history Q&A
```

Use structured JSON/Pydantic schemas for AI outputs.

Never rely on free-form LLM text for critical database operations.

---

# 12. AI Safety

The AI must never:

- Invent patient information
- Invent symptoms
- Invent medications
- Invent lab values
- Invent diagnoses
- Invent dates
- Modify official records automatically
- Prescribe medication autonomously
- Make autonomous medical decisions

If information is unavailable:

```text
Not found in available patient records.
```

If uncertain:

```text
Requires physician verification.
```

All clinically significant AI output must remain a draft until approved by the doctor.

---

# 13. Technology Stack

## Frontend

```text
Next.js 16+
React
TypeScript
Tailwind CSS
shadcn/ui
TanStack Query
React Hook Form
Zod
```

Use Next.js App Router.

Use Server Components by default and Client Components only when required.

---

## Backend

```text
Python 3.13+
FastAPI
Pydantic v2
async/await
httpx
```

Use a modular monolith architecture.

Backend modules:

```text
auth
organizations
patients
consultations
clinical_records
documents
ai
rag
audit
```

---

## Database

```text
Supabase
PostgreSQL
Supabase Auth
Supabase Storage
pgvector
Row Level Security
```

---

## Infrastructure

Frontend:

```text
Vercel
```

Backend:

```text
AWS
ECS/Fargate
Application Load Balancer
ECR
SQS
CloudWatch
Secrets Manager
```

Use Docker for backend deployment.

---

# 14. Project Structure

```text
clinical-copilot/
│
├── apps/
│   ├── web/
│   └── api/
│
├── packages/
│   └── shared-types/
│
├── supabase/
│   ├── migrations/
│   └── seed/
│
├── infrastructure/
│   └── aws/
│
├── docs/
│
├── PRD.md
├── AGENTS.md
├── README.md
├── docker-compose.yml
└── .env.example
```

---

# 15. Frontend Structure

```text
apps/web/

app/
├── (auth)/
├── (dashboard)/
│   ├── dashboard/
│   ├── patients/
│   ├── consultations/
│   ├── documents/
│   └── settings/

components/
├── ui/
├── layout/
├── patients/
├── consultations/
├── documents/
└── ai/

lib/
├── api/
├── auth/
├── supabase/
├── validations/
└── utils/

hooks/
types/
```

---

# 16. Backend Structure

```text
apps/api/

app/
├── main.py
├── api/
│   └── routes/
├── core/
├── schemas/
├── models/
├── repositories/
├── services/
│   ├── patients/
│   ├── consultations/
│   ├── ai/
│   ├── rag/
│   ├── documents/
│   └── audit/
├── providers/
│   ├── llm/
│   ├── transcription/
│   └── embeddings/
└── workers/
```

API routes must remain thin. Business logic belongs in services.

---

# 17. Database Entities

Core tables:

```text
organizations
organization_members
user_profiles

patients
patient_contacts

consultations
transcripts
transcript_segments

clinical_notes
clinical_note_versions

medical_conditions
patient_conditions

medications
patient_medications

allergies
patient_allergies

lab_reports
lab_results

medical_documents
document_chunks
document_embeddings

patient_timeline_events

ai_generations
ai_generation_sources

consents
audit_logs

notifications
subscriptions
usage_records
```

Every tenant-owned record must contain:

```text
organization_id
```

Patient-specific records should contain:

```text
patient_id
```

---

# 18. Security

Security is a first-class requirement.

Implement:

- PostgreSQL Row Level Security
- Organization-level tenant isolation
- Role-based permissions
- Private Supabase Storage
- HTTPS
- Secure authentication
- Secure cookies
- Rate limiting
- Input validation
- File validation
- Audit logging
- Secrets management
- Security headers
- Least-privilege access

Never expose:

```text
SUPABASE_SERVICE_ROLE_KEY
AI API keys
AWS secret keys
```

to the frontend.

Never trust `organization_id`, `patient_id`, or `doctor_id` supplied by the client.

Resolve authorization from the authenticated user.

---

# 19. Audit Logging

Log sensitive actions:

```text
LOGIN
PATIENT_VIEWED
PATIENT_CREATED
PATIENT_UPDATED

CONSULTATION_STARTED
CONSULTATION_COMPLETED

TRANSCRIPT_GENERATED
AI_NOTE_GENERATED

CLINICAL_NOTE_EDITED
CLINICAL_NOTE_APPROVED

DOCUMENT_UPLOADED
DOCUMENT_VIEWED

PATIENT_DATA_EXPORTED
```

Do not log raw PHI unnecessarily.

---

# 20. Data Privacy

The system handles sensitive medical information.

Design for applicable healthcare/privacy requirements from the beginning.

Before using real patient data in production, perform appropriate:

- legal review
- privacy review
- security assessment
- consent review
- vendor/data-processing review
- retention policy review

Do not claim regulatory compliance simply because security features exist.

Use synthetic patient data during development.

---

# 21. Background Processing

Long-running operations must be asynchronous.

Use:

```text
FastAPI
 ↓
SQS
 ↓
Worker
 ↓
Processing
 ↓
Database
```

Use background processing for:

- transcription
- document OCR
- document extraction
- embeddings
- RAG indexing
- large AI generation tasks

The API should not block while these operations run.

---

# 22. AI Processing Flow

```text
Patient Conversation
        ↓
Audio
        ↓
Transcription
        ↓
Structured Medical Extraction
        ↓
SOAP Draft
        ↓
Doctor Review
        ↓
Doctor Approval
        ↓
Official Clinical Record
        ↓
Timeline
        ↓
RAG Index
```

---

# 23. Versioning

Clinical notes must be versioned.

Example:

```text
v1 — AI generated
v2 — Doctor edited
v3 — Doctor approved
```

Approved records must never be silently overwritten.

Any modification creates a new version.

---

# 24. Error Handling

If AI fails:

```text
AI generation failed.

Your consultation data is safe.

[Retry]
[Continue Manually]
```

Never lose:

- audio
- transcript
- patient records
- doctor edits

Every AI workflow must have a manual fallback.

---

# 25. Environment Configuration

Frontend:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_API_URL=
```

Backend:

```text
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

DATABASE_URL=

LLM_PROVIDER=
TRANSCRIPTION_PROVIDER=
EMBEDDING_PROVIDER=

OPENAI_API_KEY=
ANTHROPIC_API_KEY=

AWS_REGION=

SENTRY_DSN=
```

Only include provider keys that are actually used.

Never commit `.env` files containing secrets.

---

# 26. Development Phases

Windsurf must implement the application in this order.

## Phase 1 — Foundation

- Monorepo
- Next.js
- FastAPI
- Supabase
- Docker
- Environment configuration
- Basic CI

## Phase 2 — Authentication

- Supabase Auth
- Users
- Organizations
- Roles
- Permissions
- Protected routes

## Phase 3 — Patients

- Patient CRUD
- Search
- Patient profile
- Medical history
- Timeline

## Phase 4 — Consultation

- Consultation session
- Consent
- Audio recording
- Secure audio storage
- Consultation states

## Phase 5 — AI Documentation

- Transcription
- Medical extraction
- SOAP generation
- Doctor editing
- Approval
- Versioning

## Phase 6 — Patient Intelligence

- Patient summary
- Previous/current comparison
- Timeline intelligence
- Patient history Q&A

## Phase 7 — Documents

- Upload
- OCR
- Extraction
- Verification
- Timeline integration

## Phase 8 — RAG

- pgvector
- Embeddings
- Hybrid retrieval
- Source references
- Patient-scoped Q&A

## Phase 9 — Production

- Docker
- AWS ECS/Fargate
- SQS workers
- CloudWatch
- Secrets Manager
- Vercel deployment
- Production configuration

---

# 27. MVP Definition

The MVP is complete when a doctor can:

```text
Login
 ↓
Open dashboard
 ↓
Create/search patient
 ↓
View patient history
 ↓
See AI patient summary
 ↓
Start consultation
 ↓
Record conversation
 ↓
Generate transcript
 ↓
Generate SOAP note
 ↓
Edit note
 ↓
Approve note
 ↓
View updated timeline
 ↓
Ask questions about patient history
 ↓
Upload medical document
 ↓
Review extracted information
```

---

# 28. Product UX Principle

The product should feel like:

> **An intelligent assistant sitting beside the doctor.**

Not:

> **Another chatbot the doctor has to operate.**

The AI should stay mostly in the background.

The doctor should spend the majority of their time interacting with the patient, not the software.

Primary product metric:

> **Minutes of documentation time saved per consultation.**

---

# 29. Windsurf AI Agent Instructions

Before implementing anything:

1. Read `PRD.md`.
2. Inspect the existing repository.
3. Understand the current architecture.
4. Identify the current implementation phase.
5. Create a concise implementation plan.
6. Implement only the requested phase.
7. Do not rewrite unrelated code.
8. Follow existing architecture.
9. Add migrations for database changes.
10. Keep secrets out of source code.
11. Preserve tenant isolation and RLS.
12. Keep AI provider integrations abstracted.
13. Keep business logic inside services.
14. Keep API routes thin.
15. Use TypeScript strict mode.
16. Use Python type hints.
17. Prefer simple architecture over unnecessary complexity.
18. Do not introduce microservices unless explicitly required.
19. Do not introduce Kubernetes for MVP.
20. Do not introduce a separate vector database for MVP.
21. Never implement autonomous diagnosis or prescription.
22. AI-generated clinical information must require appropriate doctor review.
23. Use synthetic data during development.
24. Update documentation when architecture changes.
25. Before finishing a phase, verify that the application builds and runs correctly.

---

# 30. Important Architectural Principle

Start with a **modular monolith**, not microservices.

```text
                 FastAPI
                    │
     ┌──────────────┼──────────────┐
     │              │              │
  Patients     Consultations       AI
     │              │              │
     └──────────────┼──────────────┘
                    │
                 Supabase
```

Separate services should only be introduced later when scale requires them.

---

# 31. Final Architecture

```text
                       DOCTOR
                          │
                          ▼
                 ┌─────────────────┐
                 │ Next.js / Vercel│
                 └────────┬────────┘
                          │
                         HTTPS
                          │
                          ▼
                 ┌─────────────────┐
                 │ AWS ALB         │
                 └────────┬────────┘
                          │
                          ▼
                 ┌─────────────────┐
                 │ FastAPI         │
                 │ ECS/Fargate     │
                 └───────┬─────────┘
                         │
          ┌──────────────┼───────────────┐
          │              │               │
          ▼              ▼               ▼
      Supabase          SQS          AI Providers
      PostgreSQL       Workers        LLM / STT
      Auth             │
      Storage          ▼
      pgvector      AI Processing
          │
          ▼
    Patient Records
          │
          ▼
        RAG
          │
          ▼
   Clinical Copilot
```

---

# 32. Development Philosophy

Build the product around one simple promise:

> **Less documentation. Faster patient-history review. More time for patients.**

Prioritize:

```text
Security
↓
Patient data protection
↓
Clinical record integrity
↓
Correctness
↓
Reliability
↓
Simple UX
↓
Performance
↓
Cost
↓
New features
```

Never sacrifice patient-data security or clinical-record integrity for development speed.

---

# END