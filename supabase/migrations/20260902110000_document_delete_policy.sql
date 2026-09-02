-- Add DELETE policy for medical_documents.
--
-- The original documents migration intentionally omitted a DELETE policy
-- ("documents are medical records and should not be deleted"). In practice
-- doctors need to remove uploaded drafts / duplicate uploads, so we add a
-- scoped DELETE policy: only organization members can delete, and only the
-- uploading doctor (or any org member, since this is a doctor-only app with
-- no extra roles) can remove a document.

drop policy if exists medical_documents_delete_members on public.medical_documents;
create policy medical_documents_delete_members
  on public.medical_documents for delete
  to authenticated
  using (public.is_org_member(organization_id));
