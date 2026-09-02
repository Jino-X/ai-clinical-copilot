# Clinical Copilot - System Architecture

## Table of Contents

1. [Overview](#overview)
2. [Technology Stack](#technology-stack)
3. [System Architecture](#system-architecture)
4. [Directory Structure](#directory-structure)
5. [Database Schema](#database-schema)
6. [API Architecture](#api-architecture)
7. [Frontend Architecture](#frontend-architecture)
8. [AI/ML Pipeline](#aiml-pipeline)
9. [Security & Authentication](#security--authentication)
10. [Data Flow](#data-flow)
11. [Deployment](#deployment)

---

## Overview

Clinical Copilot is an AI-powered clinical documentation assistant designed to reduce the time doctors spend on administrative tasks. The system captures patient consultations via audio recording, transcribes them, and generates structured SOAP notes while maintaining strict clinical safety standards.

**Core Principle:** AI prepares everything. The doctor makes the final decision.

### Key Features

- **Audio Recording & Transcription**: Browser-based audio capture with AI transcription
- **Multilingual Support**: Tamil-to-English translation for Indian healthcare
- **Clinical Information Extraction**: Structured extraction of symptoms, conditions, medications
- **SOAP Note Generation**: AI-generated clinical documentation drafts
- **Patient Intelligence**: Visit comparison, patient summaries, medical history Q&A
- **Document Management**: Upload, extract, and verify medical documents
- **RAG-based Search**: Vector similarity search across patient records

---

## Technology Stack

### Frontend
- **Framework**: Next.js 16 (App Router, Turbopack)
- **Language**: TypeScript 5
- **UI Library**: React 19
- **Styling**: Tailwind CSS + shadcn/ui (Radix Nova)
- **State Management**: TanStack Query (React Query)
- **Forms**: React Hook Form + Zod validation
- **Audio Recording**: Browser MediaRecorder API

### Backend
- **Framework**: FastAPI (Python 3.13)
- **Database**: PostgreSQL 15 (Supabase)
- **Vector Store**: pgvector extension
- **Object Storage**: Supabase Storage
- **Authentication**: Supabase Auth (JWT + JWKS)
- **ORM**: Raw SQL with asyncpg
- **Validation**: Pydantic v2

### AI/ML Stack
- **STT (Speech-to-Text)**: AI4Bharat IndicConformer (600M multilingual)
- **LLM**: Ollama + Qwen3 8B (local inference)
- **Embeddings**: Ollama nomic-embed-text (768 dimensions, local)
- **Translation**: Ollama/Qwen3 (Tamil → English)
- **Audio Processing**: torchaudio, torchcodec, ffmpeg
- **Document Extraction**: python-docx (DOCX), pypdf (PDF), built-in text readers

### Infrastructure
- **Containerization**: Docker + Docker Compose
- **CI/CD**: GitHub Actions
- **Development**: npm workspaces (monorepo)

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser (Client)                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  Next.js App │  │ MediaRecorder│  │  TanStack Query      │  │
│  │  (React 19)  │  │  (Audio)     │  │  (State Management)  │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────────────────┘  │
└─────────┼──────────────────┼──────────────────────────────────────┘
          │                  │
          │ HTTPS/REST       │ Direct Upload (Signed URL)
          │                  │
┌─────────▼──────────────────▼──────────────────────────────────────┐
│                      Supabase Platform                             │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────────┐  │
│  │   Auth      │  │   Storage   │  │   PostgreSQL + pgvector  │  │
│  │   (JWT)     │  │   (S3-like) │  │   (RLS enabled)          │  │
│  └─────────────┘  └─────────────┘  └──────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
          │
          │ JWT Verification (JWKS)
          │
┌─────────▼──────────────────────────────────────────────────────────┐
│                    FastAPI Backend (Python 3.13)                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                      API Layer (Routes)                       │  │
│  │  /auth  /patients  /consultations  /clinical-notes  /rag     │  │
│  └────────────────────────┬─────────────────────────────────────┘  │
│  ┌────────────────────────▼─────────────────────────────────────┐  │
│  │                   Service Layer (Business Logic)              │  │
│  │  • PatientService  • ConsultationService  • StorageService    │  │
│  │  • ClinicalExtractionService  • VisitComparisonService        │  │
│  │  • DoctorSummaryService  • RagService  • EmbeddingService     │  │
│  └────────────────────────┬─────────────────────────────────────┘  │
│  ┌────────────────────────▼─────────────────────────────────────┐  │
│  │                  Repository Layer (Data Access)               │  │
│  │  • PatientRepository  • ConsultationRepository                │  │
│  │  • ClinicalNoteRepository  • DocumentRepository               │  │
│  └────────────────────────┬─────────────────────────────────────┘  │
│  ┌────────────────────────▼─────────────────────────────────────┐  │
│  │                   Provider Layer (AI/External)                │  │
│  │  • IndicConformerSTT  • OllamaLLM  • OllamaEmbedding          │  │
│  │  • LocalTranslation  • OpenAILLM (fallback)                   │  │
│  └───────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
          │
          │ HTTP (local)
          │
┌─────────▼──────────────────────────────────────────────────────────┐
│                      Local AI Services                              │
│  ┌─────────────────┐              ┌──────────────────────────────┐ │
│  │  Ollama Server  │              │  IndicConformer Model Cache  │ │
│  │  (Qwen3 8B,     │              │  (~600MB, lazy-loaded)       │ │
│  │   nomic-embed-  │              │  HuggingFace Hub             │ │
│  │   text)         │              │                              │ │
│  │  Port: 11434    │              │                              │ │
│  └─────────────────┘              └──────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────┘
```

---

## Directory Structure

```
clinical-copilot/
├── apps/
│   ├── api/                          # FastAPI backend
│   │   ├── app/
│   │   │   ├── api/
│   │   │   │   ├── deps.py           # Dependency injection
│   │   │   │   ├── router.py         # Main API router
│   │   │   │   └── routes/           # API endpoints
│   │   │   │       ├── auth.py
│   │   │   │       ├── patients.py
│   │   │   │       ├── consultations.py
│   │   │   │       ├── clinical_notes.py
│   │   │   │       ├── documents.py
│   │   │   │       ├── intelligence.py
│   │   │   │       ├── local_ai.py
│   │   │   │       └── rag.py
│   │   │   ├── core/
│   │   │   │   ├── config.py         # Environment configuration
│   │   │   │   ├── errors.py         # Error handling
│   │   │   │   ├── logging.py        # Structured logging
│   │   │   │   ├── middleware.py     # CORS, logging, error middleware
│   │   │   │   ├── permissions.py    # Role-based permissions
│   │   │   │   └── security.py       # JWT verification
│   │   │   ├── db/
│   │   │   │   └── pool.py           # asyncpg connection pool
│   │   │   ├── providers/
│   │   │   │   ├── llm/              # LLM providers
│   │   │   │   │   ├── base.py
│   │   │   │   │   ├── ollama.py
│   │   │   │   │   └── openai.py
│   │   │   │   ├── embedding/        # Embedding providers
│   │   │   │   │   ├── base.py
│   │   │   │   │   ├── ollama.py     # nomic-embed-text (768D)
│   │   │   │   │   └── openai.py     # text-embedding-3-small (1536D)
│   │   │   │   ├── transcription/    # STT providers
│   │   │   │   │   ├── base.py
│   │   │   │   │   ├── indicconformer.py
│   │   │   │   │   └── openai.py
│   │   │   │   └── translation/      # Translation providers
│   │   │   │       ├── base.py
│   │   │   │       └── local.py
│   │   │   ├── repositories/         # Data access layer
│   │   │   │   ├── ai_generations.py
│   │   │   │   ├── clinical_notes.py
│   │   │   │   ├── consultations.py
│   │   │   │   ├── documents.py
│   │   │   │   ├── embeddings.py
│   │   │   │   ├── organizations.py
│   │   │   │   └── patients.py
│   │   │   ├── schemas/              # Pydantic models
│   │   │   │   ├── auth.py
│   │   │   │   ├── clinical_notes.py
│   │   │   │   ├── consultations.py
│   │   │   │   ├── documents.py
│   │   │   │   ├── intelligence.py
│   │   │   │   ├── local_ai.py
│   │   │   │   ├── patients.py
│   │   │   │   └── rag.py
│   │   │   ├── services/
│   │   │   │   ├── ai/               # AI services
│   │   │   │   │   ├── clinical_extraction.py
│   │   │   │   │   ├── context_builder.py
│   │   │   │   │   ├── doctor_summary.py
│   │   │   │   │   ├── embedding.py
│   │   │   │   │   ├── extraction.py
│   │   │   │   │   ├── rag.py
│   │   │   │   │   ├── soap.py
│   │   │   │   │   └── visit_comparison.py
│   │   │   │   ├── audit/
│   │   │   │   │   └── service.py
│   │   │   │   └── storage/
│   │   │   │       └── service.py
│   │   │   ├── workers/              # Background jobs (future)
│   │   │   └── main.py               # FastAPI app entry
│   │   ├── scripts/
│   │   │   └── dev.sh                # Development server script
│   │   ├── tests/                    # pytest tests
│   │   ├── .env.example
│   │   ├── Dockerfile
│   │   ├── requirements.txt
│   │   └── requirements-dev.txt
│   │
│   └── web/                          # Next.js frontend
│       ├── app/
│       │   ├── (auth)/               # Auth pages (login, signup)
│       │   │   ├── login/
│       │   │   ├── signup/
│       │   │   └── actions.ts        # Server actions
│       │   ├── (dashboard)/          # Protected dashboard
│       │   │   ├── dashboard/
│       │   │   │   ├── consultations/
│       │   │   │   │   └── [consultationId]/
│       │   │   │   ├── onboarding/
│       │   │   │   ├── organization/
│       │   │   │   ├── patients/
│       │   │   │   │   └── [patientId]/
│       │   │   │   └── page.tsx
│       │   │   └── layout.tsx
│       │   ├── globals.css
│       │   └── layout.tsx
│       ├── components/
│       │   ├── ui/                   # shadcn/ui components
│       │   ├── clinical/             # Clinical UI components
│       │   │   ├── patient-avatar.tsx
│       │   │   └── index.ts
│       │   ├── ai-pipeline.tsx
│       │   ├── confirm-dialog.tsx    # Reusable confirmation dialog
│       │   ├── medical-history-card.tsx
│       │   ├── patient-documents.tsx
│       │   ├── patient-header.tsx    # Animated patient header
│       │   ├── patient-intelligence.tsx
│       │   ├── patient-timeline-enhanced.tsx
│       │   ├── rag-search.tsx
│       │   └── soap-note-editor.tsx
│       ├── lib/
│       │   ├── api/                  # API client
│       │   │   ├── client.ts
│       │   │   ├── client-auth.ts
│       │   │   ├── clinical-notes.ts
│       │   │   ├── consultations.ts
│       │   │   ├── documents.ts
│       │   │   ├── intelligence.ts
│       │   │   ├── local-ai.ts
│       │   │   ├── patients.ts
│       │   │   └── rag.ts
│       │   ├── supabase/
│       │   │   ├── client.ts         # Browser client
│       │   │   └── server.ts         # Server client
│       │   ├── animations.ts         # Framer Motion variants
│       │   ├── env.ts                # Environment validation
│       │   └── utils.ts
│       ├── proxy.ts                  # Next.js 16 middleware
│       ├── .env.local.example
│       ├── components.json           # shadcn/ui config
│       ├── next.config.ts
│       ├── package.json
│       ├── tailwind.config.ts
│       └── tsconfig.json
│
├── packages/
│   └── shared-types/                 # Shared TypeScript types
│       ├── src/
│       │   ├── api.ts
│       │   ├── auth.ts
│       │   ├── clinical-notes.ts
│       │   ├── consultations.ts
│       │   ├── documents.ts
│       │   ├── index.ts
│       │   ├── intelligence.ts
│       │   ├── local-ai.ts
│       │   ├── patients.ts
│       │   └── rag.ts
│       ├── package.json
│       └── tsconfig.json
│
├── supabase/
│   └── migrations/                   # SQL migrations (ordered by timestamp)
│       ├── 20260830010000_init.sql
│       ├── 20260830020000_auth.sql
│       ├── 20260830030000_consultations.sql
│       ├── 20260830040000_clinical_notes.sql
│       ├── 20260830050000_documents.sql
│       ├── 20260830060000_rag.sql
│       ├── 20260830070000_local_ai.sql
│       ├── 20260901080000_simplify_roles.sql
│       ├── 20260901090000_fix_ai_generations_insert.sql
│       ├── 20260901100000_consultation_soft_delete.sql
│       ├── 20260902110000_document_delete_policy.sql
│       └── 20260902120000_rag_ollama_dimensions.sql
│
├── scripts/
│   └── seed_test_data.py             # Test data seeding
│
├── .github/
│   └── workflows/
│       └── ci.yml                    # CI/CD pipeline
│
├── AGENTS.md                         # Development notes
├── ARCHITECTURE.md                   # This file
├── PRD.md                            # Product requirements
├── README.md                         # Project overview
├── docker-compose.yml
├── package.json                      # Root workspace config
└── .gitignore
```

---

## Database Schema

### Core Tables

#### Organizations & Membership
```sql
organizations
  ├── id (uuid, PK)
  ├── name (text)
  ├── created_at (timestamptz)
  └── updated_at (timestamptz)

organization_members
  ├── id (uuid, PK)
  ├── organization_id (uuid, FK → organizations)
  ├── user_id (uuid, FK → auth.users)
  ├── role (text) -- Always 'doctor' after simplification
  ├── created_at (timestamptz)
  └── updated_at (timestamptz)
```

#### Patients & Medical History
```sql
patients
  ├── id (uuid, PK)
  ├── organization_id (uuid, FK)
  ├── mrn (text, unique per org)
  ├── first_name, last_name (text)
  ├── date_of_birth (date)
  ├── sex (text)
  ├── phone, email (text)
  └── RLS: organization_id

patient_contacts
  ├── id (uuid, PK)
  ├── patient_id (uuid, FK)
  ├── organization_id (uuid, FK)
  ├── relationship, name, phone (text)
  └── RLS: organization_id, patient_id

conditions
  ├── id (uuid, PK)
  ├── patient_id (uuid, FK)
  ├── organization_id (uuid, FK)
  ├── name (text)
  ├── status (active|resolved|chronic)
  ├── onset_date, resolved_date (date)
  └── RLS: organization_id, patient_id

medications
  ├── id (uuid, PK)
  ├── patient_id (uuid, FK)
  ├── organization_id (uuid, FK)
  ├── name, dosage, frequency, route (text)
  ├── status (active|discontinued|completed)
  └── RLS: organization_id, patient_id

allergies
  ├── id (uuid, PK)
  ├── patient_id (uuid, FK)
  ├── organization_id (uuid, FK)
  ├── allergen (text)
  ├── severity (mild|moderate|severe)
  └── RLS: organization_id, patient_id

patient_timeline_events
  ├── id (uuid, PK)
  ├── patient_id (uuid, FK)
  ├── organization_id (uuid, FK)
  ├── event_type (text)
  ├── event_date (timestamptz)
  ├── description (text)
  └── RLS: organization_id, patient_id
```

#### Consultations & Recording
```sql
consultations
  ├── id (uuid, PK)
  ├── patient_id (uuid, FK)
  ├── doctor_id (uuid, FK → auth.users)
  ├── organization_id (uuid, FK)
  ├── status (scheduled|in_progress|completed|cancelled)
  ├── chief_complaint (text)
  ├── audio_storage_path (text)
  ├── started_at, ended_at (timestamptz)
  └── RLS: organization_id

consents
  ├── id (uuid, PK)
  ├── consultation_id (uuid, FK)
  ├── organization_id (uuid, FK)
  ├── consent_type (audio_recording|ai_processing)
  ├── granted (boolean)
  └── RLS: organization_id

transcripts
  ├── id (uuid, PK)
  ├── consultation_id (uuid, FK)
  ├── organization_id (uuid, FK)
  ├── original_text (text)          -- Original language
  ├── english_text (text)            -- Translated/normalized
  ├── language (text)
  ├── provider, model (text)
  └── RLS: organization_id

transcript_segments
  ├── id (uuid, PK)
  ├── transcript_id (uuid, FK)
  ├── organization_id (uuid, FK)
  ├── segment_index (int)
  ├── text (text)
  ├── start_time, end_time (float)
  └── RLS: organization_id
```

#### Clinical Notes (Versioned)
```sql
clinical_notes
  ├── id (uuid, PK)
  ├── consultation_id (uuid, FK)
  ├── organization_id (uuid, FK)
  ├── status (draft|approved|rejected)
  ├── current_version (int)
  ├── approved_at, approved_by (timestamptz, uuid)
  └── RLS: organization_id

clinical_note_versions
  ├── id (uuid, PK)
  ├── clinical_note_id (uuid, FK)
  ├── organization_id (uuid, FK)
  ├── version (int)
  ├── source (ai_generated|doctor_edited|doctor_approved)
  ├── subjective, objective, assessment, plan (text)
  └── RLS: organization_id
```

#### AI Processing
```sql
ai_generations
  ├── id (uuid, PK)
  ├── consultation_id (uuid, FK)
  ├── organization_id (uuid, FK)
  ├── task_type (transcription|soap_generation|extraction)
  ├── provider, model (text)
  ├── status (pending|completed|failed)
  ├── duration_ms (int)
  └── RLS: organization_id

clinical_extractions
  ├── id (uuid, PK)
  ├── consultation_id (uuid, FK)
  ├── organization_id (uuid, FK)
  ├── extraction (jsonb)             -- Structured clinical data
  ├── provider, model (text)
  └── RLS: organization_id

doctor_summaries
  ├── id (uuid, PK)
  ├── consultation_id (uuid, FK)
  ├── organization_id (uuid, FK)
  ├── summary (text)
  ├── source_references (jsonb)
  ├── provider, model (text)
  └── RLS: organization_id
```

#### Documents & RAG
```sql
medical_documents
  ├── id (uuid, PK)
  ├── patient_id (uuid, FK)
  ├── organization_id (uuid, FK)
  ├── storage_path (text)
  ├── category (lab_report|imaging|prescription|...)
  ├── status (uploaded|processing|extracted|verified|failed)
  ├── extracted_text (text)
  ├── extracted_info (jsonb)
  └── RLS: organization_id, patient_id

record_embeddings
  ├── id (uuid, PK)
  ├── organization_id (uuid, FK)
  ├── patient_id (uuid, FK)
  ├── record_type (consultation|clinical_note|document|...)
  ├── record_id (uuid)
  ├── embedding (vector(768))        -- pgvector (nomic-embed-text)
  ├── content_preview (text)
  └── RLS: organization_id, patient_id
  └── INDEX: HNSW (embedding vector_cosine_ops)
```

### Row-Level Security (RLS)

All tenant-scoped tables enforce RLS using the `is_org_member(organization_id)` helper:

```sql
CREATE POLICY table_select_members ON table
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY table_insert_members ON table
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(organization_id));
```

Patient-scoped tables also check `patient_id` ownership.

---

## API Architecture

### Layered Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Routes (FastAPI endpoints)                             │
│  • Thin controllers                                     │
│  • Request validation (Pydantic)                        │
│  • Permission checks                                    │
│  • Response serialization                               │
└────────────────┬────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────┐
│  Services (Business logic)                              │
│  • Domain logic                                         │
│  • Orchestration                                        │
│  • AI provider calls                                    │
│  • Complex workflows                                    │
└────────────────┬────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────┐
│  Repositories (Data access)                             │
│  • SQL queries                                          │
│  • CRUD operations                                      │
│  • Transaction management                               │
│  • RLS enforcement                                      │
└────────────────┬────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────┐
│  Database (PostgreSQL + pgvector)                       │
│  • Row-level security                                   │
│  • JSONB for flexible data                              │
│  • Vector similarity search                             │
│  • Triggers for timeline events                         │
└─────────────────────────────────────────────────────────┘
```

### Key API Endpoints

#### Authentication
- `POST /auth/login` - Email/password login
- `POST /auth/signup` - User registration
- `POST /auth/refresh` - Refresh access token
- `GET /auth/me` - Get current user

#### Patients
- `GET /patients` - List patients (with search)
- `POST /patients` - Create patient
- `GET /patients/{id}` - Get patient details
- `PATCH /patients/{id}` - Update patient
- `GET /patients/{id}/conditions` - List conditions
- `POST /patients/{id}/conditions` - Add condition
- `GET /patients/{id}/medications` - List medications
- `GET /patients/{id}/allergies` - List allergies
- `GET /patients/{id}/timeline` - Patient timeline

#### Consultations
- `GET /consultations` - List consultations
- `POST /consultations` - Create consultation
- `GET /consultations/{id}` - Get consultation
- `POST /consultations/{id}/start` - Start consultation
- `POST /consultations/{id}/complete` - Complete consultation
- `POST /consultations/{id}/consents` - Record consent
- `POST /consultations/{id}/audio/upload-url` - Get signed upload URL
- `POST /consultations/{id}/audio/confirm` - Confirm audio upload

#### Clinical Notes
- `GET /clinical-notes/{consultationId}` - Get clinical note
- `POST /clinical-notes/consultations/{id}/transcribe` - Transcribe audio
- `POST /clinical-notes/consultations/{id}/generate-soap` - Generate SOAP note
- `PATCH /clinical-notes/{id}` - Edit note
- `POST /clinical-notes/{id}/approve` - Approve note
- `POST /clinical-notes/{id}/reject` - Reject note

#### Local AI Pipeline
- `POST /consultations/{id}/normalize` - Normalize transcript (Tamil→English)
- `POST /consultations/{id}/extract` - Extract clinical information
- `POST /consultations/{id}/compare` - Compare with previous visits
- `POST /consultations/{id}/summary` - Generate doctor summary
- `GET /consultations/{id}/extraction` - Get extraction
- `GET /consultations/{id}/summary` - Get summary
- `GET /consultations/{id}/processing-status` - Get pipeline status

#### Documents
- `GET /patients/{id}/documents` - List documents
- `POST /patients/{id}/documents/upload-url` - Get signed upload URL
- `POST /patients/{id}/documents/confirm` - Confirm document upload
- `POST /documents/{id}/extract` - Extract text from document (DOCX, PDF, TXT)
- `PATCH /documents/{id}` - Update document metadata
- `POST /documents/{id}/verify` - Verify extracted information
- `DELETE /documents/{id}` - Delete document (storage + DB record)

#### RAG
- `POST /rag/index` - Index patient records
- `POST /rag/search` - Search patient records
- `GET /rag/status` - Get indexing status

---

## Frontend Architecture

### Next.js 16 App Router

```
app/
├── (auth)/                    # Public auth pages
│   ├── login/
│   └── signup/
│
└── (dashboard)/               # Protected dashboard
    ├── layout.tsx             # Auth check, org check
    └── dashboard/
        ├── page.tsx           # Dashboard home
        ├── onboarding/        # Org creation
        ├── organization/      # Org settings
        ├── patients/
        │   ├── page.tsx       # Patient list
        │   └── [patientId]/
        │       └── page.tsx   # Patient detail (tabs)
        └── consultations/
            └── [consultationId]/
                └── page.tsx   # Consultation detail
```

### State Management

- **TanStack Query**: Server state (API data)
  - Automatic caching
  - Background refetching
  - Optimistic updates
  - Invalidation on mutations

- **React State**: Local UI state
  - Form state (React Hook Form)
  - Modal/dialog state
  - Recording state

- **Framer Motion**: UI animations
  - Page transitions (fade + slide)
  - Staggered list animations
  - Card entrance animations
  - Tab content transitions (AnimatePresence)

### Key Components

#### `<SoapNoteEditor>`
- Transcription trigger
- SOAP note generation
- Inline editing
- Version history
- Approve/reject workflow

#### `<AiPipeline>`
- Normalize → Extract → Compare → Summary
- Step-by-step execution
- Status badges
- Error handling
- Results display

#### `<PatientIntelligence>`
- Patient summary (AI-generated)
- Visit comparison
- Medical history Q&A

#### `<PatientDocuments>`
- Document upload (PDF, DOCX, JPG, PNG, TXT)
- Text extraction (python-docx, pypdf)
- AI classification and information extraction
- Doctor verification workflow
- Document deletion with confirmation dialog

#### `<RagSearch>`
- Vector similarity search
- Source references
- Similarity scores
- Match type indicators

#### `<PatientHeader>`
- Animated gradient header with patient avatar
- Quick stats (conditions, medications, allergies, visits)
- Consultation start button
- Delete patient action

#### `<PatientTimelineEnhanced>`
- Color-coded event types with icons
- Vertical timeline with animated entries
- Staggered entrance animations

#### `<ConfirmDialog>`
- Reusable Radix Dialog-based confirmation
- Used for destructive actions (delete patient, delete document)
- Loading state support

---

## AI/ML Pipeline

### Transcription Pipeline

```
Audio Recording (Browser)
    │
    ├─ MediaRecorder API (audio/webm)
    │
    ▼
Supabase Storage (Signed Upload)
    │
    ▼
IndicConformer STT
    │
    ├─ Download audio via signed URL
    ├─ Convert to 16kHz mono WAV (ffmpeg)
    ├─ Load model (lazy, cached)
    ├─ Inference (ONNX Runtime)
    │
    ▼
Transcript (Original Language)
    │
    ▼
Translation (if Tamil)
    │
    ├─ Ollama/Qwen3 8B
    ├─ Preserve medical terminology
    │
    ▼
Normalized English Transcript
```

### Clinical Extraction Pipeline

```
English Transcript
    │
    ▼
Clinical Extraction (Ollama/Qwen3)
    │
    ├─ Structured JSON output (Pydantic schema)
    ├─ Symptoms, conditions, medications, allergies
    ├─ Uncertainties marked explicitly
    │
    ▼
Structured Clinical Data (JSONB)
```

### Visit Comparison

```
Current Extraction + Previous Consultations
    │
    ▼
PatientContextBuilder
    │
    ├─ Fetch patient history (conditions, meds, allergies)
    ├─ Fetch previous consultations
    ├─ Build context string
    │
    ▼
Ollama/Qwen3 Comparison
    │
    ├─ New symptoms
    ├─ Improved/worsened symptoms
    ├─ Medication changes
    ├─ Important changes
    │
    ▼
Visit Comparison (JSONB)
```

### SOAP Note Generation

```
Transcript + Extraction + Patient Context
    │
    ▼
Ollama/Qwen3 (or OpenAI fallback)
    │
    ├─ Clinical safety prompts
    ├─ Never invent data
    ├─ Mark uncertainties
    ├─ Assessment/Plan are drafts
    │
    ▼
SOAP Note Draft (v1)
    │
    ├─ Doctor edits → v2
    ├─ Doctor approves → v3 (append-only)
    │
    ▼
Approved Clinical Note
```

### RAG Pipeline

```
Patient Records (Consultations, Notes, Documents)
    │
    ▼
Text Extraction
    │
    ├─ Consultation: transcript + SOAP
    ├─ Clinical Note: SOAP sections
    ├─ Document: extracted text
    │
    ▼
Ollama Embeddings (nomic-embed-text)
    │
    ├─ 768-dimensional vectors
    ├─ Local inference (no API key required)
    │
    ▼
pgvector Storage
    │
    ├─ HNSW index (cosine similarity)
    │
    ▼
Hybrid Search (Vector + Keyword)
    │
    ├─ Vector similarity (top-k)
    ├─ Keyword matching (tsvector)
    ├─ Combine & rank
    │
    ▼
Source References + Answer
```

---

## Security & Authentication

### Authentication Flow

```
1. User Login (Email/Password)
   │
   ▼
2. Supabase Auth
   │
   ├─ Verify credentials
   ├─ Generate JWT (access + refresh)
   │
   ▼
3. Frontend stores tokens (httpOnly cookies via proxy.ts)
   │
   ▼
4. API requests include JWT
   │
   ▼
5. Backend verifies JWT
   │
   ├─ JWKS verification (Supabase public key)
   ├─ Extract user_id
   ├─ Check organization membership
   │
   ▼
6. RLS enforces tenant isolation
```

### Row-Level Security (RLS)

Every tenant-scoped table has RLS policies:

```sql
-- SELECT policy
CREATE POLICY table_select_members ON table
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

-- INSERT policy
CREATE POLICY table_insert_members ON table
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(organization_id));

-- UPDATE policy
CREATE POLICY table_update_members ON table
  FOR UPDATE TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));
```

Helper function:
```sql
CREATE FUNCTION is_org_member(org_id uuid) RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = org_id
      AND user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER;
```

### Permission System

Simplified to doctor-only access:

```python
class Permission(str, Enum):
    PATIENT_READ = "patient:read"
    PATIENT_WRITE = "patient:write"
    CONSULTATION_CONDUCT = "consultation:conduct"
    CLINICAL_NOTE_APPROVE = "clinical_note:approve"
    ORGANIZATION_UPDATE = "organization:update"

# All doctors have all permissions
DOCTOR_PERMISSIONS = {
    Permission.PATIENT_READ,
    Permission.PATIENT_WRITE,
    Permission.CONSULTATION_CONDUCT,
    Permission.CLINICAL_NOTE_APPROVE,
    Permission.ORGANIZATION_UPDATE,
}
```

### Data Protection

1. **PHI Protection**
   - Never log clinical content
   - Log identifiers only (UUIDs, MRNs)
   - Opaque error messages to clients

2. **Secrets Management**
   - `SecretStr` for all secrets (redacted in logs)
   - Environment variables only
   - Never expose service-role key to frontend

3. **Storage Security**
   - Private buckets (no public access)
   - Signed URLs (time-limited)
   - RLS on storage paths

4. **Clinical Safety**
   - AI output always a draft
   - Doctor approval required
   - Append-only approved notes
   - Original audio/transcripts never overwritten

---

## Data Flow

### Consultation Recording Flow

```
1. Doctor starts consultation
   │
   ├─ POST /consultations/{id}/start
   ├─ Status: scheduled → in_progress
   │
   ▼
2. Record patient consent
   │
   ├─ POST /consultations/{id}/consents
   ├─ Type: audio_recording, ai_processing
   │
   ▼
3. Browser records audio (MediaRecorder)
   │
   ├─ Capture microphone stream
   ├─ Record to Blob (audio/webm)
   │
   ▼
4. Request signed upload URL
   │
   ├─ POST /consultations/{id}/audio/upload-url
   ├─ Backend: POST /storage/v1/object/upload/sign/{bucket}/{path}
   ├─ Returns: signed URL + token
   │
   ▼
5. Upload audio directly to Supabase Storage
   │
   ├─ PUT {signed_url} (with apikey header)
   ├─ Body: audio Blob
   │
   ▼
6. Confirm upload
   │
   ├─ POST /consultations/{id}/audio/confirm
   ├─ Update: audio_storage_path
   │
   ▼
7. Doctor completes consultation
   │
   ├─ POST /consultations/{id}/complete
   ├─ Status: in_progress → completed
```

### AI Documentation Flow

```
1. Transcribe Audio
   │
   ├─ POST /clinical-notes/consultations/{id}/transcribe
   ├─ Download audio from Storage
   ├─ IndicConformer inference
   ├─ Save transcript (original language)
   │
   ▼
2. Normalize Transcript (if Tamil)
   │
   ├─ POST /consultations/{id}/normalize
   ├─ Ollama/Qwen3 translation
   ├─ Update: transcript.english_text
   │
   ▼
3. Extract Clinical Information
   │
   ├─ POST /consultations/{id}/extract
   ├─ Ollama/Qwen3 structured extraction
   ├─ Save: clinical_extractions
   │
   ▼
4. Compare with Previous Visits
   │
   ├─ POST /consultations/{id}/compare
   ├─ Fetch patient history
   ├─ Ollama/Qwen3 comparison
   ├─ Save: visit comparison (in doctor_summaries)
   │
   ▼
5. Generate Doctor Summary
   │
   ├─ POST /consultations/{id}/summary
   ├─ Combine: extraction + comparison + patient context
   ├─ Ollama/Qwen3 summary
   ├─ Save: doctor_summaries
   │
   ▼
6. Generate SOAP Note
   │
   ├─ POST /clinical-notes/consultations/{id}/generate-soap
   ├─ Ollama/Qwen3 SOAP generation
   ├─ Create: clinical_note (v1, draft)
   │
   ▼
7. Doctor Reviews & Edits
   │
   ├─ PATCH /clinical-notes/{id}
   ├─ Create: v2 (doctor_edited)
   │
   ▼
8. Doctor Approves
   │
   ├─ POST /clinical-notes/{id}/approve
   ├─ Create: v3 (doctor_approved, append-only)
   ├─ Timeline event: "Clinical note approved"
```

---

## Deployment

### Development

```bash
# Start all services
docker-compose up -d

# Frontend (Next.js)
npm run dev

# Backend (FastAPI)
npm run api:dev

# Local AI
ollama serve  # Qwen3 8B
```

### Production (Future - Phase 9)

```
┌─────────────────────────────────────────────────────────┐
│                      Load Balancer                       │
│                    (AWS ALB / Nginx)                     │
└────────────┬────────────────────────────────────────────┘
             │
    ┌────────┴────────┐
    │                 │
┌───▼────┐      ┌────▼────┐
│ Next.js│      │ FastAPI │
│ (ECS)  │      │ (ECS)   │
└───┬────┘      └────┬────┘
    │                │
    │                ├─────► Ollama (ECS/EC2 GPU)
    │                │
    └────────┬───────┘
             │
    ┌────────▼────────┐
    │  Supabase       │
    │  (Managed)      │
    │  - Auth         │
    │  - PostgreSQL   │
    │  - Storage      │
    └─────────────────┘
```

### Environment Variables

#### Backend (`.env`)
```bash
# Database
DATABASE_URL=postgresql://...
DATABASE_POOL_MIN_SIZE=5
DATABASE_POOL_MAX_SIZE=20

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx  # Never expose to frontend
SUPABASE_JWT_SECRET=xxx

# AI Providers
OPENAI_API_KEY=sk-xxx  # Optional fallback
OLLAMA_BASE_URL=http://localhost:11434

# HuggingFace (for IndicConformer)
HF_TOKEN=hf_xxx

# App
ENVIRONMENT=local|staging|production
LOG_LEVEL=INFO
CORS_ORIGINS=http://localhost:3000
```

#### Frontend (`.env.local`)
```bash
# Public (browser-exposed)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx  # Safe to expose (RLS enforced)
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## Performance Considerations

### Backend
- **Connection Pooling**: asyncpg pool (5-20 connections)
- **Lazy Loading**: AI models loaded on first use
- **Caching**: Model weights cached in memory
- **Async I/O**: All I/O operations are async (FastAPI + asyncpg)

### Frontend
- **Code Splitting**: Automatic with Next.js App Router
- **Image Optimization**: Next.js Image component
- **Prefetching**: TanStack Query prefetches on hover
- **Streaming**: React Suspense for progressive rendering

### Database
- **Indexes**: 
  - B-tree on foreign keys, search fields
  - HNSW on embedding vectors
  - GIN on tsvector (full-text search)
  - Trigram on patient names
- **Materialized Views**: None yet (future optimization)

### AI Inference
- **Model Caching**: Models stay in memory after first load
- **Batch Processing**: Future optimization for multiple requests
- **GPU Acceleration**: Optional for Ollama (CUDA/Metal)

---

## Monitoring & Observability

### Logging
- **Structured Logging**: JSON format (structlog)
- **Request IDs**: Trace requests across services
- **Audit Logging**: All clinical actions logged

### Health Checks
- `GET /health/live` - Liveness (never touches dependencies)
- `GET /health/ready` - Readiness (checks DB, AI services)

### Metrics (Future)
- Request latency (p50, p95, p99)
- Error rates
- AI inference time
- Database query performance

---

## Future Enhancements (Phase 9+)

1. **Production Hardening**
   - Rate limiting
   - Request throttling
   - Circuit breakers
   - Retry logic with exponential backoff

2. **Background Jobs**
   - Celery/RQ for async processing
   - Scheduled tasks (cleanup, reports)
   - Batch embedding generation

3. **Advanced AI**
   - Fine-tuned models for clinical domain
   - Multi-modal (images, lab results)
   - Predictive analytics

4. **Compliance**
   - HIPAA compliance audit
   - GDPR data export/deletion
   - Audit trail export

5. **Scalability**
   - Read replicas
   - Caching layer (Redis)
   - CDN for static assets
   - Horizontal scaling (ECS/K8s)

---

## References

- [PRD.md](./PRD.md) - Product Requirements Document
- [AGENTS.md](./AGENTS.md) - Development Notes
- [README.md](./README.md) - Project Overview

---

**Last Updated**: 2026-09-02  
**Version**: 1.1.0  
**Phases Completed**: 1-8 (Local AI Integration + UI Enhancements)
