"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Search, UserPlus, User } from "lucide-react";
import type { PatientSummary } from "@clinical-copilot/shared-types";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { listPatientsApi, searchPatientsApi } from "@/lib/api/patients";

export default function PatientsPage() {
  const [query, setQuery] = useState("");

  const { data: allPatients, isLoading: loadingAll } = useQuery({
    queryKey: ["patients", "list"],
    queryFn: () => listPatientsApi(),
  });

  const { data: searchResults, isLoading: loadingSearch } = useQuery({
    queryKey: ["patients", "search", query],
    queryFn: () => searchPatientsApi(query),
    enabled: query.length >= 1,
  });

  const patients: PatientSummary[] = query
    ? (searchResults ?? [])
    : (allPatients ?? []);
  const isLoading = query ? loadingSearch : loadingAll;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Patients</h1>
          <p className="text-sm text-muted-foreground">
            Search and manage patient records.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/patients/new">
            <UserPlus className="size-4" aria-hidden />
            New patient
          </Link>
        </Button>
      </div>

      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          placeholder="Search by name..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            {query ? "Search results" : "All patients"} ({patients.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {isLoading ? (
            <p className="py-4 text-sm text-muted-foreground">Loading…</p>
          ) : patients.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              {query
                ? "No patients found. Try a different search."
                : "No patients yet. Create one to get started."}
            </p>
          ) : (
            patients.map((patient) => (
              <Link
                key={patient.id}
                href={`/dashboard/patients/${patient.id}`}
                className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-muted"
              >
                <div className="flex size-8 items-center justify-center rounded-full bg-muted">
                  <User className="size-4 text-muted-foreground" aria-hidden />
                </div>
                <div className="flex-1 space-y-0.5">
                  <p className="text-sm font-medium">
                    {patient.last_name}, {patient.first_name}
                  </p>
                  {patient.date_of_birth && (
                    <p className="text-xs text-muted-foreground">
                      DOB: {patient.date_of_birth}
                    </p>
                  )}
                </div>
                <Badge variant="outline" className="text-xs capitalize">
                  {patient.sex}
                </Badge>
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
