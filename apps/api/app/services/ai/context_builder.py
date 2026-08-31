from __future__ import annotations

from uuid import UUID

import asyncpg

from app.repositories.clinical_notes import ClinicalNoteRepository
from app.repositories.consultations import ConsultationRepository
from app.repositories.patients import PatientRepository


class PatientContextBuilder:
    """Aggregates patient records into a text context for the LLM.

    This is the boundary between structured database records and the free-text
    prompt. It assembles a comprehensive view of the patient's history so the
    LLM can answer questions, generate summaries, and compare visits using
    only authorized patient records (PRD §8).
    """

    def __init__(self) -> None:
        self._patient_repo = PatientRepository()
        self._consultation_repo = ConsultationRepository()
        self._note_repo = ClinicalNoteRepository()

    async def build_full_context(
        self, connection: asyncpg.Connection, *, patient_id: UUID
    ) -> str:
        """Build a comprehensive text context for a patient."""
        patient = await self._patient_repo.get(connection, patient_id=patient_id)
        if patient is None:
            return "Patient not found."

        sections: list[str] = []

        # Patient demographics
        sections.append(
            f"Patient: {patient.first_name} {patient.last_name}\n"
            f"DOB: {patient.date_of_birth or 'Unknown'}\n"
            f"Sex: {patient.sex or 'Unknown'}"
        )

        # Conditions
        conditions = await self._patient_repo.list_conditions(
            connection, patient_id=patient_id
        )
        if conditions:
            lines = ["Active conditions:"]
            for c in conditions:
                status = c.status if c.status else "unknown"
                lines.append(f"  - {c.condition_name} (status: {status})")
            sections.append("\n".join(lines))
        else:
            sections.append("Active conditions: None recorded.")

        # Medications
        medications = await self._patient_repo.list_medications(
            connection, patient_id=patient_id
        )
        if medications:
            lines = ["Current medications:"]
            for m in medications:
                status = m.status if m.status else "unknown"
                med_line = f"  - {m.medication_name}"
                if m.dosage:
                    med_line += f" ({m.dosage})"
                med_line += f" [status: {status}]"
                lines.append(med_line)
            sections.append("\n".join(lines))
        else:
            sections.append("Current medications: None recorded.")

        # Allergies
        allergies = await self._patient_repo.list_allergies(
            connection, patient_id=patient_id
        )
        if allergies:
            lines = ["Allergies:"]
            for a in allergies:
                severity = a.severity if a.severity else "unknown"
                lines.append(f"  - {a.allergen} (severity: {severity})")
            sections.append("\n".join(lines))
        else:
            sections.append("Allergies: None recorded.")

        # Timeline
        timeline = await self._patient_repo.list_timeline(
            connection, patient_id=patient_id
        )
        if timeline:
            lines = ["Timeline events:"]
            for t in timeline[:20]:  # Cap to keep prompt manageable
                lines.append(
                    f"  - {t.event_date}: {t.title}"
                    + (f" ({t.description})" if t.description else "")
                )
            sections.append("\n".join(lines))

        # Consultations and clinical notes
        consultations = await self._consultation_repo.list_for_patient(
            connection, patient_id=patient_id, limit=10
        )
        if consultations:
            lines = ["Recent consultations:"]
            for c in consultations:
                lines.append(
                    f"  - {c.created_at[:10]}: "
                    f"{c.chief_complaint or 'No chief complaint'} "
                    f"(status: {c.status})"
                )
            sections.append("\n".join(lines))

            # Add clinical note content for each consultation
            for c in consultations[:5]:
                note = await self._note_repo.get_by_consultation(
                    connection, consultation_id=c.id
                )
                if note and note.latest_version:
                    v = note.latest_version
                    lines = [
                        f"Clinical note for {c.created_at[:10]} "
                        f"(version {v.version}, status: {note.status}):",
                    ]
                    if v.subjective:
                        lines.append(f"  Subjective: {v.subjective}")
                    if v.objective:
                        lines.append(f"  Objective: {v.objective}")
                    if v.assessment:
                        lines.append(f"  Assessment: {v.assessment}")
                    if v.plan:
                        lines.append(f"  Plan: {v.plan}")
                    if v.follow_up:
                        lines.append(f"  Follow-up: {v.follow_up}")
                    sections.append("\n".join(lines))

        return "\n\n".join(sections)

    async def build_consultation_context(
        self,
        connection: asyncpg.Connection,
        *,
        consultation_id: UUID,
    ) -> str:
        """Build a text context for a single consultation and its note."""
        consultation = await self._consultation_repo.get(
            connection, consultation_id=consultation_id
        )
        if consultation is None:
            return "Consultation not found."

        sections: list[str] = [
            f"Consultation date: {consultation.created_at[:10]}",
            f"Chief complaint: {consultation.chief_complaint or 'Not recorded'}",
            f"Status: {consultation.status}",
        ]

        if consultation.doctor_summary:
            sections.append(f"Doctor summary: {consultation.doctor_summary}")

        note = await self._note_repo.get_by_consultation(
            connection, consultation_id=consultation_id
        )
        if note and note.latest_version:
            v = note.latest_version
            sections.append(f"Clinical note (version {v.version}):")
            if v.subjective:
                sections.append(f"  Subjective: {v.subjective}")
            if v.objective:
                sections.append(f"  Objective: {v.objective}")
            if v.assessment:
                sections.append(f"  Assessment: {v.assessment}")
            if v.plan:
                sections.append(f"  Plan: {v.plan}")
            if v.follow_up:
                sections.append(f"  Follow-up: {v.follow_up}")

        return "\n".join(sections)
