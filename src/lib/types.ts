export type QuestionType = 'true_false' | 'multiple_choice';

export type QuizQuestion = {
  id: string;
  quiz_id: string;
  question_type: QuestionType;
  prompt: string;
  points: number;
  time_limit_seconds: number;
  position: number;
  options: QuizOption[];
};

export type QuizOption = {
  id: string;
  question_id: string;
  label: string;
  is_correct: boolean;
  position: number;
};

export type Quiz = {
  id: string;
  title: string;
  description: string | null;
  created_by: string | null;
  is_published: boolean;
  questions: QuizQuestion[];
};

export type RoomState = {
  id: string;
  room_code: string;
  quiz_id: string;
  host_user_id?: string | null;
  host_name: string;
  status: 'lobby' | 'question' | 'reveal' | 'finished';
  current_question_index: number;
  started_at?: string | null;
  finished_at?: string | null;
  question_started_at?: string | null;
  questions: QuizQuestion[];
  players: Array<{ id: string; player_name: string; score: number }>;
  summary: {
    winner: { id: string; player_name: string; score: number } | null;
    player_count: number;
    answered_question_count: number;
    average_score: number;
  };
  question_history: Array<{
    question_id: string;
    prompt: string;
    position: number;
    total_answers: number;
    correct_answers: number;
    winner: { player_id: string; player_name: string; points_awarded: number; response_time_ms: number } | null;
  }>;
  current_result: {
    correct_option_id: string | null;
    correct_player_count: number;
    total_answers: number;
    winner: { player_id: string; player_name: string; points_awarded: number; response_time_ms: number } | null;
    option_stats: Array<{ option_id: string; label: string; picks: number; is_correct: boolean }>;
  } | null;
};
