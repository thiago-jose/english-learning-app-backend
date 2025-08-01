export enum WordDifficulty {
  BEGINNER = 'BEGINNER',
  INTERMEDIATE = 'INTERMEDIATE',
  ADVANCED = 'ADVANCED',
}

export interface Word {
  id: string;
  word: string;
  meaning: string;
  usageExample: string;
  pronunciation?: string;
  difficulty?: WordDifficulty;
  category?: string;
  nextReviewDate: Date;
  reviewCount?: number;
  correctCount?: number;
  userId: string;
  createdAt: Date;
  updatedAt?: Date;
}
