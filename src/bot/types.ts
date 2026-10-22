import { QuizQuestion } from '../services/gemini.js';

export interface QuizAttemptRecord {
  question: string;
  topic?: string;
  options: string[];
  selectedIndex: number;
  correctIndex: number;
  isCorrect: boolean;
  userAnswerText: string;
  correctAnswerText: string;
  explanation: string;
}

export interface UserSessionState {
<<<<<<< HEAD
  state?: 'idle' | 'waiting_group_code' | 'waiting_group_access_code' | 'taking_test' | 'waiting_admin_password' | 'chatting_with_gemini' | 'chatting_with_ai_tutor';
=======
  state?: 'idle' | 'waiting_group_code' | 'taking_test' | 'waiting_review_text' | 'chatting_with_gemini' | 'chatting_with_ai_tutor';
>>>>>>> 07fdc2e58bb854a8546a4074ba62abe31462e601
  selectedGroupId?: number;
  selectedStudentId?: number;
  isAdmin?: boolean;
  activeStudyTopicNumber?: number;
  activeStudyQuestion?: string;
  activeStudyQuestionType?: 'topic' | 'review' | 'check';
  activeStudyReviewTopicNumber?: number;
  testQuestions?: QuizQuestion[];
  testCurrentIndex?: number;
  testScore?: number;
  isDailyTest?: boolean;
  testAttempts?: QuizAttemptRecord[];
  lastQuizAttempts?: QuizAttemptRecord[];
  lastQuizLevelTitle?: string;
  lastQuizScore?: number;
  lastQuizTotal?: number;
  lastQuizPercentage?: number;
  lastQuizComment?: string;
}
