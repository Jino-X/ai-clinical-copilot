"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

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
import {
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
  const canUpdate = me?.permissions.includes("organization:update") ?? false;

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

  const onSubmit = handleSubmit((data) => {
    if (!orgId) return;
    startTransition(() => renameMutation.mutate(data.name));
  });

  const pending = renameMutation.isPending;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Organization</h1>
        <p className="text-sm text-muted-foreground">
          {orgName ?? "Loading…"}
        </p>
      </div>

      {canUpdate ? (
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
      ) : (
        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-muted-foreground">
              You do not have permission to rename this organization. Ask an
              admin or owner.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
