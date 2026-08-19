"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ApiErrorMessage } from "@/components/documents/ApiErrorMessage";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { createFolder, deleteFolder, renameFolder } from "@/lib/api/documents";
import type { Folder } from "@/lib/api/types";

/** Create, rename and delete folders.
 *
 * One dialog rather than three controls scattered through the sidebar:
 * managing folders is a thing you do occasionally and deliberately, and a rail
 * you navigate by should not carry an edit affordance per row.
 */
export function ManageFoldersDialog({ folders }: { folders: Folder[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label="Manage folders" title="Manage folders">
          +
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Folders</DialogTitle>
          <DialogDescription>
            Folders organise the documents you own. They do not change who can
            read them, and deleting one keeps its documents — they simply become
            unfiled.
          </DialogDescription>
        </DialogHeader>

        <CreateFolderForm onDone={() => router.refresh()} />

        {folders.length > 0 && (
          <ul className="mt-2 grid gap-1">
            {folders.map((folder) => (
              <FolderRow key={folder.id} folder={folder} onDone={() => router.refresh()} />
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CreateFolderForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || busy) return;

    setError(null);
    setBusy(true);
    try {
      await createFolder(trimmed);
      setName("");
      onDone();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-2">
      <div className="flex items-center gap-2">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="New folder"
          aria-label="New folder name"
          maxLength={80}
          disabled={busy}
        />
        <Button type="submit" disabled={busy || name.trim() === ""}>
          {busy ? "Adding…" : "Add"}
        </Button>
      </div>
      {error != null && (
        <ApiErrorMessage
          error={error}
          // 422 is almost always the duplicate-name constraint, and the server
          // says so better than anything written here.
          detailStatuses={[422]}
          fallback="Could not create the folder."
        />
      )}
    </form>
  );
}

function FolderRow({ folder, onDone }: { folder: Folder; onDone: () => void }) {
  const [name, setName] = useState(folder.name);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  // router.refresh() settles asynchronously, so without this the row would
  // re-enable while the stale list is still on screen.
  const [refreshing, startTransition] = useTransition();
  const disabled = busy || refreshing;

  const run = async (action: () => Promise<unknown>) => {
    setError(null);
    setBusy(true);
    try {
      await action();
      startTransition(onDone);
      setEditing(false);
      setConfirming(false);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (trimmed === folder.name) {
      setEditing(false);
      return;
    }
    void run(() => renameFolder(folder.id, trimmed));
  };

  return (
    <li className="grid gap-1 rounded-lg border border-neutral-200 px-3 py-2">
      {editing ? (
        <form onSubmit={save} className="flex items-center gap-2">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-label={`Rename ${folder.name}`}
            maxLength={80}
            disabled={disabled}
            autoFocus
          />
          <Button type="submit" size="sm" disabled={disabled || name.trim() === ""}>
            Save
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => {
              setName(folder.name);
              setEditing(false);
              setError(null);
            }}
          >
            Cancel
          </Button>
        </form>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="min-w-0 truncate text-sm text-neutral-900">
            {folder.name}
            <span className="ml-2 text-xs text-neutral-400">
              {folder.document_count === 1
                ? "1 document"
                : `${folder.document_count} documents`}
            </span>
          </span>
          {confirming ? (
            <span className="flex shrink-0 items-center gap-1">
              <Button
                variant="destructive"
                size="sm"
                disabled={disabled}
                onClick={() => void run(() => deleteFolder(folder.id))}
              >
                {disabled ? "Deleting…" : "Delete"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={disabled}
                onClick={() => setConfirming(false)}
              >
                Cancel
              </Button>
            </span>
          ) : (
            <span className="flex shrink-0 items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                Rename
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
                Delete
              </Button>
            </span>
          )}
        </div>
      )}
      {error != null && (
        <ApiErrorMessage
          error={error}
          detailStatuses={[422]}
          notFoundMessage="That folder is already gone."
          fallback="Could not update the folder."
        />
      )}
    </li>
  );
}
