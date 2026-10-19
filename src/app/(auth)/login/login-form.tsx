"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { z } from "zod";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createClient } from "@/lib/supabase/browser";

const signInSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

const signUpSchema = z.object({
  full_name: z.string().trim().min(1, "Enter your name.").max(120),
  email: z.email("Enter a valid email address."),
  password: z
    .string()
    .min(8, "Use at least 8 characters.")
    .regex(/[A-Za-z]/, "Include at least one letter.")
    .regex(/\d/, "Include at least one number."),
});

const ERRORS: Record<string, string> = {
  inactive: "Your access has been revoked. Contact an administrator.",
  link: "That link is invalid or has expired. Sign in instead.",
};

export function LoginForm({ next, error }: { next: string; error?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [message, setMessage] = useState<string | null>(error ? (ERRORS[error] ?? null) : null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setNotice(null);
    const supabase = createClient();

    if (mode === "signin") {
      const parsed = signInSchema.safeParse({ email: email.trim().toLowerCase(), password });
      if (!parsed.success) return setMessage(parsed.error.issues[0].message);
      startTransition(async () => {
        const { error } = await supabase.auth.signInWithPassword(parsed.data);
        if (error) {
          setMessage(
            error.code === "email_not_confirmed"
              ? "Confirm your email address first (check your inbox)."
              : "Incorrect email or password.",
          );
          return;
        }
        router.replace(next);
        router.refresh();
      });
      return;
    }

    const parsed = signUpSchema.safeParse({ full_name: name, email: email.trim().toLowerCase(), password });
    if (!parsed.success) return setMessage(parsed.error.issues[0].message);
    startTransition(async () => {
      // Only the display name goes in user metadata; the role is assigned server-side (viewer).
      const { data, error } = await supabase.auth.signUp({
        email: parsed.data.email,
        password: parsed.data.password,
        options: {
          data: { full_name: parsed.data.full_name },
          emailRedirectTo: `${window.location.origin}/auth/confirm?next=/`,
        },
      });
      if (error) {
        setMessage(
          error.code === "user_already_exists"
            ? "An account with that email already exists. Sign in instead."
            : error.code === "weak_password"
              ? "That password is too weak. Use 8+ characters with letters and numbers."
              : error.message,
        );
        return;
      }
      if (!data.session) {
        setNotice("Check your inbox to confirm your email, then sign in.");
        setMode("signin");
        return;
      }
      router.replace(next);
      router.refresh();
    });
  }

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="text-xl">{mode === "signin" ? "Sign in" : "Create your account"}</CardTitle>
        <CardDescription>
          {mode === "signin"
            ? "Use your email and password."
            : "Any email works. New accounts can view tasks until an admin grants more access."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={mode} onValueChange={(v) => { setMode(v as typeof mode); setMessage(null); }}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="signin">Sign in</TabsTrigger>
            <TabsTrigger value="signup">Create account</TabsTrigger>
          </TabsList>
        </Tabs>

        {message && (
          <Alert variant="destructive">
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}
        {notice && (
          <Alert>
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={submit} className="space-y-4">
          {mode === "signup" && (
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} className="h-10" />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoFocus
              required
              placeholder="you@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-10"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={show ? "text" : "password"}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-10 pr-10"
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                aria-label={show ? "Hide password" : "Show password"}
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
              >
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {mode === "signup" && <p className="text-xs text-muted-foreground">At least 8 characters, with letters and numbers.</p>}
          </div>
          <Button type="submit" className="h-10 w-full" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            {mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
