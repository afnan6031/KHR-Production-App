export type Status = 'pending' | 'approved' | 'rejected';

export interface Profile {
  id: string;
  full_name: string;
  contact: string;
  note: string;
  status: Status;
  is_owner: boolean;
  created_at: string;
  decided_at: string | null;
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
  created_at: string;
  updated_at: string;
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
