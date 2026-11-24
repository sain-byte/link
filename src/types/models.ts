import { Timestamp } from 'firebase/firestore';

export interface ProjectItem {
  id: string;
  title: string;
  description: string;
  url: string;
  category: string;
  favorite?: boolean;
  hidden?: boolean;
  clicks: number;
  order: number;
  createdAt?: Timestamp | Date | null;
  updatedAt?: Timestamp | Date | null;
}

export interface CategoryItem {
  id: string;
  name: string;
  createdAt?: Timestamp | Date | null;
}

export interface CommentItem {
  id: string;
  clientId: string;
  name: string;
  message: string;
  replyToId: string;
  replyToName: string;
  replyToMessage: string;
  likes: number;
  pinned: boolean;
  createdAt?: Timestamp | Date | null;
  _optimistic?: boolean;
}

export interface VisitStats {
  total: number;
  today: number;
  lastVisit?: string;
}

export interface DailyAnalytic {
  id: string;
  date: string;
  visits: number;
  clicks: number;
}

export type CustomFieldType = 'text' | 'number' | 'date' | 'boolean';

export interface CustomField {
  id: string;
  name: string;
  type: CustomFieldType;
}

export interface CustomCollection {
  id: string;
  name: string;
  description: string;
  fields: CustomField[];
  createdAt?: Timestamp | Date | null;
}

export interface CustomCollectionItem {
  id: string;
  data: Record<string, string | number | boolean>;
  createdAt?: Timestamp | Date | null;
  updatedAt?: Timestamp | Date | null;
}

export type VaultItemType =
  | 'code'
  | 'note'
  | 'reminder'
  | 'doc'
  | 'vault'
  | 'media'
  | 'link'
  | 'contact';

export interface VaultItem {
  id: string;
  type: VaultItemType;
  title: string;
  tags: string[];
  content: string;
  dueDate?: string;
  done: boolean;
  storagePath?: string;
  downloadUrl?: string;
  driveFileId?: string;
  driveViewUrl?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  createdAt: number;
}
