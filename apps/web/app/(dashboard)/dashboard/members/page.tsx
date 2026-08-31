"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { UserPlus, Trash2 } from "lucide-react";
import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { MemberResponse, OrganizationRole } from "@clinical-copilot/shared-types";

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
import { Separator } from "@/components/ui/separator";
import { ApiError } from "@/lib/api/client";
import {
  addMemberApi,
  getCurrentUserApi,
  listMembersApi,
  removeMemberApi,
  updateMemberRoleApi,
} from "@/lib/api/client-auth";

const inviteSchema = z.object({
  email: z.email("Enter a valid email address"),
  role: z.enum(["staff", "nurse", "doctor", "admin"]),
});

type InviteForm = z.infer<typeof inviteSchema>;

const ROLE_LABELS: Record<OrganizationRole, string> = {
  staff: "Staff",
  nurse: "Nurse",
  doctor: "Doctor",
  admin: "Admin",
  owner: "Owner",
};

export default function MembersPage() {
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

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["organizations", orgId, "members"],
    queryFn: () => listMembersApi(orgId!),
    enabled: !!orgId,
  });

  const canInvite = me?.permissions.includes("member:invite") ?? false;
  const canRemove = me?.permissions.includes("member:remove") ?? false;
  const canChangeRole =
    me?.permissions.includes("member:update_role") ?? false;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<InviteForm>({
    resolver: zodResolver(inviteSchema),
    mode: "onBlur",
  });

  const inviteMutation = useMutation({
    mutationFn: ({
      email,
      role,
    }: {
      email: string;
      role: OrganizationRole;
    }) => addMemberApi(orgId!, email, role),
    onSuccess: (member) => {
      queryClient.setQueryData<MemberResponse[]>(
        ["organizations", orgId, "members"],
        (prev) =>
          [...(prev ?? []), member].sort((a, b) =>
            a.email.localeCompare(b.email),
          ),
      );
      toast.success(`Invited ${member.email} as ${ROLE_LABELS[member.role]}`);
      reset();
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiError ? error.message : "Something went wrong",
      );
    },
  });

  const roleMutation = useMutation({
    mutationFn: ({
      memberId,
      role,
    }: {
      memberId: string;
      role: OrganizationRole;
    }) => updateMemberRoleApi(orgId!, memberId, role),
    onSuccess: (updated) => {
      queryClient.setQueryData<MemberResponse[]>(
        ["organizations", orgId, "members"],
        (prev) =>
          (prev ?? []).map((m) => (m.id === updated.id ? updated : m)),
      );
      toast.success(`Changed ${updated.email} to ${ROLE_LABELS[updated.role]}`);
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiError ? error.message : "Something went wrong",
      );
    },
  });

  const removeMutation = useMutation({
    mutationFn: (memberId: string) => removeMemberApi(orgId!, memberId),
    onSuccess: (_data, memberId) => {
      queryClient.setQueryData<MemberResponse[]>(
        ["organizations", orgId, "members"],
        (prev) => (prev ?? []).filter((m) => m.id !== memberId),
      );
      toast.success("Member removed");
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiError ? error.message : "Something went wrong",
      );
    },
  });

  const onInvite = handleSubmit((data) => {
    if (!orgId) return;
    inviteMutation.mutate({ email: data.email, role: data.role });
  });

  const onChangeRole = (member: MemberResponse, role: OrganizationRole) => {
    if (!orgId) return;
    startTransition(() => roleMutation.mutate({ memberId: member.id, role }));
  };

  const onRemove = (member: MemberResponse) => {
    if (!orgId) return;
    removeMutation.mutate(member.id);
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl">
        <p className="text-sm text-muted-foreground">Loading members…</p>
      </div>
    );
  }

  const pending = inviteMutation.isPending || removeMutation.isPending || roleMutation.isPending;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Members</h1>
        <p className="text-sm text-muted-foreground">
          Manage who has access to this organization.
        </p>
      </div>

      {canInvite && (
        <Card>
          <form onSubmit={onInvite}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="size-4" aria-hidden />
                Add a member
              </CardTitle>
              <CardDescription>
                The person must already have an account.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="colleague@clinic.org"
                    {...register("email")}
                    aria-invalid={!!errors.email}
                  />
                  {errors.email && (
                    <p className="text-xs text-destructive">
                      {errors.email.message}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <select
                    id="role"
                    {...register("role")}
                    className="flex h-8 rounded-lg border bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="doctor">Doctor</option>
                    <option value="nurse">Nurse</option>
                    <option value="admin">Admin</option>
                    <option value="staff">Staff</option>
                  </select>
                </div>
              </div>
              <Button type="submit" disabled={pending}>
                {pending ? "Adding…" : "Add member"}
              </Button>
            </CardContent>
          </form>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Team</CardTitle>
          <CardDescription>{members.length} members</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          {members.map((member, idx) => (
            <div key={member.id}>
              {idx > 0 && <Separator className="my-2" />}
              <div className="flex items-center justify-between py-2">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">
                    {member.full_name || member.email}
                    {member.full_name && (
                      <span className="ml-2 text-muted-foreground">
                        {member.email}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {ROLE_LABELS[member.role]} · {member.status}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {canChangeRole && member.role !== "owner" && (
                    <select
                      value={member.role}
                      onChange={(e) =>
                        onChangeRole(
                          member,
                          e.target.value as OrganizationRole,
                        )
                      }
                      disabled={pending}
                      className="h-7 rounded-md border bg-background px-2 text-xs"
                    >
                      <option value="staff">Staff</option>
                      <option value="nurse">Nurse</option>
                      <option value="doctor">Doctor</option>
                      <option value="admin">Admin</option>
                      <option value="owner">Owner</option>
                    </select>
                  )}
                  {canRemove && member.role !== "owner" && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={pending}
                      onClick={() => onRemove(member)}
                      aria-label={`Remove ${member.email}`}
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
          {members.length === 0 && (
            <p className="py-4 text-sm text-muted-foreground">
              No members yet.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
