import { User } from '../../domain/entities/User';
import { IUserRepository } from '../../domain/repositories/IUserRepository';
import { components } from '../../types/api';

// Request/Response interfaces using OpenAPI types
export interface CreateUserRequest {
  id?: string;
  email: string;
  name: string;
}

export interface GetUserRequest {
  userId: string;
  requestingUserId: string; // for access control
}

export interface UpdateUserRequest {
  userId: string;
  requestingUserId: string;
  data: components['schemas']['UpdateUserRequest'];
}

export interface DeleteUserRequest {
  userId: string;
  requestingUserId: string;
}

export interface ListUsersRequest {
  requestingUserId: string;
  // Future: pagination, filters
}

// Response types based on OpenAPI schemas
export interface UserResponse {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeleteUserResponse {
  success: boolean;
  message: string;
}

export interface ListUsersResponse {
  users: UserResponse[];
  totalCount: number;
}

export class UserService {
  constructor(private userRepository: IUserRepository) {}

  async createUser(request: CreateUserRequest): Promise<UserResponse> {
    // Validate request
    this.validateCreateRequest(request);

    const existingUser = await this.userRepository.findByEmail(request.email);

    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    const user = new User({
      id: request.id,
      email: request.email,
      name: request.name,
    });

    const createdUser = await this.userRepository.create(user);
    return this.mapUserToResponse(createdUser);
  }

  async getUser(request: GetUserRequest): Promise<UserResponse> {
    // Validate access - users can only access their own data
    this.validateUserAccess(request.requestingUserId, request.userId);

    const user = await this.userRepository.findById(request.userId);

    if (!user) {
      throw new Error('User not found');
    }

    return this.mapUserToResponse(user);
  }

  async updateUser(request: UpdateUserRequest): Promise<UserResponse> {
    // Validate access - users can only update their own data
    this.validateUserAccess(request.requestingUserId, request.userId);

    const existingUser = await this.userRepository.findById(request.userId);
    if (!existingUser) {
      throw new Error('User not found');
    }

    // Check if email is being changed and if it already exists
    if (request.data.email && request.data.email !== existingUser.email) {
      const userWithEmail = await this.userRepository.findByEmail(request.data.email);
      if (userWithEmail && userWithEmail.id !== request.userId) {
        throw new Error('Email already in use by another user');
      }
    }

    // Create updated user using the static method
    const updatedUser = User.fromUpdate(existingUser, {
      ...request.data,
      id: request.userId, // Ensure ID doesn't change
    });

    const savedUser = await this.userRepository.update(updatedUser);
    return this.mapUserToResponse(savedUser);
  }

  async deleteUser(request: DeleteUserRequest): Promise<DeleteUserResponse> {
    // Validate access - users can only delete their own data
    this.validateUserAccess(request.requestingUserId, request.userId);

    const existingUser = await this.userRepository.findById(request.userId);
    if (!existingUser) {
      throw new Error('User not found');
    }

    await this.userRepository.delete(request.userId);

    return {
      success: true,
      message: 'User profile deleted successfully',
    };
  }

  async listUsers(request: ListUsersRequest): Promise<ListUsersResponse> {
    // TODO: In the future, this should be admin-only
    // For now, any authenticated user can list all users
    // Validate requesting user (for future admin checks)
    if (!request.requestingUserId) {
      throw new Error('Requesting user ID is required');
    }

    const users = await this.userRepository.findAll();

    const userResponses = users.map((user) => this.mapUserToResponse(user));

    return {
      users: userResponses,
      totalCount: users.length,
    };
  }

  // Utility methods
  async userExists(userId: string): Promise<boolean> {
    try {
      const user = await this.userRepository.findById(userId);
      return user !== null;
    } catch (error) {
      return false;
    }
  }

  async getUserByEmail(email: string): Promise<UserResponse | null> {
    const user = await this.userRepository.findByEmail(email);
    return user ? this.mapUserToResponse(user) : null;
  }

  // Private validation methods
  private validateCreateRequest(request: CreateUserRequest): void {
    if (!request.email || request.email.trim().length === 0) {
      throw new Error('Email is required');
    }

    if (!request.name || request.name.trim().length === 0) {
      throw new Error('Name is required');
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(request.email)) {
      throw new Error('Invalid email format');
    }

    // Name length validation
    if (request.name.length > 255) {
      throw new Error('Name is too long (max 255 characters)');
    }

    // Email length validation
    if (request.email.length > 255) {
      throw new Error('Email is too long (max 255 characters)');
    }
  }

  private validateUserAccess(requestingUserId: string, targetUserId: string): void {
    if (requestingUserId !== targetUserId) {
      throw new Error('Access denied. You can only access your own data.');
    }
  }

  private mapUserToResponse(user: User): UserResponse {
    const userJson = user.toJSON();
    return {
      id: userJson.id,
      email: userJson.email,
      name: userJson.name,
      createdAt: userJson.createdAt.toISOString(),
      updatedAt: userJson.updatedAt.toISOString(),
    };
  }
}
