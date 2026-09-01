"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Search, UserPlus, Users, SearchX } from "lucide-react";
import type { PatientSummary } from "@clinical-copilot/shared-types";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  PageHeader,
  PatientAvatar,
  EmptyState,
  ListSkeleton,
  AnimatedSection,
} from "@/components/clinical";
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
    <div className="space-y-6">
      <PageHeader
        title="Patients"
        description="Search and manage patient records"
        icon={Users}
        actions={
          <Button asChild>
            <Link href="/dashboard/patients/new">
              <UserPlus className="size-4" aria-hidden />
              New patient
            </Link>
          </Button>
        }
      />

      {/* Search bar */}
      <AnimatedSection animation="fade-in-down" delay={50}>
        <div className="relative">
          <Search
            className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            placeholder="Search by name..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-11 pl-10 transition-smooth focus-visible:ring-2 focus-visible:ring-primary/30"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-8 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground transition-smooth"
            >
              Clear
            </button>
          )}
        </div>
      </AnimatedSection>

      {/* Results */}
      <Card className="border-border/60">
        <CardContent className="p-0">
          {/* Results header */}
          <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
            <p className="text-sm font-medium">
              {query ? "Search results" : "All patients"}
            </p>
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              {patients.length}
            </span>
          </div>

          {/* Results list */}
          <div className="p-2">
            {isLoading ? (
              <div className="p-3">
                <ListSkeleton count={5} />
              </div>
            ) : patients.length === 0 ? (
              <EmptyState
                icon={query ? SearchX : Users}
                title={query ? "No patients found" : "No patients yet"}
                description={
                  query
                    ? "Try a different search term."
                    : "Create one to get started."
                }
                action={
                  !query && (
                    <Button asChild size="sm">
                      <Link href="/dashboard/patients/new">
                        <UserPlus className="size-3.5" aria-hidden />
                        Create patient
                      </Link>
                    </Button>
                  )
                }
              />
            ) : (
              <div className="space-y-0.5">
                {patients.map((patient, i) => (
                  <Link
                    key={patient.id}
                    href={`/dashboard/patients/${patient.id}`}
                    className="group flex animate-fade-in-up items-center gap-3 rounded-lg px-3 py-2.5 opacity-0 transition-smooth hover:bg-accent/50"
                    style={{ animationDelay: `${i * 40}ms` }}
                  >
                    <PatientAvatar
                      firstName={patient.first_name}
                      lastName={patient.last_name}
                      sex={patient.sex}
                      size="md"
                    />
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="truncate text-sm font-medium group-hover:text-primary transition-smooth">
                        {patient.last_name}, {patient.first_name}
                      </p>
                      {patient.date_of_birth && (
                        <p className="text-xs text-muted-foreground">
                          DOB: {patient.date_of_birth}
                        </p>
                      )}
                    </div>
                    <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium capitalize text-muted-foreground">
                      {patient.sex}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
