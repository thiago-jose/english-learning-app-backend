export interface UserProgress {
  userId: string;
  totalWords: number;
  wordsLearned: number;
  currentStreak: number;
  longestStreak: number;
  lastStudyDate?: Date;
  createdAt: Date;
  updatedAt?: Date;
}
