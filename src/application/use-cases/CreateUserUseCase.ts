import { User } from '../../domain/entities/User';
import { IUserRepository } from '../../domain/repositories/IUserRepository';

interface CreateUserDTO {
  email: string;
  name: string;
}

export class CreateUserUseCase {
  constructor(private userRepository: IUserRepository) {}

  async execute(data: CreateUserDTO): Promise<User> {
    const existingUser = await this.userRepository.findByEmail(data.email);
    
    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    const user = new User({
      email: data.email,
      name: data.name,
    });

    return this.userRepository.create(user);
  }
} 