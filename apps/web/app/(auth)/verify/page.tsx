import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MailCheck } from "lucide-react";

export default function VerifyEmailPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Verify your email</CardTitle>
        <CardDescription>
          We sent a verification link to your email address. Click the link
          to activate your account before signing in.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-3 py-6">
        <MailCheck className="size-10 text-muted-foreground" aria-hidden />
        <p className="text-center text-sm text-muted-foreground">
          Didn&apos;t receive an email? Check your spam folder, or sign up
          again with the same address to resend.
        </p>
      </CardContent>
      <CardFooter className="flex flex-col gap-3">
        <Button asChild className="w-full">
          <Link href="/login">Continue to sign in</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
