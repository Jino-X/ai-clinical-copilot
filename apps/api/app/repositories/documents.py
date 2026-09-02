from __future__ import annotations

import json
from typing import Any
from uuid import UUID

import asyncpg

from app.schemas.documents import (
    DocumentCategory,
    DocumentStatus,
    MedicalDocumentResponse,
    MedicalDocumentSummary,
)


def _parse_doc_row(row: asyncpg.Record) -> dict[str, Any]:
    """Convert an asyncpg Record to a dict, parsing JSONB strings to dicts.

    asyncpg may return JSONB columns as JSON strings instead of dicts.
    MedicalDocumentResponse expects extracted_data as a dict.
    """
    data = dict(row)
    ed = data.get("extracted_data")
    if isinstance(ed, str):
        data["extracted_data"] = json.loads(ed)
    return data


def _validate_doc(
    row: asyncpg.Record | None,
) -> MedicalDocumentResponse | None:
    """Validate a document row, returning None if the row is None."""
    if row is None:
        return None
    return MedicalDocumentResponse.model_validate(_parse_doc_row(row))


_DOC_COLUMNS = """
  id, organization_id, patient_id, uploaded_by, title, storage_path,
  file_name, content_type, file_size_bytes, status::text as status,
  category::text as category, extracted_text, extracted_data,
  extraction_provider, extraction_model, verified_by,
  verified_at::text as verified_at, error_message,
  created_at::text as created_at, updated_at::text as updated_at
"""

_DOC_SUMMARY_COLUMNS = """
  id, patient_id, title, file_name, content_type,
  status::text as status, category::text as category,
  verified_at::text as verified_at, created_at::text as created_at
"""


