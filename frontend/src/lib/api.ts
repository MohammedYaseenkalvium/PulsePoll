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
export const DEMO_TOKEN = 'demo-jwt-token-local';

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

const getDemoPolls = (): Poll[] => {
  const stored = localStorage.getItem('pulsepoll_demo_polls');
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      // Fallback
    }
  }
  const defaultPolls: Poll[] = [
    {
      id: 'demo-poll-1',
      question: 'Which real-time event streaming stack scales best?',
      description: 'Evaluating sub-millisecond Pub/Sub vs standard polling intervals.',
      options: [
        { id: 'opt-1', text: 'Redis Pub/Sub + SSE', voteCount: 68 },
        { id: 'opt-2', text: 'Node.js WebSockets', voteCount: 24 },
        { id: 'opt-3', text: 'Short Polling Interval', voteCount: 9 },
      ],
      status: 'open',
      allowMultiple: false,
      creatorId: 'demo-user-id-001',
      shareSlug: 'demo-realtime',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'demo-poll-2',
      question: 'Primary database for durable event logs?',
      description: 'Write latency vs query capability benchmarks.',
      options: [
        { id: 'opt-4', text: 'MongoDB Document Store', voteCount: 42 },
        { id: 'opt-5', text: 'PostgreSQL Relational DB', voteCount: 39 },
      ],
      status: 'open',
      allowMultiple: false,
      creatorId: 'demo-user-id-001',
      shareSlug: 'demo-database',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
  localStorage.setItem('pulsepoll_demo_polls', JSON.stringify(defaultPolls));
  return defaultPolls;
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

  getMe: async (): Promise<UserProfile> => {
    if (getStoredToken() === DEMO_TOKEN) {
      return {
        id: 'demo-user-id-001',
        email: 'demo@pulsepoll.dev',
        username: 'demo_creator',
      };
    }
    return request<UserProfile>('/auth/me');
  },

  // Creator Polls
  createPoll: async (payload: CreatePollInput): Promise<Poll> => {
    if (getStoredToken() === DEMO_TOKEN) {
      const current = getDemoPolls();
      const newPoll: Poll = {
        id: `demo-poll-${Date.now()}`,
        question: payload.question,
        description: payload.description,
        options: payload.options.map((o, idx) => ({
          id: `opt-${Date.now()}-${idx}`,
          text: o.text,
          voteCount: 0,
        })),
        status: 'open',
        allowMultiple: !!payload.allowMultiple,
        creatorId: 'demo-user-id-001',
        shareSlug: `demo-${Math.random().toString(36).substring(2, 7)}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem('pulsepoll_demo_polls', JSON.stringify([newPoll, ...current]));
      return newPoll;
    }
    return request<Poll>('/polls', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getMyPolls: async (): Promise<Poll[]> => {
    if (getStoredToken() === DEMO_TOKEN) {
      return getDemoPolls();
    }
    return request<Poll[]>('/polls');
  },

  updatePollStatus: async (id: string, status?: 'open' | 'closed'): Promise<{ message: string; status: string }> => {
    if (getStoredToken() === DEMO_TOKEN) {
      const current = getDemoPolls();
      const updated = current.map((p) => {
        if (p.id === id) {
          const nextStatus: 'open' | 'closed' = status || (p.status === 'open' ? 'closed' : 'open');
          return { ...p, status: nextStatus, updatedAt: new Date().toISOString() };
        }
        return p;
      });
      localStorage.setItem('pulsepoll_demo_polls', JSON.stringify(updated));
      return { message: 'Poll status updated', status: status || 'toggled' };
    }
    return request<{ message: string; status: string }>(`/polls/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify(status ? { status } : {}),
    });
  },

  deletePoll: async (id: string): Promise<{ message: string }> => {
    if (getStoredToken() === DEMO_TOKEN) {
      const current = getDemoPolls();
      const filtered = current.filter((p) => p.id !== id);
      localStorage.setItem('pulsepoll_demo_polls', JSON.stringify(filtered));
      return { message: 'Poll deleted' };
    }
    return request<{ message: string }>(`/polls/${id}`, {
      method: 'DELETE',
    });
  },

  // Public Polls & Voting
  getPollBySlug: async (shareSlug: string): Promise<Poll> => {
    if (getStoredToken() === DEMO_TOKEN) {
      const current = getDemoPolls();
      const found = current.find((p) => p.shareSlug === shareSlug);
      if (found) return found;
    }
    return request<Poll>(`/polls/s/${shareSlug}`);
  },

  getPollById: async (id: string): Promise<Poll> => {
    if (getStoredToken() === DEMO_TOKEN) {
      const current = getDemoPolls();
      const found = current.find((p) => p.id === id);
      if (found) return found;
    }
    return request<Poll>(`/polls/${id}`);
  },

  castVote: (pollId: string, payload: CastVotePayload): Promise<VoteResponse> =>
    request<VoteResponse>(`/polls/${pollId}/vote`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getStreamUrl: (pollId: string): string => `${BASE_URL}/polls/${pollId}/stream`,
};
