import { z } from "zod";

const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Enter your email address")
  .email("That doesn't look like an email address");

/** Supabase's own default minimum. Checking it here turns a server round-trip
 *  into instant feedback. */
const newPassword = z.string().min(8, "Use at least 8 characters");

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password"),
});

export const signupSchema = z.object({
  email,
  password: newPassword,
});

export const magicLinkSchema = z.object({ email });

export const resetRequestSchema = z.object({ email });

export const newPasswordSchema = z
  .object({
    password: newPassword,
    confirm: z.string().min(1, "Confirm your password"),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Those passwords don't match",
    path: ["confirm"],
  });

export type LoginValues = z.infer<typeof loginSchema>;
export type SignupValues = z.infer<typeof signupSchema>;
export type MagicLinkValues = z.infer<typeof magicLinkSchema>;
export type ResetRequestValues = z.infer<typeof resetRequestSchema>;
export type NewPasswordValues = z.infer<typeof newPasswordSchema>;