class DocumentRepository:
    """Reads and writes `public.medical_documents`.

    Every method takes a tenant connection so RLS is in force. The
    `organization_id` and `uploaded_by` are set from the authenticated
    context, never from the request body (PRD §18).
    """

    async def create(
        self,
        connection: asyncpg.Connection,
        *,
        organization_id: UUID,
        patient_id: UUID,
        uploaded_by: UUID,
        title: str,
        storage_path: str,
        file_name: str,
        content_type: str,
        file_size_bytes: int,
        document_id: UUID | None = None,
    ) -> MedicalDocumentResponse:
        if document_id is not None:
            row = await connection.fetchrow(
                f"""
                insert into public.medical_documents
                  (id, organization_id, patient_id, uploaded_by, title,
                   storage_path, file_name, content_type, file_size_bytes)
                values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                returning {_DOC_COLUMNS}
                """,
                document_id,
                organization_id,
                patient_id,
                uploaded_by,
                title,
                storage_path,
                file_name,
                content_type,
                file_size_bytes,
            )
        else:
            row = await connection.fetchrow(
                f"""
                insert into public.medical_documents
                  (organization_id, patient_id, uploaded_by, title, storage_path,
                   file_name, content_type, file_size_bytes)
                values ($1, $2, $3, $4, $5, $6, $7, $8)
                returning {_DOC_COLUMNS}
                """,
                organization_id,
                patient_id,
                uploaded_by,
                title,
                storage_path,
                file_name,
                content_type,
                file_size_bytes,
            )
        return _validate_doc(row)

    async def get(
        self, connection: asyncpg.Connection, *, document_id: UUID
    ) -> MedicalDocumentResponse | None:
        row = await connection.fetchrow(
            f"select {_DOC_COLUMNS} from public.medical_documents where id = $1",
            document_id,
        )
        return _validate_doc(row)

    async def update(
        self,
        connection: asyncpg.Connection,
        *,
        document_id: UUID,
        title: str | None = None,
        category: DocumentCategory | None = None,
    ) -> MedicalDocumentResponse | None:
        row = await connection.fetchrow(
            f"""
            update public.medical_documents set
              title = coalesce($2, title),
              category = coalesce($3, category)
            where id = $1
            returning {_DOC_COLUMNS}
            """,
            document_id,
            title,
            category.value if category else None,
        )
        return _validate_doc(row)

    async def update_status(
        self,
        connection: asyncpg.Connection,
        *,
        document_id: UUID,
        status: DocumentStatus,
        error_message: str | None = None,
    ) -> MedicalDocumentResponse | None:
        row = await connection.fetchrow(
            f"""
            update public.medical_documents
               set status = $2,
                   error_message = $3
             where id = $1
            returning {_DOC_COLUMNS}
            """,
            document_id,
            status.value,
            error_message,
        )
        return _validate_doc(row)

    async def update_extraction(
        self,
        connection: asyncpg.Connection,
        *,
        document_id: UUID,
        extracted_text: str | None = None,
        extracted_data: dict | None = None,
        category: DocumentCategory | None = None,
        provider: str | None = None,
        model: str | None = None,
    ) -> MedicalDocumentResponse | None:
        row = await connection.fetchrow(
            f"""
            update public.medical_documents
               set extracted_text = coalesce($2, extracted_text),
                   extracted_data = coalesce($3::jsonb, extracted_data),
                   category = coalesce($4, category),
                   extraction_provider = coalesce($5, extraction_provider),
                   extraction_model = coalesce($6, extraction_model),
                   status = 'extracted'
             where id = $1
            returning {_DOC_COLUMNS}
            """,
            document_id,
            extracted_text,
            json.dumps(extracted_data) if extracted_data else None,
            category.value if category else None,
            provider,
            model,
        )
        return _validate_doc(row)

    async def verify(
        self,
        connection: asyncpg.Connection,
        *,
        document_id: UUID,
        verified_by: UUID,
        category: DocumentCategory | None = None,
        extracted_data: dict | None = None,
    ) -> MedicalDocumentResponse | None:
        row = await connection.fetchrow(
            f"""
            update public.medical_documents
               set status = 'verified',
                   verified_by = $2,
                   verified_at = now(),
                   category = coalesce($3, category),
                   extracted_data = coalesce($4::jsonb, extracted_data)
             where id = $1
            returning {_DOC_COLUMNS}
            """,
            document_id,
            verified_by,
            category.value if category else None,
            json.dumps(extracted_data) if extracted_data else None,
        )
        return _validate_doc(row)

    async def delete(
        self,
        connection: asyncpg.Connection,
        *,
        document_id: UUID,
    ) -> str | None:
        """Delete a document row. Returns its storage_path if deleted, else None.

        The caller is responsible for removing the object from Supabase
        Storage using the returned path.
        """
        row = await connection.fetchrow(
            "delete from public.medical_documents where id = $1 "
            "returning storage_path",
            document_id,
        )
        if row is None:
            return None
        return row["storage_path"]

    async def list_for_patient(
        self,
        connection: asyncpg.Connection,
        *,
        patient_id: UUID,
        limit: int = 50,
        offset: int = 0,
    ) -> list[MedicalDocumentSummary]:
        rows = await connection.fetch(
            f"""
            select {_DOC_SUMMARY_COLUMNS}
              from public.medical_documents
             where patient_id = $1
             order by created_at desc
             limit $2 offset $3
            """,
            patient_id,
            limit,
            offset,
        )
        return [MedicalDocumentSummary.model_validate(dict(row)) for row in rows]

    async def list_for_organization(
        self,
        connection: asyncpg.Connection,
        *,
        organization_id: UUID,
        limit: int = 50,
        offset: int = 0,
    ) -> list[MedicalDocumentSummary]:
        rows = await connection.fetch(
            f"""
            select {_DOC_SUMMARY_COLUMNS}
              from public.medical_documents
             where organization_id = $1
             order by created_at desc
             limit $2 offset $3
            """,
            organization_id,
            limit,
            offset,
        )
        return [MedicalDocumentSummary.model_validate(dict(row)) for row in rows]
