from __future__ import annotations

from uuid import UUID

import asyncpg

from app.providers.embedding.base import EmbeddingProvider
from app.repositories.clinical_notes import ClinicalNoteRepository
from app.repositories.consultations import ConsultationRepository
from app.repositories.documents import DocumentRepository
from app.repositories.embeddings import EmbeddingRepository
from app.repositories.patients import PatientRepository


class EmbeddingService:
    """Generates and stores embeddings for patient records (PRD §10).

    Indexes the following record types:
    - consultations (chief complaint + doctor summary)
    - clinical notes (SOAP content)
    - documents (extracted text)
    - conditions, medications, allergies (medical history)

    Each chunk is embedded and stored with a reference to its source record
    so RAG answers can include source references (PRD §10).
    """

    def __init__(self, embedding_provider: EmbeddingProvider) -> None:
        self._provider = embedding_provider
        self._embedding_repo = EmbeddingRepository()
        self._patient_repo = PatientRepository()
        self._consultation_repo = ConsultationRepository()
        self._note_repo = ClinicalNoteRepository()
        self._document_repo = DocumentRepository()

    async def index_patient(
        self,
        connection: asyncpg.Connection,
        *,
        organization_id: UUID,
        patient_id: UUID,
    ) -> int:
        """Index all records for a patient. Returns the number of chunks
        embedded."""
        count = 0

        # --- Conditions ----------------------------------------------------
        conditions = await self._patient_repo.list_conditions(
            connection, patient_id=patient_id
        )
        for c in conditions:
            text = f"Condition: {c.condition_name}"
            if c.status:
                text += f" (status: {c.status})"
            if c.notes:
                text += f". Notes: {c.notes}"
            await self._store_embedding(
                connection,
                organization_id=organization_id,
                patient_id=patient_id,
                source_type="condition",
                source_id=c.id,
                source_label=f"Condition: {c.condition_name}",
                chunk_text=text,
            )
            count += 1

        # --- Medications ---------------------------------------------------
        medications = await self._patient_repo.list_medications(
            connection, patient_id=patient_id
        )
        for m in medications:
            text = f"Medication: {m.medication_name}"
            if m.dosage:
                text += f" (dosage: {m.dosage})"
            if m.status:
                text += f" [status: {m.status}]"
            await self._store_embedding(
                connection,
                organization_id=organization_id,
                patient_id=patient_id,
                source_type="medication",
                source_id=m.id,
                source_label=f"Medication: {m.medication_name}",
                chunk_text=text,
            )
            count += 1

        # --- Allergies -----------------------------------------------------
        allergies = await self._patient_repo.list_allergies(
            connection, patient_id=patient_id
        )
        for a in allergies:
            text = f"Allergy: {a.allergen}"
            if a.reaction:
                text += f" (reaction: {a.reaction})"
            if a.severity:
                text += f" [severity: {a.severity}]"
            await self._store_embedding(
                connection,
                organization_id=organization_id,
                patient_id=patient_id,
                source_type="allergy",
                source_id=a.id,
                source_label=f"Allergy: {a.allergen}",
                chunk_text=text,
            )
            count += 1

        # --- Consultations -------------------------------------------------
        consultations = await self._consultation_repo.list_for_patient(
            connection, patient_id=patient_id, limit=50
        )
        for c in consultations:
            text = f"Consultation on {c.created_at[:10]}: "
            text += c.chief_complaint or "No chief complaint recorded"
            if c.status:
                text += f" (status: {c.status})"
            await self._store_embedding(
                connection,
                organization_id=organization_id,
                patient_id=patient_id,
                source_type="consultation",
                source_id=c.id,
                source_label=f"Consultation {c.created_at[:10]}",
                chunk_text=text,
            )
            count += 1

        # --- Clinical notes ------------------------------------------------
        for c in consultations[:20]:
            note = await self._note_repo.get_by_consultation(
                connection, consultation_id=c.id
            )
            if note and note.latest_version:
                v = note.latest_version
                parts = [f"Clinical note (version {v.version}):"]
                if v.subjective:
                    parts.append(f"Subjective: {v.subjective}")
                if v.objective:
                    parts.append(f"Objective: {v.objective}")
                if v.assessment:
                    parts.append(f"Assessment: {v.assessment}")
                if v.plan:
                    parts.append(f"Plan: {v.plan}")
                if v.follow_up:
                    parts.append(f"Follow-up: {v.follow_up}")
                text = " ".join(parts)
                await self._store_embedding(
                    connection,
                    organization_id=organization_id,
                    patient_id=patient_id,
                    source_type="clinical_note",
                    source_id=note.id,
                    source_label=f"Clinical note for {c.created_at[:10]}",
                    chunk_text=text,
                )
                count += 1

        # --- Documents -----------------------------------------------------
        documents = await self._document_repo.list_for_patient(
            connection, patient_id=patient_id, limit=50
        )
        for d in documents:
            if d.status.value != "verified":
                continue
            doc = await self._document_repo.get(connection, document_id=d.id)
            if doc and doc.extracted_text:
                # Chunk the extracted text (max ~2000 chars per chunk).
                text = doc.extracted_text
                chunks = [text[i : i + 2000] for i in range(0, len(text), 2000)]
                for i, chunk in enumerate(chunks):
                    label = f"Document: {doc.title}"
                    if len(chunks) > 1:
                        label += f" (part {i + 1}/{len(chunks)})"
                    await self._store_embedding(
                        connection,
                        organization_id=organization_id,
                        patient_id=patient_id,
                        source_type="document",
                        source_id=doc.id,
                        source_label=label,
                        chunk_text=chunk,
                    )
                    count += 1

        return count

    async def _store_embedding(
        self,
        connection: asyncpg.Connection,
        *,
        organization_id: UUID,
        patient_id: UUID,
        source_type: str,
        source_id: UUID,
        source_label: str,
        chunk_text: str,
    ) -> None:
        # Delete existing embeddings for this source to avoid duplicates.
        await self._embedding_repo.delete_for_source(
            connection,
            source_type=source_type,
            source_id=source_id,
        )

        response = await self._provider.embed(text=chunk_text)
        await self._embedding_repo.store(
            connection,
            organization_id=organization_id,
            patient_id=patient_id,
            source_type=source_type,
            source_id=source_id,
            source_label=source_label,
            chunk_text=chunk_text,
            embedding=response.vector,
            provider=response.provider,
            model=response.model,
        )
