# AI Clinical Copilot

> **AI prepares everything. The doctor makes the final decision.**

An AI-powered clinical documentation assistant that reduces the time doctors spend on administrative tasks. The system captures patient consultations via audio recording, transcribes them, and generates structured SOAP notes while maintaining strict clinical safety standards.

[![CI](https://github.com/your-org/clinical-copilot/workflows/CI/badge.svg)](https://github.com/your-org/clinical-copilot/actions)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

---

## 📋 Table of Contents

- [Features](#-features)
- [Status](#-status)
- [Quick Start](#-quick-start)
- [Architecture](#-architecture)
- [Technology Stack](#-technology-stack)
- [Development](#-development)
- [Testing](#-testing)
- [Security](#-security)
- [Documentation](#-documentation)

---

## ✨ Features

### Core Functionality
- **🎙️ Audio Recording & Transcription**: Browser-based audio capture with AI transcription (IndicConformer STT)
- **🌐 Multilingual Support**: Tamil-to-English translation for Indian healthcare settings
- **📝 SOAP Note Generation**: AI-generated clinical documentation drafts with doctor review/approval workflow
- **👤 Patient Management**: Comprehensive patient records with medical history, conditions, medications, allergies
- **🏥 Consultation Sessions**: State-managed consultation workflow with patient consent tracking

### AI-Powered Intelligence
- **🔍 Clinical Information Extraction**: Structured extraction of symptoms, conditions, medications from conversations
- **📊 Visit Comparison**: Compare current visit with previous consultations to identify changes
- **💡 Patient Summaries**: AI-generated patient summaries with source references
- **🔎 RAG-based Search**: Vector similarity search across patient records with hybrid retrieval (local nomic-embed-text embeddings)
- **📄 Document Processing**: Upload, extract, verify, and delete medical documents (DOCX, PDF, TXT)

### UI/UX
- **✨ Smooth Animations**: Framer Motion-powered transitions, staggered list animations, tab transitions
- **🎨 Enhanced Patient Detail**: Animated header with quick stats, color-coded timeline, summary mini-cards
- **💀 Confirmation Dialogs**: Reusable confirm dialog for destructive actions (delete patient/document)
- **⏳ Skeleton Loaders**: Loading state placeholders for better perceived performance

### Clinical Safety
- **✅ Doctor Approval Required**: All AI output is a draft until explicitly approved
- **📚 Version Control**: Clinical notes are versioned (v1: AI-generated, v2: doctor-edited, v3: approved)
- **🔒 Append-Only Approved Notes**: Approved clinical notes cannot be modified
- **📜 Audit Trail**: Complete audit logging of all clinical actions
- **🎯 Source References**: All AI-generated content includes source references

---

## 🚀 Status

**Current Phase**: Phase 8 Complete + Local AI Integration + UI Enhancements

### ✅ Completed Features

- [x] **Phase 1**: Monorepo foundation, Next.js + FastAPI setup, Docker, CI/CD
- [x] **Phase 2**: Supabase Auth, organizations, role-based permissions, RLS policies
- [x] **Phase 3**: Patient CRUD, medical history, timeline, trigram search
- [x] **Phase 4**: Consultation sessions, consent tracking, audio recording, Supabase Storage
- [x] **Phase 5**: AI transcription, SOAP generation, doctor editing/approval workflow
- [x] **Phase 6**: Patient intelligence (summary, visit comparison, history Q&A)
- [x] **Phase 7**: Medical document management (upload, extraction, verification, deletion)
- [x] **Phase 8**: RAG (pgvector embeddings, hybrid retrieval, patient-scoped Q&A)
- [x] **Local AI Integration**: IndicConformer STT, Ollama/Qwen3 8B, Tamil→English pipeline
- [x] **Local Embeddings**: Ollama nomic-embed-text (768D) for fully local RAG
- [x] **Doctor-Only Simplification**: Removed complex role system, simplified to doctor-only access
- [x] **UI Enhancements**: Framer Motion animations, enhanced patient detail page, skeleton loaders
- [x] **Document Deletion**: Full delete workflow (storage + DB + audit) with confirmation dialog

### 🔜 Next Phase

- [ ] **Phase 9**: Production hardening (rate limiting, monitoring, compliance audit)

> ⚠️ **Warning**: This system is under active development. Do not use with real patient data.

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 20.9+ (developed on 24)
- **Python** 3.13
- **PostgreSQL** 15+ (or use Supabase)
- **Ollama** (for local AI) - [Install](https://ollama.com)
- **Docker** (optional)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/your-org/clinical-copilot.git
cd clinical-copilot

# 2. Install frontend dependencies (npm workspaces)
npm install

# 3. Set up environment files
cp apps/web/.env.example apps/web/.env.local
cp apps/api/.env.example apps/api/.env
# Edit the files and fill in your Supabase project values

# 4. Install backend dependencies
cd apps/api
python3.13 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
cd ../..

# 5. Set up local AI (optional, for development)
brew install ollama
ollama pull qwen3:8b          # LLM for clinical extraction, SOAP notes
ollama pull nomic-embed-text  # Embedding model for RAG search
ollama serve  # Keep running in a separate terminal
```

### Running the Application

**Two terminals:**

```bash
# Terminal 1: Frontend (Next.js)
npm run dev
# → http://localhost:3000

# Terminal 2: Backend (FastAPI)
npm run api:dev
# → http://localhost:8000
# → API docs: http://localhost:8000/docs
```

### First-Time Setup

1. **Sign up** at http://localhost:3000/signup
2. **Create an organization** (onboarding flow)
3. **Add test patients** using the seed script:
   ```bash
   cd apps/api
   .venv/bin/python ../scripts/seed_test_data.py
   ```
4. **Log in** with test doctor credentials:
   - Email: `dr.rajan@testclinic.dev`
   - Password: `TestDoctor123!`

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser (Client)                         │
│  Next.js 16 + React 19 + TanStack Query + shadcn/ui             │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTPS/REST + WebSocket (future)
┌────────────────────────▼────────────────────────────────────────┐
│                    Supabase Platform                             │
│  Auth (JWT) + PostgreSQL (RLS) + Storage (S3-like) + pgvector   │
└────────────────────────┬────────────────────────────────────────┘
                         │ JWT Verification (JWKS)
┌────────────────────────▼────────────────────────────────────────┐
│                  FastAPI Backend (Python 3.13)                   │
│  Routes → Services → Repositories → Database                     │
│  AI Providers: IndicConformer STT + Ollama/Qwen3 LLM            │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTP (local)
┌────────────────────────▼────────────────────────────────────────┐
│                    Local AI Services                             │
│  Ollama (Qwen3 8B) + IndicConformer (600M multilingual)         │
└─────────────────────────────────────────────────────────────────┘
```

**See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed system architecture.**

---

## 🛠️ Technology Stack

### Frontend
- **Framework**: Next.js 16 (App Router, Turbopack)
- **Language**: TypeScript 5
- **UI**: React 19 + Tailwind CSS + shadcn/ui (Radix Nova)
- **State**: TanStack Query (React Query)
- **Animations**: Framer Motion (page transitions, staggered lists, tab animations)
- **Forms**: React Hook Form + Zod
- **Audio**: Browser MediaRecorder API

### Backend
- **Framework**: FastAPI (Python 3.13)
- **Database**: PostgreSQL 15 + pgvector
- **Auth**: Supabase Auth (JWT + JWKS)
- **Storage**: Supabase Storage
- **Validation**: Pydantic v2
- **ORM**: Raw SQL with asyncpg

### AI/ML
- **STT**: AI4Bharat IndicConformer (600M multilingual)
- **LLM**: Ollama + Qwen3 8B (local inference)
- **Embeddings**: Ollama nomic-embed-text (768D, local)
- **Translation**: Ollama/Qwen3 (Tamil → English)
- **Audio**: torchaudio, torchcodec, ffmpeg
- **Document Extraction**: python-docx (DOCX), pypdf (PDF)

### Infrastructure
- **Containerization**: Docker + Docker Compose
- **CI/CD**: GitHub Actions
- **Monorepo**: npm workspaces

---

## 💻 Development

### Project Structure

```
clinical-copilot/
├── apps/
│   ├── api/              # FastAPI backend
│   │   ├── app/
│   │   │   ├── api/      # Routes
│   │   │   ├── core/     # Config, errors, middleware
│   │   │   ├── providers/# AI providers (STT, LLM, translation)
│   │   │   ├── repositories/  # Data access
│   │   │   ├── schemas/  # Pydantic models
│   │   │   └── services/ # Business logic
│   │   └── tests/
│   └── web/              # Next.js frontend
│       ├── app/          # App Router pages
│       ├── components/   # React components
│       └── lib/          # Utilities, API client
├── packages/
│   └── shared-types/     # Shared TypeScript types
├── supabase/
│   └── migrations/       # SQL migrations
├── scripts/              # Utility scripts
├── ARCHITECTURE.md       # System architecture
├── PRD.md               # Product requirements
└── AGENTS.md            # Development notes
```

### Local AI Setup

For development without OpenAI API (fully local AI):

```bash
# 1. Install and start Ollama
brew install ollama
ollama pull qwen3:8b          # LLM for extraction, SOAP, comparison
ollama pull nomic-embed-text  # Embedding model for RAG (768D)
ollama serve

# 2. Configure apps/api/.env
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen3:8b
EMBEDDING_PROVIDER=ollama
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
OLLAMA_EMBEDDING_DIMENSIONS=768
TRANSCRIPTION_PROVIDER=indicconformer
INDICCONFORMER_LANGUAGE=ta
TRANSLATION_PROVIDER=local

# 3. Install Python dependencies (already done if you followed Quick Start)
cd apps/api
.venv/bin/pip install torch torchaudio transformers onnxruntime torchcodec

# 4. Set HuggingFace token (for IndicConformer gated model)
# Visit https://huggingface.co/ai4bharat/indic-conformer-600m-multilingual
# Accept the license, then add to apps/api/.env:
HF_TOKEN=hf_your_token_here
```

### Database Migrations

Migrations are plain SQL files in `supabase/migrations/`, applied in filename order:

```bash
# Apply migrations manually
psql "$DATABASE_URL" -f supabase/migrations/20260830010000_init.sql
psql "$DATABASE_URL" -f supabase/migrations/20260830020000_auth.sql
# ... etc

# Or with Supabase CLI
supabase db push
```

### Available Commands

```bash
# Frontend
npm run dev          # Start Next.js dev server
npm run build        # Production build
npm run lint         # ESLint
npm run typecheck    # TypeScript check

# Backend
npm run api:dev      # Start FastAPI dev server
npm run api:lint     # Ruff linter
npm run api:format   # Ruff formatter
npm run api:typecheck # mypy (strict mode)
npm run api:test     # pytest

# Shared Types
npm run types:typecheck  # TypeScript check for shared types
```

---

## 🧪 Testing

### Run All Checks

```bash
# Frontend
npm run lint
npm run typecheck
npm run build

# Backend
npm run api:lint
npm run api:typecheck
npm run api:test

# Shared Types
npm run types:typecheck
```

### Test Data

Use the seed script to create test doctors and patients:

```bash
cd apps/api
.venv/bin/python ../scripts/seed_test_data.py
```

**Test Credentials:**
- Doctor 1: `dr.rajan@testclinic.dev` / `TestDoctor123!`
- Doctor 2: `dr.priya@testclinic.dev` / `TestDoctor123!`

**Test Patients:**
- Murugan Subramanian (with conditions, medications, allergies)
- Kavitha Ramanathan
- Anbu Arumugam

---

## 🔒 Security

### Authentication & Authorization
- **JWT-based auth** via Supabase Auth
- **Row-Level Security (RLS)** enforces tenant isolation at the database level
- **Doctor-only access**: Simplified permission model (all doctors have full clinical access)
- **Audit logging**: All clinical actions are logged with actor, timestamp, and metadata

### Data Protection
- **PHI Protection**: Never log clinical content, only identifiers (UUIDs, MRNs)
- **Secrets Management**: All secrets use `SecretStr` (redacted in logs)
- **Storage Security**: Private buckets with time-limited signed URLs
- **Clinical Safety**: AI output always requires doctor approval before becoming official

### Key Security Principles

1. **AI output is a draft** until a clinician approves it
2. **Never invent clinical data** — mark uncertainties explicitly
3. **Never accept `organization_id`, `patient_id`, or `doctor_id` from the client** — resolve from auth
4. **Never expose service-role key or AI provider keys** to the frontend
5. **Approved clinical notes are append-only** — changes create new versions
6. **Original audio and transcripts are never overwritten**

> ⚠️ **Important**: Security features alone do not constitute regulatory compliance. See [PRD.md](./PRD.md) §20 before using with real patient data.

---

## 📚 Documentation

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Comprehensive system architecture, data flow, and design decisions
- **[PRD.md](./PRD.md)** - Product requirements document (authoritative specification)
- **[AGENTS.md](./AGENTS.md)** - Development notes, commands, and working conventions
- **[API Docs](http://localhost:8000/docs)** - Interactive API documentation (when running locally)

### Key Workflows

#### Consultation Recording Flow
1. Doctor starts consultation → records patient consent
2. Browser captures audio via MediaRecorder
3. Audio uploaded to Supabase Storage (signed URL)
4. Doctor completes consultation

#### AI Documentation Flow
1. **Transcribe** audio (IndicConformer STT)
2. **Normalize** transcript (Tamil → English if needed)
3. **Extract** clinical information (symptoms, conditions, medications)
4. **Compare** with previous visits
5. **Generate** doctor summary
6. **Generate** SOAP note draft
7. **Doctor reviews** and edits
8. **Doctor approves** → becomes official clinical record

---

## 🤝 Contributing

This is a private project. For team members:

1. Read [AGENTS.md](./AGENTS.md) for development conventions
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Run all checks before committing: `npm run lint && npm run typecheck && npm run build`
4. Commit with descriptive messages
5. Push and create a pull request

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **AI4Bharat** for IndicConformer multilingual STT model
- **Alibaba Cloud** for Qwen3 open-source LLM
- **Ollama** for local LLM inference
- **Supabase** for managed PostgreSQL, Auth, and Storage
- **Vercel** for Next.js framework
- **FastAPI** for modern Python web framework

---

## 📞 Support

For questions or issues:
- Check [ARCHITECTURE.md](./ARCHITECTURE.md) for technical details
- Review [PRD.md](./PRD.md) for product requirements
- See [AGENTS.md](./AGENTS.md) for development notes

---

**Built with ❤️ for better healthcare documentation**
