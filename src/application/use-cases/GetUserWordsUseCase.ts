import { Word } from '../../domain/entities/Word';
import { IWordRepository } from '../../domain/repositories/IWordRepository';

export interface GetUserWordsRequest {
  userId: string;
  forReview?: boolean;
  reviewDate?: Date;
}

export class GetUserWordsUseCase {
  constructor(private wordRepository: IWordRepository) {}

  async execute(request: GetUserWordsRequest): Promise<Word[]> {
    if (request.forReview) {
      return await this.wordRepository.findWordsForReview(
        request.userId,
        request.reviewDate || new Date()
      );
    }

    return await this.wordRepository.findByUserId(request.userId);
  }
}
