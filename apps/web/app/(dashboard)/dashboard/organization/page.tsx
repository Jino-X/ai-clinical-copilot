"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2 } from "lucide-react";

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
import { PageHeader } from "@/components/clinical";
import { ApiError } from "@/lib/api/client";
import {
  createOrganizationApi,
  getCurrentUserApi,
  updateOrganizationApi,
} from "@/lib/api/client-auth";

const renameSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(200),
});

type RenameForm = z.infer<typeof renameSchema>;

export default function OrganizationPage() {
  const queryClient = useQueryClient();
  const [, startTransition] = useTransition();

  const { data: me } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: getCurrentUserApi,
  });

  const activeOrg = me?.memberships.find(
    (m) => m.organization_id === me.active_organization_id,
  );
  const orgId = activeOrg?.organization_id ?? null;
  const orgName = activeOrg?.organization_name ?? null;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RenameForm>({
    resolver: zodResolver(renameSchema),
    mode: "onBlur",
    defaultValues: { name: orgName ?? "" },
  });

  const renameMutation = useMutation({
    mutationFn: (name: string) => updateOrganizationApi(orgId!, name),
    onSuccess: (updated) => {
      queryClient.setQueryData(
        ["auth", "me"],
        (prev: { memberships: { organization_id: string; organization_name: string }[] } | undefined) => {
          if (!prev) return prev;
          return {
            ...prev,
            memberships: prev.memberships.map((m) =>
              m.organization_id === updated.id
                ? { ...m, organization_name: updated.name }
                : m,
            ),
          };
        },
      );
      toast.success("Organization renamed");
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiError ? error.message : "Something went wrong",
      );
    },
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => createOrganizationApi(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      toast.success("Organization created");
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiError ? error.message : "Something went wrong",
      );
    },
  });

  const onSubmit = handleSubmit((data) => {
    if (orgId) {
      startTransition(() => renameMutation.mutate(data.name));
    } else {
      startTransition(() => createMutation.mutate(data.name));
    }
  });

  const pending = renameMutation.isPending || createMutation.isPending;

  // No organization yet — show create form
  if (!orgId) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <PageHeader
          title="Create Organization"
          description="Set up your clinic or practice workspace"
          icon={Building2}
        />
        <Card>
          <form onSubmit={onSubmit}>
            <CardHeader>
              <CardTitle>Organization details</CardTitle>
              <CardDescription>
                This name appears across your workspace and cannot be changed
                easily later.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Organization name</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="e.g. Chennai Medical Clinic"
                  {...register("name")}
                  aria-invalid={!!errors.name}
                />
                {errors.name && (
                  <p className="text-xs text-destructive">
                    {errors.name.message}
                  </p>
                )}
              </div>
              <Button type="submit" disabled={pending}>
                {pending ? "Creating…" : "Create organization"}
              </Button>
            </CardContent>
          </form>
        </Card>
      </div>
    );
  }

  // Existing organization — show rename form
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Organization"
        description={orgName ?? "Loading…"}
        icon={Building2}
      />

      <Card>
        <form onSubmit={onSubmit}>
          <CardHeader>
            <CardTitle>Rename organization</CardTitle>
            <CardDescription>
              This name appears across your workspace.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Organization name</Label>
              <Input
                id="name"
                type="text"
                defaultValue={orgName ?? ""}
                {...register("name")}
                aria-invalid={!!errors.name}
              />
              {errors.name && (
                <p className="text-xs text-destructive">
                  {errors.name.message}
                </p>
              )}
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </CardContent>
        </form>
      </Card>
    </div>
  );
}
