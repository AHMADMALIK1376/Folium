export type User = {
  id: string;
  name: string;
  email: string;
  created_at: string;
};

export type DocumentRow = {
  id: string;
  title: string;
  content: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
};

export type DocumentWithMeta = DocumentRow & {
  owner_name: string;
  owner_email: string;
  is_owner: boolean;
  shared_with?: { id: string; name: string; email: string }[];
};
