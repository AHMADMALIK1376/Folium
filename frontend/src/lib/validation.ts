import { z } from "zod";

export const createDocumentSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200).optional(),
});

export const updateDocumentSchema = z
  .object({
    title: z.string().trim().min(1, "Title cannot be empty").max(200).optional(),
    content: z.string().max(2_000_000, "Document is too large").optional(),
  })
  .refine((data) => data.title !== undefined || data.content !== undefined, {
    message: "Provide at least one of title or content",
  });

export const shareDocumentSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
});

export const loginSchema = z.object({
  userId: z.string().min(1),
});
