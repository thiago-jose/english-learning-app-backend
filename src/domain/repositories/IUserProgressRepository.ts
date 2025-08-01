import { UserProgress } from '../entities/UserProgress';

export interface IUserProgressRepository {
  findByUserId(userId: string): Promise<UserProgress | null>;
  create(progress: Omit<UserProgress, 'createdAt'>): Promise<UserProgress>;
  update(userId: string, progress: Partial<UserProgress>): Promise<UserProgress>;
}
