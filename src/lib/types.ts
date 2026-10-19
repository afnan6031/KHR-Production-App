export type Status = 'pending' | 'approved' | 'rejected';

export interface Profile {
  id: string;
  full_name: string;
  avatar_url: string;
  server_role: string;
  contact: string;
  note: string;
  status: Status;
  is_owner: boolean;
  created_at: string;
  decided_at: string | null;
  /** v9 */
  about: string;
  title: string;
  banner_url: string;
  prefs: Prefs;
}

/** v9: user ki apni pasand (har device par saath) */
export interface Prefs {
  lang?: 'ur' | 'en';
  bg?: { type: 'none' | 'color' | 'gradient' | 'image'; c1?: string; c2?: string; angle?: number; image?: string; dim?: number };
  accent?: string;
}

export interface MusicTrack {
  id: string;
  user_id: string;
  title: string;
  url: string;
  position: number;
  created_at: string;
}

export interface DeadlineRequest {
  id: string;
  task_id: string;
  user_id: string;
  minutes: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  decided_at: string | null;
  decided_by: string | null;
}

export interface Channel {
  id: string;
  name: string;
  about: string;
  schedule_type: 'daily' | 'days';
  work_days: number[];
  time_from: string | null;
  time_to: string | null;
  deadline: string | null;
  /** v3: har role ka apna waqt, e.g. { "Script Writer": { start: "09:00", end: "12:00" } } */
  role_times: Record<string, RoleTime>;
  created_at: string;
  updated_at: string;
}

export interface RoleTime {
  start: string;
  end: string;
  /** v9: deadline kitne din baad (0 = usi din) */
  days?: number;
}

export interface Member {
  channel_id: string;
  user_id: string;
  roles: string[];
}

export interface Perf {
  channel_id: string;
  user_id: string;
  role: string;
  rated_on: string;
  pct: number;
}

export interface ViewRow {
  channel_id: string;
  day: string;
  views: number;
}

export type Stage = 'idea' | 'script' | 'editing' | 'design' | 'review' | 'published';

export interface Video {
  id: string;
  channel_id: string;
  title: string;
  stage: Stage;
  due: string | null;
  script: string;
  notes: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  /** v9: video ka din, script ka link aur thumbnail */
  day: string;
  script_url: string;
  thumbnail_url: string;
  thumbnail_delete_url: string;
  task_id: string | null;
  /** v9: video file ka link (Gofile / Drive / YouTube) */
  video_url: string;
}

export interface Task {
  id: string;
  channel_id: string;
  user_id: string;
  role: string;
  day: string;
  due_at: string;
  status: 'pending' | 'done' | 'rejected';
  completed_at: string | null;
  rejected_at: string | null;
  rejected_reason: string;
  created_at: string;
  start_at: string | null;
  script_url: string;
  thumbnail_url: string;
  thumbnail_delete_url: string;
  attach_updated_by: string | null;
  attach_updated_at: string | null;
  /** v9: 'custom' = owner ka diya hua khaas kaam (apni date/time ke saath) */
  kind: 'daily' | 'custom';
  title: string;
  extended_minutes: number;
  assigned_by: string | null;
}

/** v3.1: channel ke din ki script / thumbnail (har din kitni bhi) */
export interface Attachment {
  id: string;
  channel_id: string;
  day: string;
  task_id: string | null;
  kind: 'script' | 'thumbnail';
  title: string;
  url: string;
  /** v4: script app ke andar likhi ho to us ka text */
  body: string;
  delete_url: string;
  created_by: string | null;
  created_at: string;
}

/** v4: channel ki baat-cheet */
export interface Message {
  id: string;
  channel_id: string;
  user_id: string | null;
  body: string;
  reply_to: string | null;
  created_at: string;
}

/** Screen par dikhne wali halat */
export type TaskState = 'pending' | 'expired' | 'done' | 'rejected';

export const ROLES =['Script Writer', 'Editor', 'Manager', 'Graphic Designer', 'Publisher', 'Voice Over'] as const;

export const STAGES: { key: Stage; label: string }[] = [
  { key: 'idea', label: 'Idea' },
  { key: 'script', label: 'Script' },
  { key: 'editing', label: 'Editing' },
  { key: 'design', label: 'Thumbnail / Design' },
  { key: 'review', label: 'Review' },
  { key: 'published', label: 'Published' }
];

/* ---------------- v5: KHR Server ---------------- */
export interface ServerChannel {
  id: string;
  name: string;
  topic: string;
  category: string;
  position: number;
  is_private: boolean;
  read_only: boolean;
  created_at: string;
}
export interface ServerChannelMember {
  channel_id: string;
  user_id: string;
}
export interface ServerMessage {
  id: string;
  channel_id: string;
  user_id: string | null;
  body: string;
  image_url: string;
  reply_to: string | null;
  created_at: string;
  edited_at?: string | null;
  pinned_at?: string | null;
  pinned_by?: string | null;
  fwd_from?: string | null;
}
export interface FriendRequest {
  id: string;
  from_user: string;
  to_user: string;
  status: 'pending' | 'accepted';
  created_at: string;
  responded_at: string | null;
}
export interface DirectMessage {
  id: string;
  from_user: string | null;
  to_user: string;
  body: string;
  image_url: string;
  read_at: string | null;
  created_at: string;
  edited_at?: string | null;
  pinned_at?: string | null;
  pinned_by?: string | null;
  fwd_from?: string | null;
}
