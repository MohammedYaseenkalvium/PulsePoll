export interface UserProfile {
  id: string;
  email: string;
  username: string;
}

export interface AuthResponse {
  token: string;
  user: UserProfile;
}

export interface PollOption {
  id: string;
  text: string;
  voteCount: number;
}

export interface Poll {
  id: string;
  question: string;
  description?: string;
  options: PollOption[];
  status: 'open' | 'closed';
  allowMultiple: boolean;
  creatorId: string;
  shareSlug: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOptionInput {
  text: string;
}

export interface CreatePollInput {
  question: string;
  description?: string;
  options: CreateOptionInput[];
  allowMultiple?: boolean;
}

export interface CastVotePayload {
  optionIds: string[];
  voterFingerprint: string;
}

export interface VoteResponse {
  message: string;
  pollId: string;
  optionCounts: Record<string, number>;
  totalVotes: number;
  timestamp: number;
}

export class ApiError extends Error {
  status: number;
  details?: string;

  constructor(message: string, status: number, details?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

const BASE_URL = import.meta.env.VITE_API_URL || '/api';

export const getStoredToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('pulsepoll_token');
};

export const setStoredToken = (token: string | null): void => {
  if (typeof window === 'undefined') return;
  if (token) {
    localStorage.setItem('pulsepoll_token', token);
  } else {
    localStorage.removeItem('pulsepoll_token');
  }
};

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${BASE_URL}${endpoint}`;
  const token = getStoredToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorMessage = `HTTP Error ${response.status}`;
    let errorDetails: string | undefined;

    try {
      const errorJson = await response.json();
      if (errorJson.error) {
        errorMessage = errorJson.error;
      }
      if (errorJson.details) {
        errorDetails = errorJson.details;
      }
    } catch {
      // Body is not JSON
    }

    throw new ApiError(errorMessage, response.status, errorDetails);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

export const api = {
  // Auth
  register: (payload: { email: string; username: string; password: string }): Promise<AuthResponse> =>
    request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  login: (payload: { email: string; password: string }): Promise<AuthResponse> =>
    request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getMe: (): Promise<UserProfile> => request<UserProfile>('/auth/me'),

  // Creator Polls
  createPoll: (payload: CreatePollInput): Promise<Poll> =>
    request<Poll>('/polls', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getMyPolls: (): Promise<Poll[]> => request<Poll[]>('/polls'),

  updatePollStatus: (id: string, status?: 'open' | 'closed'): Promise<{ message: string; status: string }> =>
    request<{ message: string; status: string }>(`/polls/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify(status ? { status } : {}),
    }),

  deletePoll: (id: string): Promise<{ message: string }> =>
    request<{ message: string }>(`/polls/${id}`, {
      method: 'DELETE',
    }),

  // Public Polls & Voting
  getPollBySlug: (shareSlug: string): Promise<Poll> => request<Poll>(`/polls/s/${shareSlug}`),

  getPollById: (id: string): Promise<Poll> => request<Poll>(`/polls/${id}`),

  castVote: (pollId: string, payload: CastVotePayload): Promise<VoteResponse> =>
    request<VoteResponse>(`/polls/${pollId}/vote`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getStreamUrl: (pollId: string): string => `${BASE_URL}/polls/${pollId}/stream`,
};
