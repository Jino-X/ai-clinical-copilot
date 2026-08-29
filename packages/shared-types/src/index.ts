/**
 * Types shared by the Next.js app and the FastAPI contract.
 *
 * These mirror the Pydantic schemas in `apps/api/app/schemas`. They are kept
 * deliberately small: only the API envelope and cross-cutting domain enums
 * belong here. Feature-specific types live with the feature.
 */

export * from "./api";
