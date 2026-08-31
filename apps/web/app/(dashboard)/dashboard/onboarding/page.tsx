"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Building2 } from "lucide-react";
import { toast } from "sonner";

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
import { createOrganizationApi } from "@/lib/api/client-auth";

const orgSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(200),
});

type OrgForm = z.infer<typeof orgSchema>;

export default function OnboardingPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<OrgForm>({
    resolver: zodResolver(orgSchema),
    mode: "onBlur",
  });

  const onSubmit = handleSubmit((data) => {
    startTransition(async () => {
      try {
        await createOrganizationApi(data.name);
        toast.success("Organization created");
        router.push("/dashboard");
        router.refresh();
      } catch (error) {
        const message =
          error instanceof ApiError ? error.message : "Something went wrong";
        toast.error(message);
      }
    });
  });

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Create your organization
        </h1>
        <p className="text-sm text-muted-foreground">
          You will be the owner of this organization and can invite team
          members afterwards.
        </p>
      </div>

      <Card>
        <form onSubmit={onSubmit}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="size-4" aria-hidden />
              Organization details
            </CardTitle>
            <CardDescription>
              Choose a name for your clinic or practice.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Organization name</Label>
              <Input
                id="name"
                type="text"
                autoFocus
                placeholder="e.g. Riverside Family Practice"
                {...register("name")}
                aria-invalid={!!errors.name}
              />
              {errors.name && (
                <p className="text-xs text-destructive">
                  {errors.name.message}
                </p>
              )}
            </div>
          </CardContent>
          <CardContent>
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? "Creating…" : "Create organization"}
            </Button>
          </CardContent>
        </form>
      </Card>
    </div>
  );
}
