"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import type { CreatePatientRequest } from "@clinical-copilot/shared-types";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api/client";
import { createPatientApi } from "@/lib/api/patients";

const patientSchema = z.object({
  first_name: z.string().min(1, "First name is required").max(200),
  last_name: z.string().min(1, "Last name is required").max(200),
  date_of_birth: z.string().nullable().optional(),
  sex: z.enum(["male", "female", "other", "unknown"]),
  phone: z.string().nullable().optional(),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  address: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  postal_code: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  emergency_contact_name: z.string().nullable().optional(),
  emergency_contact_phone: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

type PatientForm = z.infer<typeof patientSchema>;

export default function NewPatientPage() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PatientForm, unknown, PatientForm>({
    resolver: zodResolver(patientSchema),
    mode: "onBlur",
    defaultValues: {
      sex: "unknown",
      date_of_birth: null,
      phone: null,
      address: null,
      city: null,
      state: null,
      postal_code: null,
      country: null,
      emergency_contact_name: null,
      emergency_contact_phone: null,
      notes: null,
      email: "",
    },
  });

  const onSubmit = handleSubmit((data) => {
    setIsPending(true);
    const payload: CreatePatientRequest = {
      first_name: data.first_name,
      last_name: data.last_name,
      date_of_birth: data.date_of_birth || null,
      sex: data.sex,
      phone: data.phone ?? null,
      email: data.email || null,
      address: data.address ?? null,
      city: data.city ?? null,
      state: data.state ?? null,
      postal_code: data.postal_code ?? null,
      country: data.country ?? null,
      emergency_contact_name: data.emergency_contact_name ?? null,
      emergency_contact_phone: data.emergency_contact_phone ?? null,
      notes: data.notes ?? null,
    };
    createPatientApi(payload)
      .then((patient) => {
        toast.success("Patient created");
        router.push(`/dashboard/patients/${patient.id}`);
        router.refresh();
      })
      .catch((error) => {
        toast.error(
          error instanceof ApiError ? error.message : "Something went wrong",
        );
      })
      .finally(() => setIsPending(false));
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">New patient</h1>
        <p className="text-sm text-muted-foreground">
          Create a new patient record.
        </p>
      </div>

      <Card>
        <form onSubmit={onSubmit}>
          <CardHeader>
            <CardTitle>Patient details</CardTitle>
            <CardDescription>
              Basic demographic and contact information.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="first_name">First name *</Label>
                <Input
                  id="first_name"
                  type="text"
                  autoFocus
                  {...register("first_name")}
                  aria-invalid={!!errors.first_name}
                />
                {errors.first_name && (
                  <p className="text-xs text-destructive">
                    {errors.first_name.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="last_name">Last name *</Label>
                <Input
                  id="last_name"
                  type="text"
                  {...register("last_name")}
                  aria-invalid={!!errors.last_name}
                />
                {errors.last_name && (
                  <p className="text-xs text-destructive">
                    {errors.last_name.message}
                  </p>
                )}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="date_of_birth">Date of birth</Label>
                <Input
                  id="date_of_birth"
                  type="date"
                  {...register("date_of_birth")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sex">Sex</Label>
                <select
                  id="sex"
                  {...register("sex")}
                  className="flex h-8 w-full rounded-lg border bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="unknown">Unknown</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" type="tel" {...register("phone")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  {...register("email")}
                  aria-invalid={!!errors.email}
                />
                {errors.email && (
                  <p className="text-xs text-destructive">
                    {errors.email.message}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input id="address" type="text" {...register("address")} />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input id="city" type="text" {...register("city")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="state">State/Province</Label>
                <Input id="state" type="text" {...register("state")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="postal_code">Postal code</Label>
                <Input
                  id="postal_code"
                  type="text"
                  {...register("postal_code")}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="emergency_contact_name">
                  Emergency contact name
                </Label>
                <Input
                  id="emergency_contact_name"
                  type="text"
                  {...register("emergency_contact_name")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="emergency_contact_phone">
                  Emergency contact phone
                </Label>
                <Input
                  id="emergency_contact_phone"
                  type="tel"
                  {...register("emergency_contact_phone")}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <textarea
                id="notes"
                {...register("notes")}
                className="flex min-h-20 w-full rounded-lg border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </CardContent>
          <CardContent className="flex gap-3">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating…" : "Create patient"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
            >
              Cancel
            </Button>
          </CardContent>
        </form>
      </Card>
    </div>
  );
}
